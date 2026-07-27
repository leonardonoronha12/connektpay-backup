import 'server-only'

import crypto from 'crypto'
import { getOrganizationOwnerProfileId } from '@/lib/audit-actor'
import { insertAuditLog } from '@/lib/audit-log'
import { mapAnticipationStatus } from '@/lib/anticipation-core'
import { handleAnticipationWebhook } from '@/lib/anticipation-service'
import { sendTransactionalEmail } from '@/lib/email-service'
import { appendLedgerEntryAdmin } from '@/lib/ledger-admin'
import { normalizeReceiverProviderState, safeTrim } from '@/lib/receiver-sync-core'
import { mapPayoutStatusFromEventType } from '@/lib/payout-core'
import { calculateSplitForProvider, ensurePayLedgerFromSplitOnce, markPayTransacaoProviderSuccess, persistSplitSnapshot } from '@/lib/split-service'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { applyDunningOnFailure, ensureRecurringChargeSnapshot, markRecurringChargePaid } from '@/lib/subscription-service'
import { getFinancialEnvironment } from '@/lib/env'
import { mapTransactionStatus } from '@/lib/webhook-status'

export { mapTransactionStatus } from '@/lib/webhook-status'

type IncomingWebhook = {
  id?: string
  type: string
  data?: any
}

function mapSubscriptionStatus(type: string): string | null {
  if (type === 'subscription.created') return 'pending'
  if (type === 'subscription.paid') return 'active'
  if (type === 'subscription.failed') return 'past_due'
  if (type === 'subscription.canceled') return 'canceled'
  return null
}

function mapPayoutStatus(type: string): string | null {
  return mapPayoutStatusFromEventType(type)
}

function extractPaymentLinkCorrelationCode(payload: any) {
  if (typeof payload?.metadata?.payment_link_id === 'string') return payload.metadata.payment_link_id
  if (typeof payload?.code === 'string') return payload.code
  return null
}

function extractProviderMetadata(payload: any) {
  const candidates = [
    payload?.metadata,
    payload?.charges?.[0]?.metadata,
    payload?.last_transaction?.metadata,
    payload?.charges?.[0]?.last_transaction?.metadata,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>
    }
  }
  return {}
}

function extractProviderOrderId(body: IncomingWebhook, payload: any) {
  if (typeof payload?.order_id === 'string') return payload.order_id
  if (typeof payload?.charges?.[0]?.order_id === 'string') return payload.charges[0].order_id
  if (String(body.type).startsWith('order.') && typeof payload?.id === 'string') return payload.id
  return null
}

function extractProviderChargeId(body: IncomingWebhook, payload: any) {
  if (typeof payload?.charge_id === 'string') return payload.charge_id
  if (typeof payload?.charges?.[0]?.id === 'string') return payload.charges[0].id
  if (String(body.type).startsWith('charge.') && typeof payload?.id === 'string') return payload.id
  return null
}

function extractProviderReference(payload: any) {
  return (
    (typeof payload?.charges?.[0]?.last_transaction?.id === 'string' && payload.charges[0].last_transaction.id) ||
    (typeof payload?.last_transaction?.id === 'string' && payload.last_transaction.id) ||
    (typeof payload?.transaction_id === 'string' && payload.transaction_id) ||
    (typeof payload?.id === 'string' && payload.id) ||
    null
  )
}

function extractProviderRecipientId(payload: any) {
  return (
    (typeof payload?.recipient_id === 'string' && payload.recipient_id) ||
    (typeof payload?.recipient?.id === 'string' && payload.recipient.id) ||
    (typeof payload?.id === 'string' &&
    (String(payload?.object ?? '').toLowerCase() === 'recipient' || String(payload?.type ?? '').toLowerCase() === 'recipient')
      ? payload.id
      : null) ||
    null
  )
}

function isReceiverWebhookEvent(type: string) {
  const normalized = String(type).toLowerCase()
  return normalized.includes('recipient') || normalized.includes('receiver')
}

function normalizeWebhookMethod(payload: any, fallbackMethods?: Record<string, unknown> | null): 'pix' | 'card' {
  const raw = String(payload?.charges?.[0]?.payment_method ?? payload?.payment_method ?? '').trim().toLowerCase()
  if (raw === 'pix') return 'pix'
  if (raw === 'credit_card' || raw === 'card') return 'card'
  if (fallbackMethods?.pix === true && fallbackMethods?.card !== true) return 'pix'
  return 'card'
}

async function ensureLedgerEntryOnce(input: {
  organizationId: string
  transactionId?: string | null
  payoutId?: string | null
  anticipationRequestId?: string | null
  type: string
  direction: 'credit' | 'debit'
  amount: number
  origin: string
  occurredAt?: string
}) {
  const supabase = getSupabaseAdminClient()
  if (input.transactionId) {
    const { data } = await supabase
      .from('ledger_entries')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('transaction_id', input.transactionId)
      .eq('type', input.type)
      .limit(1)
      .maybeSingle()
    if (data?.id) return
  }
  if (input.payoutId) {
    const { data } = await supabase
      .from('ledger_entries')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('payout_id', input.payoutId)
      .eq('type', input.type)
      .limit(1)
      .maybeSingle()
    if (data?.id) return
  }
  if (input.anticipationRequestId) {
    const { data } = await supabase
      .from('ledger_entries')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('anticipation_request_id', input.anticipationRequestId)
      .eq('type', input.type)
      .limit(1)
      .maybeSingle()
    if (data?.id) return
  }

  await appendLedgerEntryAdmin({
    organizationId: input.organizationId,
    transactionId: input.transactionId ?? null,
    payoutId: input.payoutId ?? null,
    anticipationRequestId: input.anticipationRequestId ?? null,
    type: input.type,
    direction: input.direction,
    amount: input.amount,
    origin: input.origin,
    occurredAt: input.occurredAt,
  })
}

export async function processWebhookEventById(eventId: string) {
  const supabase = getSupabaseAdminClient()
  const { data: ev, error } = await supabase.from('webhook_events').select('*').eq('id', eventId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!ev) return { ok: true, skipped: true }
  return processWebhookEventRow(ev as any)
}

export async function processWebhookEventRow(event: {
  id: string
  organization_id: string
  type: string
  status: string
  attempts: number
  payload: any
  provider_event_id?: string | null
  provider?: string | null
  provider_environment?: string | null
}) {
  const supabase = getSupabaseAdminClient()

  const nextAttempt = (event.attempts ?? 0) + 1
  const startedAt = Date.now()
  await supabase.from('webhook_events').update({ status: 'processing', attempts: nextAttempt, last_error: null, next_retry_at: null }).eq('id', event.id)

  try {
    const body = (event.payload ?? {}) as IncomingWebhook
    const payload = body.data ?? {}
    const meta = extractProviderMetadata(payload)
    const providerEventId = (event as any).provider_event_id ? String((event as any).provider_event_id) : typeof body.id === 'string' ? body.id : typeof payload?.event_id === 'string' ? payload.event_id : null
    const runtime = getFinancialEnvironment()
    const eventProvider = typeof event.provider === 'string' && event.provider.trim() ? event.provider.trim() : runtime.providerId
    const eventProviderEnvironment =
      typeof event.provider_environment === 'string' && event.provider_environment.trim() ? event.provider_environment.trim() : runtime.environment

    if (eventProvider !== runtime.providerId) {
      throw new Error('Webhook registrado para provedor incompatível com este deployment.')
    }
    if (eventProviderEnvironment !== runtime.environment) {
      throw new Error('Webhook registrado para ambiente financeiro incompatível com este deployment.')
    }

    const transactionId =
      typeof meta.internal_transaction_id === 'string'
        ? meta.internal_transaction_id
        : typeof meta.transaction_id === 'string'
          ? meta.transaction_id
          : null
    const providerOrderId = extractProviderOrderId(body, payload)
    const providerChargeId = extractProviderChargeId(body, payload)
    const providerPaymentId = extractProviderReference(payload)
    const paymentLinkCorrelationCode =
      typeof meta.internal_payment_link_id === 'string'
        ? meta.internal_payment_link_id
        : typeof meta.payment_link_id === 'string'
          ? meta.payment_link_id
          : extractPaymentLinkCorrelationCode(payload)
    const providerSubscriptionId =
      typeof meta.subscription_id === 'string' ? meta.subscription_id : typeof payload?.subscription_id === 'string' ? payload.subscription_id : String(body.type).startsWith('subscription.') && typeof payload?.id === 'string' ? payload.id : null
    const providerPayoutId = typeof meta.payout_id === 'string' ? meta.payout_id : String(body.type).startsWith('payout.') && typeof payload?.id === 'string' ? payload.id : null
    const providerAnticipationId =
      typeof payload?.anticipation_id === 'string'
        ? payload.anticipation_id
        : String(body.type).startsWith('anticipation.') && typeof payload?.id === 'string'
          ? payload.id
          : null
    const anticipationIdFromMeta = typeof meta.anticipation_id === 'string' ? meta.anticipation_id : null
    const providerRecipientId = extractProviderRecipientId(payload)
    const internalReceiverId =
      typeof meta.internal_receiver_id === 'string'
        ? meta.internal_receiver_id
        : typeof meta.receiver_id === 'string'
          ? meta.receiver_id
          : null

    let tx: any = null
    if (transactionId) {
      const { data } = await supabase
        .from('transactions')
        .select('id, organization_id, amount, status, provider, provider_environment, provider_reference, provider_order_id, provider_charge_id, payment_link_id')
        .eq('id', transactionId)
        .maybeSingle()
      tx = data
    } else if (providerOrderId) {
      const { data } = await supabase
        .from('transactions')
        .select('id, organization_id, amount, status, provider, provider_environment, provider_reference, provider_order_id, provider_charge_id, payment_link_id')
        .eq('provider', eventProvider)
        .eq('provider_environment', eventProviderEnvironment)
        .eq('provider_order_id', providerOrderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      tx = data
    } else if (providerChargeId) {
      const { data } = await supabase
        .from('transactions')
        .select('id, organization_id, amount, status, provider, provider_environment, provider_reference, provider_order_id, provider_charge_id, payment_link_id')
        .eq('provider', eventProvider)
        .eq('provider_environment', eventProviderEnvironment)
        .eq('provider_charge_id', providerChargeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      tx = data
    } else if (providerPaymentId) {
      const { data } = await supabase
        .from('transactions')
        .select('id, organization_id, amount, status, provider, provider_environment, provider_reference, provider_order_id, provider_charge_id, payment_link_id')
        .eq('provider', eventProvider)
        .eq('provider_environment', eventProviderEnvironment)
        .eq('provider_reference', providerPaymentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      tx = data
    }

    let paymentLink: any = null
    if (paymentLinkCorrelationCode) {
      const byId = await supabase
        .from('payment_links')
        .select('id, organization_id, amount, currency, methods, slug, provider_reference')
        .eq('organization_id', event.organization_id)
        .eq('id', paymentLinkCorrelationCode)
        .maybeSingle()
      paymentLink = byId.data
      if (!paymentLink) {
        const bySlug = await supabase
          .from('payment_links')
          .select('id, organization_id, amount, currency, methods, slug, provider_reference')
          .eq('organization_id', event.organization_id)
          .eq('slug', paymentLinkCorrelationCode)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        paymentLink = bySlug.data
      }
      if (!paymentLink) {
        const byProviderReference = await supabase
          .from('payment_links')
          .select('id, organization_id, amount, currency, methods, slug, provider_reference')
          .eq('organization_id', event.organization_id)
          .eq('provider_reference', paymentLinkCorrelationCode)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        paymentLink = byProviderReference.data
      }
    }

    const assinaturaId = typeof meta.assinatura_id === 'string' ? meta.assinatura_id : null
    let assinatura: any = null
    if (assinaturaId) {
      const { data } = await supabase
        .from('pay_assinatura')
        .select('id, organization_id, plano_id, recebedor_id, status, attempts_failed, acquirer_subscription_id, provider, provider_environment')
        .eq('id', assinaturaId)
        .maybeSingle()
      assinatura = data
    } else if (providerSubscriptionId) {
      const { data } = await supabase
        .from('pay_assinatura')
        .select('id, organization_id, plano_id, recebedor_id, status, attempts_failed, acquirer_subscription_id, provider, provider_environment')
        .eq('provider', eventProvider)
        .eq('provider_environment', eventProviderEnvironment)
        .eq('acquirer_subscription_id', providerSubscriptionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      assinatura = data
    }

    let receiver: any = null
    if (internalReceiverId) {
      const { data } = await supabase
        .from('receivers')
        .select('id, organization_id, provider, provider_environment, provider_receiver_id, provider_reference')
        .eq('organization_id', event.organization_id)
        .eq('id', internalReceiverId)
        .maybeSingle()
      receiver = data
    } else if (providerRecipientId) {
      const { data } = await supabase
        .from('receivers')
        .select('id, organization_id, provider, provider_environment, provider_receiver_id, provider_reference')
        .eq('organization_id', event.organization_id)
        .eq('provider', eventProvider)
        .eq('provider_environment', eventProviderEnvironment)
        .or(`provider_receiver_id.eq.${providerRecipientId},provider_reference.eq.${providerRecipientId}`)
        .limit(1)
        .maybeSingle()
      receiver = data
    }

    if (receiver?.id && isReceiverWebhookEvent(body.type)) {
      const receiverState = normalizeReceiverProviderState(payload)
      await supabase
        .from('receivers')
        .update({
          provider: eventProvider,
          provider_environment: eventProviderEnvironment,
          provider_receiver_id: receiverState.providerReceiverId ?? safeTrim((receiver as any).provider_receiver_id),
          provider_reference: receiverState.providerReference ?? safeTrim((receiver as any).provider_reference),
          provider_status: receiverState.providerStatus,
          external_status: receiverState.externalStatus,
          provider_request_id: receiverState.requestId,
          provider_synced_at: new Date().toISOString(),
          kyc_status: receiverState.kycStatus,
          status: receiverState.operationalStatus,
          provider_last_error: null,
          provider_last_error_at: null,
        })
        .eq('organization_id', event.organization_id)
        .eq('id', receiver.id as string)

      await supabase
        .from('kyc_requests')
        .update({
          provider_status: receiverState.providerStatus,
          provider_last_error: null,
          provider_last_error_at: null,
        })
        .eq('organization_id', event.organization_id)
        .eq('receiver_id', receiver.id as string)
        .in('status', ['pending', 'under_review'])

      await supabase.from('webhook_events').update({ status: 'processed', last_error: null, processed_at: new Date().toISOString() }).eq('id', event.id)
      await supabase.from('webhook_attempts').insert({
        organization_id: event.organization_id,
        webhook_event_id: event.id,
        attempt: nextAttempt,
        status: 'processed',
        error: null,
        duration_ms: Date.now() - startedAt,
      })
      return { ok: true, receiverId: receiver.id as string }
    }

    const nextStatus = mapTransactionStatus(body.type)

    if (!tx && paymentLink?.id && providerPaymentId && nextStatus) {
      const amount = Number(payload?.amount ?? paymentLink.amount ?? 0)
      if (Number.isFinite(amount) && amount > 0) {
        const insertedTx = await supabase
          .from('transactions')
          .insert({
            organization_id: paymentLink.organization_id,
            customer_id: null,
            payment_link_id: paymentLink.id,
            amount,
            currency: typeof payload?.currency === 'string' ? payload.currency : paymentLink.currency ?? 'BRL',
            method: normalizeWebhookMethod(payload, paymentLink.methods ?? null),
            status: nextStatus,
            provider: eventProvider,
            provider_environment: eventProviderEnvironment,
            provider_reference: providerPaymentId,
            provider_payload: body,
            public_token: crypto.randomUUID(),
          })
          .select('id, organization_id, amount, status, provider_reference, payment_link_id')
          .single()

        if (!insertedTx.error) {
          tx = insertedTx.data
          try {
            const { split, providerSplit } = await calculateSplitForProvider(supabase, {
              organizationId: paymentLink.organization_id as string,
              paymentLinkId: paymentLink.id as string,
              grossAmount: amount,
            })
            await persistSplitSnapshot({
              supabase,
              transactionId: tx.id as string,
              organizationId: paymentLink.organization_id as string,
              paymentLinkId: paymentLink.id as string,
              currency: 'BRL',
              split,
              providerSplit,
            })
            await markPayTransacaoProviderSuccess({
              supabase,
              transactionId: tx.id as string,
              providerReference: providerPaymentId,
              providerPayload: body,
              status: nextStatus,
            })
          } catch {
            // Split snapshot is best-effort here; the hosted checkout can be paid
            // even when the org still lacks split/default receiver configuration.
          }
          try {
            const ownerProfileId = await getOrganizationOwnerProfileId(paymentLink.organization_id as string)
            await insertAuditLog({
              organizationId: paymentLink.organization_id as string,
              actorProfileId: ownerProfileId,
              actorUserId: null,
              authType: 'api_key',
              origin: 'public_api',
              action: 'CREATE',
              entity: 'transaction',
              entityId: tx.id as string,
              before: null,
              after: {
                id: tx.id,
                amount,
                currency: typeof payload?.currency === 'string' ? payload.currency : paymentLink.currency ?? 'BRL',
                method: normalizeWebhookMethod(payload, paymentLink.methods ?? null),
                status: nextStatus,
                provider_reference: providerPaymentId,
                payment_link_id: paymentLink.id,
              },
            })
          } catch {
          }
        }
      }
    }

    if (!tx) {
      if (!providerSubscriptionId && !providerPayoutId && !providerAnticipationId) {
        await supabase.from('webhook_events').update({ status: 'processed', last_error: null, processed_at: new Date().toISOString() }).eq('id', event.id)
        await supabase.from('webhook_attempts').insert({
          organization_id: event.organization_id,
          webhook_event_id: event.id,
          attempt: nextAttempt,
          status: 'processed',
          error: null,
          duration_ms: Date.now() - startedAt,
        })
        return { ok: true, skipped: true }
      }
    }

    const organizationId = (tx?.organization_id as string | undefined) ?? (paymentLink?.organization_id as string | undefined) ?? (event.organization_id as string)
    if (nextStatus) {
      const pixTransaction = payload?.charges?.[0]?.last_transaction ?? payload?.last_transaction ?? {}
      const normalizedProviderPayload = {
        id: providerPaymentId ?? tx?.provider_reference ?? null,
        status: nextStatus,
        providerPaymentId: providerPaymentId ?? tx?.provider_reference ?? null,
        providerReference: providerPaymentId ?? tx?.provider_reference ?? null,
        providerOrderId: providerOrderId ?? tx?.provider_order_id ?? null,
        providerChargeId: providerChargeId ?? tx?.provider_charge_id ?? null,
        amount: Number(payload?.amount ?? tx?.amount ?? 0),
        currency: typeof payload?.currency === 'string' ? payload.currency : 'BRL',
        createdAt:
          typeof pixTransaction?.created_at === 'string'
            ? pixTransaction.created_at
            : typeof payload?.created_at === 'string'
              ? payload.created_at
              : null,
        pix:
          normalizeWebhookMethod(payload, paymentLink?.methods ?? null) === 'pix'
            ? {
                qrCode: typeof pixTransaction?.qr_code === 'string' ? pixTransaction.qr_code : null,
                qrCodeUrl: typeof pixTransaction?.qr_code_url === 'string' ? pixTransaction.qr_code_url : null,
                qrCodeBase64: typeof pixTransaction?.qr_code_base64 === 'string' ? pixTransaction.qr_code_base64 : null,
                copyPaste:
                  typeof pixTransaction?.copy_paste === 'string'
                    ? pixTransaction.copy_paste
                    : typeof pixTransaction?.qr_code === 'string'
                      ? pixTransaction.qr_code
                      : null,
                expiresAt: typeof pixTransaction?.expires_at === 'string' ? pixTransaction.expires_at : null,
              }
            : null,
        raw: body,
      }

      await supabase
        .from('transactions')
        .update({
          status: nextStatus,
          provider: eventProvider,
          provider_environment: eventProviderEnvironment,
          provider_reference: providerPaymentId ?? tx?.provider_reference ?? null,
          provider_order_id: providerOrderId ?? tx?.provider_order_id ?? null,
          provider_charge_id: providerChargeId ?? tx?.provider_charge_id ?? null,
          provider_payload: normalizedProviderPayload,
          provider_error_code: null,
          provider_error_message: null,
        })
        .eq('id', tx.id)
      await supabase
        .from('pay_transacao')
        .update({
          status: nextStatus,
          provider: eventProvider,
          provider_environment: eventProviderEnvironment,
          provider_reference: providerPaymentId ?? tx?.provider_reference ?? null,
          provider_order_id: providerOrderId ?? tx?.provider_order_id ?? null,
          provider_charge_id: providerChargeId ?? tx?.provider_charge_id ?? null,
          provider_payload: normalizedProviderPayload,
          provider_error_code: null,
          provider_error_message: null,
          provider_last_error: null,
          provider_last_error_at: null,
        })
        .eq('transaction_id', tx.id)
    }

    const nextSubStatus = mapSubscriptionStatus(body.type)
    if (nextSubStatus && assinatura?.id) {
      const updates: Record<string, unknown> = { status: nextSubStatus, provider: eventProvider, provider_environment: eventProviderEnvironment }
      if (nextSubStatus === 'canceled') updates.canceled_at = new Date().toISOString()
      await supabase.from('pay_assinatura').update(updates).eq('id', assinatura.id as string)
      await supabase.from('pay_subscription_events').insert({
        organization_id: organizationId,
        assinatura_id: assinatura.id,
        provider: eventProvider,
        provider_environment: eventProviderEnvironment,
        provider_event_id: providerEventId,
        event_type: body.type,
        payload: body,
      })
    }

    const amount = Number(tx.amount ?? 0)
    if (body.type === 'payment.paid' || body.type === 'order.paid') {
      await ensureLedgerEntryOnce({
        organizationId,
        transactionId: tx.id,
        type: 'sale',
        direction: 'credit',
        amount,
        origin: 'webhook',
      })
      await ensurePayLedgerFromSplitOnce({ organizationId, transactionId: tx.id as string })
    }

    if (tx?.id && (body.type === 'payment.paid' || body.type === 'payment.approved' || body.type === 'payment.failed' || body.type === 'order.paid' || body.type === 'order.payment_failed')) {
      try {
        const { data: txRow } = await supabase
          .from('transactions')
          .select('id, customer:customers(email)')
          .eq('id', tx.id)
          .maybeSingle()
        const email = typeof (txRow as any)?.customer?.email === 'string' ? String((txRow as any).customer.email) : null
        if (email) {
          await sendTransactionalEmail({
            organizationId,
            to: email,
            template: body.type === 'payment.failed' || body.type === 'order.payment_failed' ? 'payment.failed' : 'payment.approved',
            data: { transaction_id: tx.id, status: body.type },
          })
        }
      } catch {
      }
    }

    if ((body.type === 'recurring.charge.paid' || body.type === 'recurring.charge.failed') && assinatura?.id && providerPaymentId) {
      const { data: plan } = await supabase
        .from('pay_plano')
        .select('id, amount_centavos, payment_link_id, cycle')
        .eq('organization_id', organizationId)
        .eq('id', assinatura.plano_id as string)
        .maybeSingle()
      const amountCents = Number(payload?.total ?? payload?.value ?? (plan as any)?.amount_centavos ?? 0)
      const occurredAt = typeof payload?.paidAt === 'string' ? payload.paidAt : typeof payload?.occurred_at === 'string' ? payload.occurred_at : new Date().toISOString()

      const snapshot = await ensureRecurringChargeSnapshot({
        supabase,
        organizationId,
        subscriptionId: assinatura.id as string,
        providerPaymentId,
        amountCents,
        occurredAtIso: occurredAt,
        paymentLinkId: (plan as any)?.payment_link_id ? String((plan as any).payment_link_id) : null,
        receiverId: String(assinatura.recebedor_id),
        providerPayload: body,
      })

      const ownerProfileId = await getOrganizationOwnerProfileId(organizationId)
      await insertAuditLog({
        organizationId,
        actorProfileId: ownerProfileId,
        actorUserId: null,
        authType: 'api_key',
        origin: 'public_api',
        action: 'CREATE',
        entity: 'transaction',
        entityId: snapshot.transactionId,
        before: null,
        after: { provider_reference: providerPaymentId, subscription_id: assinatura.id as string },
      })

      await supabase.from('pay_subscription_events').insert({
        organization_id: organizationId,
        assinatura_id: assinatura.id,
        provider_event_id: providerEventId,
        event_type: body.type,
        payload: body,
      })

      if (body.type === 'recurring.charge.paid') {
        await markRecurringChargePaid({
          supabase,
          organizationId,
          subscriptionId: assinatura.id as string,
          transactionId: snapshot.transactionId,
          providerPaymentId,
          providerPayload: body,
          occurredAtIso: occurredAt,
        })
        await ensureLedgerEntryOnce({
          organizationId,
          transactionId: snapshot.transactionId,
          type: 'sale',
          direction: 'credit',
          amount: amountCents,
          origin: 'webhook',
          occurredAt,
        })
        await ensurePayLedgerFromSplitOnce({ organizationId, transactionId: snapshot.transactionId })
      } else {
        await applyDunningOnFailure({
          supabase,
          organizationId,
          subscriptionId: assinatura.id as string,
          providerEventId,
          payload: body,
        })
      }

      try {
        const { data: subRow } = await supabase
          .from('pay_assinatura')
          .select('id, pagador:pay_pagador(email), plano:pay_plano(name)')
          .eq('organization_id', organizationId)
          .eq('id', assinatura.id as string)
          .maybeSingle()
        const email = typeof (subRow as any)?.pagador?.email === 'string' ? String((subRow as any).pagador.email) : null
        if (email) {
          await sendTransactionalEmail({
            organizationId,
            to: email,
            template: body.type === 'recurring.charge.paid' ? 'recurring.charge.paid' : 'recurring.charge.failed',
            data: { assinatura_id: assinatura.id, plano: (subRow as any)?.plano?.name ?? null, status: body.type },
          })
        }
      } catch {
      }
    }

    if (body.type === 'payment.refunded') {
      await ensureLedgerEntryOnce({
        organizationId,
        transactionId: tx.id,
        type: 'refund',
        direction: 'debit',
        amount,
        origin: 'webhook',
      })
    }

    if (providerSubscriptionId) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, amount, status, next_billing_at')
        .eq('organization_id', organizationId)
        .eq('provider_reference', providerSubscriptionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (sub?.id) {
        const nextBillingAt = typeof payload?.next_billing_at === 'string' ? payload.next_billing_at : typeof payload?.nextBillingAt === 'string' ? payload.nextBillingAt : null
        const nextSubStatus =
          body.type === 'subscription.canceled'
            ? 'canceled'
            : body.type === 'subscription.created'
              ? 'active'
              : body.type === 'subscription.renewed'
                ? 'active'
                : body.type === 'subscription.paused'
                  ? 'paused'
                  : body.type === 'subscription.resumed'
                    ? 'active'
                    : null
        if (nextSubStatus || nextBillingAt) {
          await supabase
            .from('subscriptions')
            .update({
              ...(nextSubStatus ? { status: nextSubStatus } : null),
              ...(nextBillingAt ? { next_billing_at: nextBillingAt } : null),
              updated_at: new Date().toISOString(),
            } as any)
            .eq('organization_id', organizationId)
            .eq('id', sub.id)
        }

        if (body.type === 'subscription.renewed') {
          const origin = `webhook:subscription:${sub.id}:${event.id}`
          const { data: existing } = await supabase
            .from('ledger_entries')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('type', 'subscription')
            .eq('origin', origin)
            .limit(1)
            .maybeSingle()
          if (!existing?.id) {
            await appendLedgerEntryAdmin({
              organizationId,
              type: 'subscription',
              direction: 'credit',
              amount: Number((sub as any).amount ?? 0),
              origin,
            })
          }
        }
      }
    }

    if (String(body.type).startsWith('pix_auto.')) {
      const assinaturaId =
        typeof meta.assinatura_id === 'string'
          ? meta.assinatura_id
          : typeof payload?.assinatura_id === 'string'
            ? payload.assinatura_id
            : null

      if (assinaturaId) {
        const now = new Date().toISOString()
        const nextAuthStatus =
          body.type === 'pix_auto.authorization.approved'
            ? 'approved'
            : body.type === 'pix_auto.authorization.rejected' || body.type === 'pix_auto.authorization.failed'
              ? 'rejected'
              : body.type === 'pix_auto.authorization.canceled'
                ? 'canceled'
                : null
        const authorizationId =
          typeof payload?.authorization_id === 'string'
            ? payload.authorization_id
            : typeof payload?.authorizationId === 'string'
              ? payload.authorizationId
              : typeof payload?.id === 'string'
                ? payload.id
                : null

        if (providerEventId) {
          const { data: exists } = await supabase
            .from('pay_subscription_events')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('provider_event_id', providerEventId)
            .maybeSingle()
          if (!exists?.id) {
            await supabase.from('pay_subscription_events').insert({
              organization_id: organizationId,
              assinatura_id: assinaturaId,
              provider_event_id: providerEventId,
              event_type: body.type,
              payload: body,
            })
          }
        } else {
          await supabase.from('pay_subscription_events').insert({
            organization_id: organizationId,
            assinatura_id: assinaturaId,
            provider_event_id: null,
            event_type: body.type,
            payload: body,
          })
        }

        if (nextAuthStatus) {
          await supabase
            .from('pay_assinatura')
            .update({
              pix_auto_authorization_status: nextAuthStatus,
              ...(authorizationId ? { pix_auto_authorization_id: authorizationId } : null),
              ...(nextAuthStatus === 'approved' ? { pix_auto_authorized_at: now } : null),
              ...(nextAuthStatus === 'canceled' ? { pix_auto_canceled_at: now } : null),
            } as any)
            .eq('organization_id', organizationId)
            .eq('id', assinaturaId)
        }
      }
    }

    if (providerPayoutId) {
      const { data: p } = await supabase
        .from('payouts')
        .select('id, gross_amount, net_amount, status')
        .eq('organization_id', organizationId)
        .eq('provider_reference', providerPayoutId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (p?.id) {
        const nextPayoutStatus = mapPayoutStatus(body.type)
        if (providerEventId) {
          const { data: evExisting } = await supabase
            .from('payout_events')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('payout_id', p.id)
            .eq('provider_event_id', providerEventId)
            .limit(1)
            .maybeSingle()
          if (!evExisting?.id) {
            await supabase.from('payout_events').insert({
              organization_id: organizationId,
              payout_id: p.id,
              event_type: body.type,
              provider_event_id: providerEventId,
              payload: body,
            })
          }
        } else {
          await supabase.from('payout_events').insert({
            organization_id: organizationId,
            payout_id: p.id,
            event_type: body.type,
            provider_event_id: null,
            payload: body,
          })
        }

        if (nextPayoutStatus && String((p as any).status ?? '') !== nextPayoutStatus) {
          const now = new Date().toISOString()
          await supabase
            .from('payouts')
            .update({
              status: nextPayoutStatus,
              provider_status: nextPayoutStatus,
              provider_payload: body,
              ...(nextPayoutStatus === 'requested' ? { requested_at: now } : null),
              ...(nextPayoutStatus === 'paid' ? { paid_at: now } : null),
              ...(nextPayoutStatus === 'failed' ? { failed_at: now } : null),
              ...(nextPayoutStatus === 'canceled' ? { canceled_at: now } : null),
            } as any)
            .eq('organization_id', organizationId)
            .eq('id', p.id)
        }

        if (nextPayoutStatus === 'paid') {
          const amt = Number((p as any).net_amount ?? (p as any).gross_amount ?? 0)
          if (amt > 0) {
            await ensureLedgerEntryOnce({
              organizationId,
              payoutId: p.id as string,
              type: 'payout',
              direction: 'debit',
              amount: amt,
              origin: 'webhook',
            })
          }
        }

        if (nextPayoutStatus === 'paid') {
          try {
            const { data: p2 } = await supabase.from('payouts').select('id, receiver:receivers(email)').eq('organization_id', organizationId).eq('id', p.id).maybeSingle()
            const email = typeof (p2 as any)?.receiver?.email === 'string' ? String((p2 as any).receiver.email) : null
            if (email) {
              await sendTransactionalEmail({ organizationId, to: email, template: 'payout.paid', data: { payout_id: p.id } })
            }
          } catch {
          }
        }
      }
    }

    if (String(body.type).startsWith('anticipation.')) {
      const before = await handleAnticipationWebhook({
        supabase,
        organizationId,
        providerEventId,
        type: body.type,
        payload: body,
        providerAnticipationId: providerAnticipationId ? String(providerAnticipationId) : null,
        anticipationIdFromMeta: anticipationIdFromMeta ? String(anticipationIdFromMeta) : null,
      })
      if (before.ok) {
        const nextStatus = mapAnticipationStatus({ type: body.type })
        const ownerProfileId = await getOrganizationOwnerProfileId(organizationId)
        await insertAuditLog({
          organizationId,
          actorProfileId: ownerProfileId,
          actorUserId: null,
          authType: 'api_key',
          origin: 'public_api',
          action: 'STATUS_UPDATE',
          entity: 'pay_antecipacao',
          entityId: anticipationIdFromMeta ? anticipationIdFromMeta : null,
          before: null,
          after: { type: body.type, provider_reference: providerAnticipationId },
        })

        if (nextStatus === 'provider_processing' || nextStatus === 'paid') {
          try {
            const id = anticipationIdFromMeta ? String(anticipationIdFromMeta) : null
            if (id) {
              const { data: a } = await supabase
                .from('pay_antecipacao')
                .select('id, recebedor:receivers(email)')
                .eq('organization_id', organizationId)
                .eq('id', id)
                .maybeSingle()
              const email = typeof (a as any)?.recebedor?.email === 'string' ? String((a as any).recebedor.email) : null
              if (email) {
                await sendTransactionalEmail({
                  organizationId,
                  to: email,
                  template: nextStatus === 'provider_processing' ? 'anticipation.approved' : 'anticipation.executed',
                  data: { antecipacao_id: id, status: nextStatus },
                })
              }
            }
          } catch {
          }
        }
      }
    }

    await supabase.from('webhook_attempts').insert({
      organization_id: event.organization_id,
      webhook_event_id: event.id,
      attempt: nextAttempt,
      status: 'processed',
      error: null,
      duration_ms: Date.now() - startedAt,
    })

    await supabase.from('webhook_events').update({ status: 'processed', last_error: null, processed_at: new Date().toISOString(), next_retry_at: null }).eq('id', event.id)
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed'
    const delaySeconds = Math.min(300, Math.pow(2, Math.max(0, nextAttempt)) * 10)
    const nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString()

    await supabase.from('webhook_attempts').insert({
      organization_id: event.organization_id,
      webhook_event_id: event.id,
      attempt: nextAttempt,
      status: 'failed',
      error: message,
      duration_ms: Date.now() - startedAt,
    })

    await supabase.from('webhook_events').update({ status: 'failed', last_error: message, next_retry_at: nextRetryAt }).eq('id', event.id)
    throw e
  }
}
