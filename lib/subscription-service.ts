import 'server-only'

import { getAcquirerProvider } from '@/lib/acquirer'
import { ProviderError } from '@/lib/acquirer/provider-error'
import { insertAuditLog } from '@/lib/audit-log'
import { calculateSplitForProvider, markPayTransacaoProviderSuccess, persistSplitSnapshot } from '@/lib/split-service'
import { mapSplitConfigErrorToUserMessage } from '@/lib/split-service'
import { sendTransactionalEmail } from '@/lib/email-service'
import { getFinancialEnvironment, getFinancialProvider } from '@/lib/env'
import { createPhase2InternalPayment, type CheckoutPaymentLinkRecord } from '@/lib/payments-internal'
import { ensurePagarMeRecurringCustomerCard } from '@/lib/pagarme-recurring'
import {
  addCycleUtc,
  addDaysUtc,
  calculateChurnRate,
  calculateMRRCents,
  computeInitialNextChargeAt,
  decideDunningAction,
  nowUtcIso,
  validateSubscriptionPaymentMethod,
  type PlanCycle,
} from '@/lib/subscription-core'
import crypto from 'crypto'

type SupabaseLike = any

export function isMissingSubscriptionDbObjectError(err: any) {
  const code = err?.code ? String(err.code) : ''
  if (code === 'PGRST205') return true
  if (code === '42P01') return true
  if (code === '42703') return true
  const msg = err?.message ? String(err.message) : ''
  if (msg.toLowerCase().includes('schema cache')) return true
  if (msg.toLowerCase().includes('does not exist')) return true
  return false
}

function randomSlug() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 14; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

function getSubscriptionChargeStatusFromPayment(status: string) {
  if (status === 'paid' || status === 'authorized') return 'active' as const
  if (status === 'pending' || status === 'processing' || status === 'created') return 'pending' as const
  if (status === 'canceled') return 'canceled' as const
  return 'failed' as const
}

function isInternallyManagedSubscription(subscriptionId: string | null | undefined) {
  return typeof subscriptionId === 'string' && subscriptionId.startsWith('internal:')
}

async function syncRecurringChargeTransaction(input: {
  supabase: SupabaseLike
  transactionId: string
  status: string
  providerReference: string
  providerOrderId?: string | null
  providerChargeId?: string | null
  providerPayload: unknown
}) {
  await input.supabase
    .from('transactions')
    .update({
      status: input.status,
      provider_reference: input.providerReference,
      provider_order_id: input.providerOrderId ?? null,
      provider_charge_id: input.providerChargeId ?? null,
      provider_payload: input.providerPayload ?? {},
    })
    .eq('id', input.transactionId)

  await input.supabase
    .from('pay_transacao')
    .update({
      status: input.status,
      provider_reference: input.providerReference,
      provider_order_id: input.providerOrderId ?? null,
      provider_charge_id: input.providerChargeId ?? null,
      provider_payload: input.providerPayload ?? {},
      provider_last_error: null,
      provider_last_error_at: null,
    })
    .eq('transaction_id', input.transactionId)
}

export async function createPlan(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  receiverId: string
  name: string
  description?: string | null
  amountCents: number
  cycle: PlanCycle
  trialDays: number
  paymentMethod?: 'card' | 'pix_auto'
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Invalid amount')
  if (!Number.isInteger(input.trialDays) || input.trialDays < 0) throw new Error('Invalid trialDays')

  const { data: receiver } = await input.supabase
    .from('receivers')
    .select('id, kyc_status, status')
    .eq('organization_id', input.organizationId)
    .eq('id', input.receiverId)
    .maybeSingle()
  if (!receiver) throw new Error('Receiver not found')
  if (String(receiver.status ?? 'active') !== 'active') throw new Error('Receiver inactive')
  if (String(receiver.kyc_status ?? 'pending') !== 'approved') throw new Error('Receiver KYC not approved')

  const slug = randomSlug()
  const { data: link, error: linkError } = await input.supabase
    .from('payment_links')
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      amount: input.amountCents,
      currency: 'BRL',
      type: 'recurring',
      methods: { card: true, pix: false },
      max_installments: 1,
      status: 'active',
      slug,
      metadata: { interval: input.cycle, trial_days: input.trialDays },
    })
    .select('id, slug')
    .single()

  if (linkError) throw new Error('Failed to create payment link')

  const { data: plan, error } = await input.supabase
    .from('pay_plano')
    .insert({
      organization_id: input.organizationId,
      recebedor_id: input.receiverId,
      payment_link_id: link.id,
      name: input.name,
      description: input.description ?? null,
      amount_centavos: input.amountCents,
      cycle: input.cycle,
      trial_days: input.trialDays,
      payment_method: input.paymentMethod === 'pix_auto' ? 'pix_auto' : 'card',
      status: 'active',
    })
    .select('*')
    .single()

  if (error) throw new Error('Failed to create plan')

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'session',
    origin: 'internal_api',
    action: 'CREATE',
    entity: 'pay_plano',
    entityId: plan.id as string,
    before: null,
    after: plan,
  })

  return { plan, checkoutSlug: link.slug as string }
}

export async function updatePlan(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  planId: string
  patch: Partial<{ name: string; description: string | null; amountCents: number; cycle: PlanCycle; trialDays: number; status: 'active' | 'inactive' }>
}) {
  const { data: before } = await input.supabase.from('pay_plano').select('*').eq('organization_id', input.organizationId).eq('id', input.planId).maybeSingle()
  if (!before) throw new Error('Not found')

  const updates: Record<string, unknown> = {}
  if (typeof input.patch.name === 'string' && input.patch.name.trim()) updates.name = input.patch.name.trim()
  if (input.patch.description === null || typeof input.patch.description === 'string') updates.description = input.patch.description
  if (typeof input.patch.amountCents === 'number') {
    if (!Number.isInteger(input.patch.amountCents) || input.patch.amountCents <= 0) throw new Error('Invalid amount')
    updates.amount_centavos = input.patch.amountCents
  }
  if (input.patch.cycle) updates.cycle = input.patch.cycle
  if (typeof input.patch.trialDays === 'number') {
    if (!Number.isInteger(input.patch.trialDays) || input.patch.trialDays < 0) throw new Error('Invalid trialDays')
    updates.trial_days = input.patch.trialDays
  }
  if (input.patch.status) updates.status = input.patch.status

  const { data, error } = await input.supabase.from('pay_plano').update(updates).eq('organization_id', input.organizationId).eq('id', input.planId).select('*').single()
  if (error) throw new Error('Failed to update plan')

  if ((before as any).payment_link_id) {
    const linkUpdates: Record<string, unknown> = {}
    if (typeof input.patch.name === 'string' && input.patch.name.trim()) linkUpdates.name = input.patch.name.trim()
    if (input.patch.description === null || typeof input.patch.description === 'string') linkUpdates.description = input.patch.description
    if (typeof input.patch.amountCents === 'number') linkUpdates.amount = input.patch.amountCents
    if (input.patch.status) linkUpdates.status = input.patch.status === 'active' ? 'active' : 'inactive'
    if (Object.keys(linkUpdates).length) {
      await input.supabase.from('payment_links').update(linkUpdates).eq('organization_id', input.organizationId).eq('id', (before as any).payment_link_id)
    }
  }

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'session',
    origin: 'internal_api',
    action: 'UPDATE',
    entity: 'pay_plano',
    entityId: input.planId,
    before,
    after: data,
  })

  return { plan: data }
}

export async function listPlans(input: { supabase: SupabaseLike; organizationId: string }) {
  const { data, error } = await input.supabase
    .from('pay_plano')
    .select('id, recebedor_id, payment_link_id, name, description, amount_centavos, cycle, trial_days, payment_method, status, created_at, updated_at')
    .eq('organization_id', input.organizationId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return { plans: data ?? [] }
}

export async function createSubscription(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string | null
  origin: 'internal_api' | 'public_api'
  authType: 'session' | 'api_key'
  planId: string
  payer: { name: string; email?: string | null; document?: string | null; phone?: string | null }
  card: { holderName: string; number?: string; token?: string; expMonth: string; expYear: string; cvv?: string; brand?: string; last4?: string }
}) {
  const { data: plan } = await input.supabase
    .from('pay_plano')
    .select('id, recebedor_id, payment_link_id, name, amount_centavos, cycle, trial_days, payment_method, status')
    .eq('organization_id', input.organizationId)
    .eq('id', input.planId)
    .maybeSingle()
  if (!plan) throw new Error('Plan not found')
  if (String((plan as any).status ?? 'active') !== 'active') throw new Error('Plan inactive')
  const paymentMethod = validateSubscriptionPaymentMethod((plan as any).payment_method ?? 'card')
  if (!paymentMethod.ok) throw new Error(paymentMethod.message)

  const receiverId = String((plan as any).recebedor_id)
  const providerId = getFinancialProvider()
  const runtime = getFinancialEnvironment(providerId)
  const createdAt = nowUtcIso()
  const trialDays = Number((plan as any).trial_days ?? 0)
  const cycle = String((plan as any).cycle ?? 'monthly') as PlanCycle
  const initialChargeAt = trialDays > 0 ? addDaysUtc(createdAt, trialDays) : createdAt
  const nextChargeAfterInitial = addCycleUtc(initialChargeAt, cycle)

  const { data: payerRow, error: payerError } = await input.supabase
    .from('pay_pagador')
    .insert({
      organization_id: input.organizationId,
      provider: runtime.providerId,
      provider_environment: runtime.environment,
      name: input.payer.name,
      email: input.payer.email ?? null,
      document: input.payer.document ?? null,
      phone: input.payer.phone ?? null,
      card_token_ref: providerId === 'pagarme' ? null : null,
    })
    .select('*')
    .single()
  if (payerError) throw new Error('Failed to create payer')

  const { data: subRow, error: subError } = await input.supabase
    .from('pay_assinatura')
    .insert({
      organization_id: input.organizationId,
      plano_id: input.planId,
      pagador_id: payerRow.id,
      recebedor_id: receiverId,
      provider: runtime.providerId,
      provider_environment: runtime.environment,
      status: 'pending',
      next_charge_at: initialChargeAt,
      attempts_failed: 0,
      acquirer_subscription_id: providerId === 'pagarme' ? `internal:${crypto.randomUUID()}` : null,
      last_charge_at: null,
      canceled_at: null,
      payment_method: 'card',
      provider_reference: null,
      provider_first_order_id: null,
      provider_first_charge_id: null,
      provider_first_brand_id: null,
      provider_last_order_id: null,
      provider_last_charge_id: null,
    })
    .select('*')
    .single()
  if (subError) throw new Error('Failed to create subscription')

  const provider = getAcquirerProvider()
  const { providerSplit } = await (async () => {
    try {
      return await calculateSplitForProvider(input.supabase, { organizationId: input.organizationId, paymentLinkId: (plan as any).payment_link_id ?? null, grossAmount: Number((plan as any).amount_centavos) }, receiverId)
    } catch (e) {
      throw new Error(mapSplitConfigErrorToUserMessage(e))
    }
  })()

  let subscriptionAfter = {
    ...(subRow as any),
    next_charge_at: initialChargeAt,
  }

  try {
    if (providerId === 'pagarme') {
      const token = typeof input.card.token === 'string' ? input.card.token.trim() : ''
      const hasRawPan = typeof input.card.number === 'string' && input.card.number.trim().length > 0
      const hasRawCvv = typeof input.card.cvv === 'string' && input.card.cvv.trim().length > 0
      if (!token || hasRawPan || hasRawCvv) {
        throw new ProviderError({
          provider: 'pagarme',
          code: 'bad_request',
          status: 400,
          retryable: false,
          message: 'Envie apenas card.token para assinaturas com Pagar.me.',
        })
      }

      const providerCard = await ensurePagarMeRecurringCustomerCard({
        payerId: String(payerRow.id),
        organizationId: input.organizationId,
        payer: input.payer,
        card: {
          token,
          holderName: input.card.holderName,
          expMonth: input.card.expMonth,
          expYear: input.card.expYear,
          brand: input.card.brand,
          label: String((plan as any).name ?? 'Connekt Pay'),
        },
      })

      await input.supabase
        .from('pay_pagador')
        .update({
          provider_customer_id: providerCard.customerId,
          provider_card_id: providerCard.cardId,
          provider_card_brand: providerCard.cardBrand,
          provider_card_last4: input.card.last4 ?? providerCard.cardLast4 ?? null,
        })
        .eq('organization_id', input.organizationId)
        .eq('id', payerRow.id)

      if (trialDays <= 0) {
        let paymentLink: CheckoutPaymentLinkRecord | null = null
        if ((plan as any).payment_link_id) {
          const { data: loadedPaymentLink } = await input.supabase
            .from('payment_links')
            .select('id, organization_id, amount, currency, name, description, type, methods, max_installments, status, slug, metadata')
            .eq('organization_id', input.organizationId)
            .eq('id', (plan as any).payment_link_id as string)
            .maybeSingle()
          paymentLink = (loadedPaymentLink ?? null) as CheckoutPaymentLinkRecord | null
        }

        const internalPayment = await createPhase2InternalPayment({
          supabase: input.supabase,
          organizationId: input.organizationId,
          paymentLink,
          method: 'card',
          customer: {
            name: input.payer.name,
            email: input.payer.email ?? null,
            document: input.payer.document ?? null,
          },
          customerId: null,
          provider: 'pagarme',
          providerEnvironment: runtime.environment,
          amount: Number((plan as any).amount_centavos),
          currency: 'BRL',
          metadata: {
            assinatura_id: subRow.id as string,
            plano_id: input.planId,
            recebedor_id: receiverId,
            payment_origin: 'subscription',
            recurrence_cycle: 'first',
          },
          explicitIdempotencyKey: `subscription:${String(subRow.id)}:first`,
          phase2ProviderErrorCode: 'subscription_provider_pending',
          phase2ProviderErrorMessage: 'Aguardando criação da primeira cobrança recorrente no provedor.',
        })

        const payment = await provider.createPayment({
          amount: { amount: Number((plan as any).amount_centavos), currency: 'BRL' },
          method: 'card',
          description: String((plan as any).name ?? 'Assinatura Connekt Pay'),
          customerId: providerCard.customerId,
          metadata: {
            organization_id: input.organizationId,
            internal_transaction_id: internalPayment.transaction.transactionId,
            internal_payment_link_id: paymentLink?.id ?? '',
            idempotency_key: internalPayment.transaction.idempotencyKey,
            provider_environment: runtime.environment,
            assinatura_id: subRow.id as string,
            plano_id: input.planId,
            recebedor_id: receiverId,
            payment_origin: 'subscription',
          },
          installments: 1,
          split: providerSplit.receivers.map((entry) => ({ receiverId: entry.receiverId, amount: entry.amount })),
          connektFeeAmount: providerSplit.connektFeeAmount,
          card: {
            cardId: providerCard.cardId,
            holderName: input.card.holderName,
            expMonth: input.card.expMonth,
            expYear: input.card.expYear,
            brand: input.card.brand ?? providerCard.cardBrand ?? undefined,
            last4: input.card.last4 ?? providerCard.cardLast4 ?? undefined,
            recurrenceCycle: 'first',
          },
        })

        const occurredAtIso = payment.createdAt ?? createdAt
        await syncRecurringChargeTransaction({
          supabase: input.supabase,
          transactionId: internalPayment.transaction.transactionId,
          status: payment.status,
          providerReference: payment.providerReference ?? payment.id,
          providerOrderId: payment.providerOrderId ?? null,
          providerChargeId: payment.providerChargeId ?? null,
          providerPayload: payment.raw ?? payment,
        })

        if (payment.status === 'paid') {
          await markRecurringChargePaid({
            supabase: input.supabase,
            organizationId: input.organizationId,
            subscriptionId: subRow.id as string,
            transactionId: internalPayment.transaction.transactionId,
            providerPaymentId: payment.providerReference ?? payment.id,
            providerPayload: payment.raw ?? payment,
            occurredAtIso,
          })
        }

        const nextStatus = getSubscriptionChargeStatusFromPayment(payment.status)
        const nextChargeAt = nextStatus === 'active' ? nextChargeAfterInitial : initialChargeAt
        const billingCyclesCompleted = nextStatus === 'active' ? 1 : 0
        const updates = {
          status: nextStatus,
          next_charge_at: nextChargeAt,
          last_charge_at: nextStatus === 'active' ? occurredAtIso : null,
          billing_cycles_completed: billingCyclesCompleted,
          provider_reference: payment.providerReference ?? null,
          provider_first_order_id: payment.providerOrderId ?? null,
          provider_first_charge_id: payment.providerChargeId ?? null,
          provider_last_order_id: payment.providerOrderId ?? null,
          provider_last_charge_id: payment.providerChargeId ?? null,
        }
        await input.supabase.from('pay_assinatura').update(updates).eq('id', subRow.id)
        subscriptionAfter = { ...(subscriptionAfter as any), ...updates }

        await input.supabase.from('pay_subscription_events').insert({
          organization_id: input.organizationId,
          assinatura_id: subRow.id,
          provider: runtime.providerId,
          provider_environment: runtime.environment,
          provider_event_id: null,
          event_type: 'subscription.created',
          payload: {
            payment,
            provider_customer_id: providerCard.customerId,
            provider_card_id: providerCard.cardId,
          },
        })
      } else {
        await input.supabase.from('pay_assinatura').update({ next_charge_at: initialChargeAt, status: 'pending' }).eq('id', subRow.id)
        subscriptionAfter = { ...(subscriptionAfter as any), status: 'pending', next_charge_at: initialChargeAt }
        await input.supabase.from('pay_subscription_events').insert({
          organization_id: input.organizationId,
          assinatura_id: subRow.id,
          provider: runtime.providerId,
          provider_environment: runtime.environment,
          provider_event_id: null,
          event_type: 'subscription.created',
          payload: {
            provider_customer_id: providerCard.customerId,
            provider_card_id: providerCard.cardId,
            trial_days: trialDays,
            status: 'pending',
          },
        })
      }
    } else {
      const transactionIdForToken = crypto.randomUUID()
      const token = await provider.tokenizeCard({ cardNumber: input.card.number ?? '', transactionId: transactionIdForToken })
      await input.supabase.from('pay_pagador').update({ card_token_ref: token.cardTokenRef }).eq('id', payerRow.id)

      const providerSub = await provider.createSubscription({
        externalId: subRow.id as string,
        amountCents: Number((plan as any).amount_centavos),
        cycle: String((plan as any).cycle ?? 'monthly'),
        trialDays,
        receiverId,
        payer: { name: input.payer.name, email: input.payer.email ?? null, document: input.payer.document ?? null, phone: input.payer.phone ?? null },
        card: { tokenRef: token.cardTokenRef, holderName: input.card.holderName, expMonth: input.card.expMonth, expYear: input.card.expYear, cvv: input.card.cvv ?? '' },
        split: providerSplit,
        metadata: { organization_id: input.organizationId, assinatura_id: subRow.id as string, plano_id: input.planId, recebedor_id: receiverId },
      })

      await input.supabase.from('pay_assinatura').update({ status: providerSub.status, acquirer_subscription_id: providerSub.id, next_charge_at: providerSub.nextChargeAt ?? computeInitialNextChargeAt({ createdAtIso: createdAt, trialDays, cycle }) }).eq('id', subRow.id)

      subscriptionAfter = {
        ...(subscriptionAfter as any),
        status: providerSub.status,
        next_charge_at: providerSub.nextChargeAt ?? computeInitialNextChargeAt({ createdAtIso: createdAt, trialDays, cycle }),
        acquirer_subscription_id: providerSub.id,
      }

      await input.supabase.from('pay_subscription_events').insert({
        organization_id: input.organizationId,
        assinatura_id: subRow.id,
        provider: runtime.providerId,
        provider_environment: runtime.environment,
        provider_event_id: null,
        event_type: 'subscription.created',
        payload: providerSub,
      })
    }
  } catch (error) {
    await input.supabase
      .from('pay_assinatura')
      .update({ status: 'failed', internal_notes: error instanceof Error ? error.message.slice(0, 500) : 'provider_error' })
      .eq('id', subRow.id)
    throw error
  }

  try {
    const email = payerRow.email ? String(payerRow.email) : null
    if (email) {
      await sendTransactionalEmail({
        organizationId: input.organizationId,
        to: email,
        template: 'subscription.created',
        data: { assinatura_id: subRow.id, plano_id: input.planId, plano: (plan as any)?.name ?? null },
      })
    }
  } catch {
  }

  if (input.actorProfileId) {
    await insertAuditLog({
      organizationId: input.organizationId,
      actorProfileId: input.actorProfileId,
      actorUserId: input.authType === 'session' ? input.actorProfileId : null,
      authType: input.authType,
      origin: input.origin,
      action: 'CREATE',
      entity: 'pay_assinatura',
      entityId: subRow.id as string,
      before: null,
      after: {
        id: subRow.id,
        plano_id: input.planId,
        pagador_id: payerRow.id,
        status: (subscriptionAfter as any).status,
        next_charge_at: (subscriptionAfter as any).next_charge_at,
        acquirer_subscription_id: (subscriptionAfter as any).acquirer_subscription_id ?? null,
        provider_reference: (subscriptionAfter as any).provider_reference ?? null,
      },
    })
  }

  return { subscription: subscriptionAfter }
}

export async function cancelSubscription(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  subscriptionId: string
  reason?: string | null
}) {
  const runtime = getFinancialEnvironment()
  const { data: before } = await input.supabase.from('pay_assinatura').select('*').eq('organization_id', input.organizationId).eq('id', input.subscriptionId).maybeSingle()
  if (!before) throw new Error('Not found')
  if (String((before as any).status ?? '') === 'canceled') return { subscription: before }

  const provider = getAcquirerProvider()
  const providerSubscriptionId = (before as any).acquirer_subscription_id as string | null
  if (providerSubscriptionId && !isInternallyManagedSubscription(providerSubscriptionId)) {
    await provider.cancelSubscription({
      id: providerSubscriptionId,
      metadata: { organization_id: input.organizationId, assinatura_id: input.subscriptionId },
    })
  }

  const now = nowUtcIso()
  const { data, error } = await input.supabase
    .from('pay_assinatura')
    .update({ status: 'canceled', canceled_at: now })
    .eq('organization_id', input.organizationId)
    .eq('id', input.subscriptionId)
    .select('*')
    .single()
  if (error) throw new Error('Failed to cancel subscription')

  await input.supabase.from('pay_subscription_events').insert({
    organization_id: input.organizationId,
    assinatura_id: input.subscriptionId,
    provider: runtime.providerId,
    provider_environment: runtime.environment,
    provider_event_id: null,
    event_type: 'subscription.canceled',
    payload: { reason: input.reason ?? null },
  })

  try {
    const payerId = (before as any).pagador_id as string | null
    if (payerId) {
      const { data: payer } = await input.supabase.from('pay_pagador').select('email').eq('organization_id', input.organizationId).eq('id', payerId).maybeSingle()
      const email = typeof (payer as any)?.email === 'string' ? String((payer as any).email) : null
      if (email) {
        await sendTransactionalEmail({
          organizationId: input.organizationId,
          to: email,
          template: 'subscription.canceled',
          data: { assinatura_id: input.subscriptionId, reason: input.reason ?? null },
        })
      }
    }
  } catch {
  }

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'session',
    origin: 'internal_api',
    action: 'CANCEL',
    entity: 'pay_assinatura',
    entityId: input.subscriptionId,
    before,
    after: data,
  })

  return { subscription: data }
}

export async function updateSubscriptionAdmin(input: {
  supabase: SupabaseLike
  organizationId: string
  actorProfileId: string
  subscriptionId: string
  patch: Partial<{ status: 'pending' | 'past_due' | 'failed'; nextChargeAt: string | null; attemptsFailed: number }>
}) {
  const runtime = getFinancialEnvironment()
  const { data: before } = await input.supabase
    .from('pay_assinatura')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('id', input.subscriptionId)
    .maybeSingle()
  if (!before) throw new Error('Not found')

  const updates: Record<string, unknown> = {}
  if (typeof input.patch.status === 'string') {
    const nextStatus = String(input.patch.status)
    if (!['pending', 'past_due', 'failed'].includes(nextStatus)) throw new Error('Invalid status')
    updates.status = nextStatus
  }
  if (Object.prototype.hasOwnProperty.call(input.patch, 'nextChargeAt')) {
    if (input.patch.nextChargeAt !== null && Number.isNaN(new Date(String(input.patch.nextChargeAt)).getTime())) {
      throw new Error('Invalid nextChargeAt')
    }
    updates.next_charge_at = input.patch.nextChargeAt ?? null
  }
  if (typeof input.patch.attemptsFailed === 'number') {
    if (!Number.isInteger(input.patch.attemptsFailed) || input.patch.attemptsFailed < 0) throw new Error('Invalid attemptsFailed')
    updates.attempts_failed = input.patch.attemptsFailed
  }
  if (Object.keys(updates).length === 0) throw new Error('No changes provided')

  const { data, error } = await input.supabase
    .from('pay_assinatura')
    .update(updates)
    .eq('organization_id', input.organizationId)
    .eq('id', input.subscriptionId)
    .select('*')
    .single()
  if (error) throw new Error('Failed to update subscription')

  await input.supabase.from('pay_subscription_events').insert({
    organization_id: input.organizationId,
    assinatura_id: input.subscriptionId,
    provider: runtime.providerId,
    provider_environment: runtime.environment,
    provider_event_id: null,
    event_type: 'subscription.updated_admin',
    payload: updates,
  })

  await insertAuditLog({
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    actorUserId: input.actorProfileId,
    authType: 'session',
    origin: 'internal_api',
    action: 'UPDATE',
    entity: 'pay_assinatura',
    entityId: input.subscriptionId,
    before,
    after: data,
  })

  return { subscription: data }
}

export async function getSubscription(input: { supabase: SupabaseLike; organizationId: string; subscriptionId: string }) {
  const runtime = getFinancialEnvironment()
  const { data, error } = await input.supabase
    .from('pay_assinatura')
    .select(
      'id, plano_id, pagador_id, recebedor_id, status, next_charge_at, attempts_failed, acquirer_subscription_id, last_charge_at, canceled_at, created_at, updated_at, plano:pay_plano(name, amount_centavos, cycle), pagador:pay_pagador(name, email)',
    )
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('id', input.subscriptionId)
    .maybeSingle()
  if (error) throw new Error('Failed to load subscription')
  if (!data) throw new Error('Not found')

  const { data: events } = await input.supabase
    .from('pay_subscription_events')
    .select('id, event_type, created_at')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('assinatura_id', input.subscriptionId)
    .order('created_at', { ascending: false })
    .limit(50)

  return { subscription: data, events: events ?? [] }
}

export async function listSubscriptions(input: { supabase: SupabaseLike; organizationId: string }) {
  const runtime = getFinancialEnvironment()
  let { data, error } = await input.supabase
    .from('pay_assinatura')
    .select(
      'id, status, next_charge_at, attempts_failed, created_at, plano:pay_plano(name, amount_centavos, cycle), pagador:pay_pagador(name, email)',
    )
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    const fallback = await input.supabase
      .from('pay_assinatura')
      .select('id, status, next_charge_at, attempts_failed, created_at, plano_id, pagador_id')
      .eq('organization_id', input.organizationId)
      .eq('provider', runtime.providerId)
      .eq('provider_environment', runtime.environment)
      .order('created_at', { ascending: false })
      .limit(200)
    data = fallback.data as any
    error = fallback.error
  }

  if (error) throw new Error('Failed to list subscriptions')
  return { subscriptions: data ?? [] }
}

export async function calculateMRR(input: { supabase: SupabaseLike; organizationId: string }) {
  const runtime = getFinancialEnvironment()
  const { data: plans } = await input.supabase.from('pay_plano').select('id, amount_centavos, cycle').eq('organization_id', input.organizationId)
  const map = new Map<string, { amountCents: number; cycle: PlanCycle }>()
  for (const p of plans ?? []) map.set(String((p as any).id), { amountCents: Number((p as any).amount_centavos ?? 0), cycle: String((p as any).cycle ?? 'monthly') as PlanCycle })

  const { data: subs } = await input.supabase
    .from('pay_assinatura')
    .select('plano_id, status')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
  const mrr = calculateMRRCents({ plansById: map, subscriptions: (subs ?? []).map((s: any) => ({ planoId: String(s.plano_id), status: String(s.status ?? '') })) })
  return { mrrCents: mrr }
}

export async function calculateChurn(input: { supabase: SupabaseLike; organizationId: string; windowDays?: number }) {
  const windowDays = typeof input.windowDays === 'number' && Number.isFinite(input.windowDays) && input.windowDays > 0 ? Math.round(input.windowDays) : 30
  const runtime = getFinancialEnvironment()
  const { data: subs } = await input.supabase
    .from('pay_assinatura')
    .select('status, canceled_at, created_at')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
  const churn = calculateChurnRate({
    subscriptions: (subs ?? []).map((s: any) => ({ status: String(s.status ?? ''), canceledAt: s.canceled_at ? String(s.canceled_at) : null, createdAt: s.created_at ? String(s.created_at) : null })),
    windowDays,
    nowIso: nowUtcIso(),
  })
  return { churnRate: churn }
}

export async function applyDunningOnFailure(input: {
  supabase: SupabaseLike
  organizationId: string
  subscriptionId: string
  providerEventId: string | null
  payload: unknown
}) {
  const runtime = getFinancialEnvironment()
  const { data: sub } = await input.supabase
    .from('pay_assinatura')
    .select('id, status, attempts_failed, acquirer_subscription_id')
    .eq('organization_id', input.organizationId)
    .eq('id', input.subscriptionId)
    .maybeSingle()
  if (!sub) return { ok: false as const }

  const attempts = Number((sub as any).attempts_failed ?? 0) + 1
  await input.supabase.from('pay_assinatura').update({ status: 'past_due', attempts_failed: attempts }).eq('id', input.subscriptionId)
  await input.supabase.from('pay_subscription_events').insert({
    organization_id: input.organizationId,
    assinatura_id: input.subscriptionId,
    provider: runtime.providerId,
    provider_environment: runtime.environment,
    provider_event_id: input.providerEventId,
    event_type: 'recurring.charge.failed',
    payload: input.payload,
  })

  const action = decideDunningAction({ attemptsFailed: attempts })
  if (action === 'notify') {
    await input.supabase.from('pay_subscription_events').insert({
      organization_id: input.organizationId,
      assinatura_id: input.subscriptionId,
      provider: runtime.providerId,
      provider_environment: runtime.environment,
      provider_event_id: null,
      event_type: 'dunning.notify',
      payload: { attempts_failed: attempts },
    })
    return { ok: true as const, action }
  }
  if (action === 'cancel') {
    const providerSubscriptionId = (sub as any).acquirer_subscription_id as string | null
    if (providerSubscriptionId && !isInternallyManagedSubscription(providerSubscriptionId)) {
      const provider = getAcquirerProvider()
      await provider.cancelSubscription({
        id: providerSubscriptionId,
        metadata: { organization_id: input.organizationId, assinatura_id: input.subscriptionId },
      })
    }
    await input.supabase.from('pay_assinatura').update({ status: 'canceled', canceled_at: nowUtcIso() }).eq('id', input.subscriptionId)
    await input.supabase.from('pay_subscription_events').insert({
      organization_id: input.organizationId,
      assinatura_id: input.subscriptionId,
      provider: runtime.providerId,
      provider_environment: runtime.environment,
      provider_event_id: null,
      event_type: 'dunning.cancel',
      payload: { attempts_failed: attempts },
    })
    return { ok: true as const, action }
  }
  return { ok: true as const, action: 'none' as const }
}

export async function ensureRecurringChargeSnapshot(input: {
  supabase: SupabaseLike
  organizationId: string
  subscriptionId: string
  providerPaymentId: string
  amountCents: number
  occurredAtIso: string
  paymentLinkId: string | null
  receiverId: string
  providerPayload: unknown
}) {
  const runtime = getFinancialEnvironment()
  const { data: existing } = await input.supabase
    .from('pay_transacao')
    .select('transaction_id')
    .eq('organization_id', input.organizationId)
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .eq('provider_reference', input.providerPaymentId)
    .limit(1)
    .maybeSingle()
  if (existing?.transaction_id) return { transactionId: String(existing.transaction_id) }

  const { data: tx, error } = await input.supabase
    .from('transactions')
    .insert({
      organization_id: input.organizationId,
      customer_id: null,
      payment_link_id: input.paymentLinkId,
      amount: input.amountCents,
      currency: 'BRL',
      method: 'card',
      status: 'created',
      provider: runtime.providerId,
      provider_environment: runtime.environment,
      provider_reference: input.providerPaymentId,
      provider_payload: input.providerPayload ?? {},
      public_token: null,
    })
    .select('id')
    .single()
  if (error) throw new Error('Failed to create transaction')

  const splitResult = await calculateSplitForProvider(input.supabase, { organizationId: input.organizationId, paymentLinkId: input.paymentLinkId, grossAmount: input.amountCents }, input.receiverId)

  await persistSplitSnapshot({
    supabase: input.supabase,
    transactionId: tx.id as string,
    organizationId: input.organizationId,
    paymentLinkId: input.paymentLinkId,
    currency: 'BRL',
    split: splitResult.split,
    providerSplit: splitResult.providerSplit,
  })

  await input.supabase.from('pay_subscription_events').insert({
    organization_id: input.organizationId,
    assinatura_id: input.subscriptionId,
    provider: runtime.providerId,
    provider_environment: runtime.environment,
    provider_event_id: null,
    event_type: 'recurring.charge.snapshot',
    payload: { provider_payment_id: input.providerPaymentId, transaction_id: tx.id, occurred_at: input.occurredAtIso },
  })

  return { transactionId: tx.id as string }
}

export async function markRecurringChargePaid(input: {
  supabase: SupabaseLike
  organizationId: string
  subscriptionId: string
  transactionId: string
  providerPaymentId: string
  providerPayload: unknown
  occurredAtIso: string
}) {
  await input.supabase.from('transactions').update({ status: 'paid', provider_payload: input.providerPayload ?? {} }).eq('id', input.transactionId)
  await markPayTransacaoProviderSuccess({
    supabase: input.supabase,
    transactionId: input.transactionId,
    providerReference: input.providerPaymentId,
    providerPayload: input.providerPayload ?? {},
    status: 'paid',
  })
  await input.supabase.from('pay_assinatura').update({ status: 'active', attempts_failed: 0, last_charge_at: input.occurredAtIso }).eq('id', input.subscriptionId)
}

export async function processDueRecurringSubscriptions(input: {
  supabase: SupabaseLike
  nowIso?: string
  limit?: number
}) {
  const providerId = getFinancialProvider()
  const runtime = getFinancialEnvironment(providerId)
  if (providerId !== 'pagarme') {
    return { scanned: 0, processed: 0, charged: 0, failed: 0, skipped: 0 }
  }

  const nowIso = typeof input.nowIso === 'string' && input.nowIso ? input.nowIso : nowUtcIso()
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.max(1, Math.min(50, Math.round(input.limit))) : 20
  const { data: dueSubscriptions, error } = await input.supabase
    .from('pay_assinatura')
    .select(
      'id, organization_id, plano_id, pagador_id, recebedor_id, status, provider, provider_environment, next_charge_at, attempts_failed, billing_cycles_completed, acquirer_subscription_id, provider_first_order_id, provider_first_charge_id',
    )
    .eq('provider', runtime.providerId)
    .eq('provider_environment', runtime.environment)
    .in('status', ['active', 'pending', 'past_due'])
    .lte('next_charge_at', nowIso)
    .order('next_charge_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error('Failed to load due recurring subscriptions')

  const rows = Array.isArray(dueSubscriptions) ? dueSubscriptions : []
  if (!rows.length) {
    return { scanned: 0, processed: 0, charged: 0, failed: 0, skipped: 0 }
  }

  const provider = getAcquirerProvider()
  let processed = 0
  let charged = 0
  let failed = 0
  let skipped = 0

  for (const row of rows) {
    const organizationId = String((row as any).organization_id)
    const subscriptionId = String((row as any).id)
    const scheduledChargeAt = typeof (row as any).next_charge_at === 'string' ? String((row as any).next_charge_at) : nowIso
    const providerSubscriptionId = (row as any).acquirer_subscription_id as string | null
    if (!isInternallyManagedSubscription(providerSubscriptionId)) {
      skipped += 1
      continue
    }

    try {
      const [{ data: plan }, { data: payer }] = await Promise.all([
        input.supabase
          .from('pay_plano')
          .select('id, name, amount_centavos, cycle, payment_link_id, status')
          .eq('organization_id', organizationId)
          .eq('id', (row as any).plano_id as string)
          .maybeSingle(),
        input.supabase
          .from('pay_pagador')
          .select('id, name, email, document, phone, provider_customer_id, provider_card_id, provider_card_brand, provider_card_last4')
          .eq('organization_id', organizationId)
          .eq('id', (row as any).pagador_id as string)
          .maybeSingle(),
      ])

      if (!plan || String((plan as any).status ?? 'active') !== 'active') {
        await input.supabase
          .from('pay_assinatura')
          .update({ status: 'failed', internal_notes: 'Plano da recorrência indisponível para cobrança.' })
          .eq('organization_id', organizationId)
          .eq('id', subscriptionId)
        failed += 1
        continue
      }

      if (!payer?.provider_customer_id || !payer?.provider_card_id) {
        await input.supabase
          .from('pay_assinatura')
          .update({ status: 'failed', internal_notes: 'Carteira recorrente da Pagar.me incompleta para a assinatura.' })
          .eq('organization_id', organizationId)
          .eq('id', subscriptionId)
        failed += 1
        continue
      }

      let paymentLink: CheckoutPaymentLinkRecord | null = null
      if ((plan as any).payment_link_id) {
        const { data: loadedPaymentLink } = await input.supabase
          .from('payment_links')
          .select('id, organization_id, amount, currency, name, description, type, methods, max_installments, status, slug, metadata')
          .eq('organization_id', organizationId)
          .eq('id', (plan as any).payment_link_id as string)
          .maybeSingle()
        paymentLink = (loadedPaymentLink ?? null) as CheckoutPaymentLinkRecord | null
      }

      const recurrenceCycle = (row as any).provider_first_charge_id ? 'subsequent' : 'first'
      const internalPayment = await createPhase2InternalPayment({
        supabase: input.supabase,
        organizationId,
        paymentLink,
        method: 'card',
        customer: {
          name: String((payer as any).name ?? 'Assinante'),
          email: (payer as any).email ? String((payer as any).email) : null,
          document: (payer as any).document ? String((payer as any).document) : null,
        },
        customerId: null,
        provider: 'pagarme',
        providerEnvironment: runtime.environment,
        amount: Number((plan as any).amount_centavos ?? 0),
        currency: 'BRL',
        metadata: {
          assinatura_id: subscriptionId,
          plano_id: String((plan as any).id),
          recebedor_id: String((row as any).recebedor_id),
          payment_origin: 'subscription',
          recurrence_cycle: recurrenceCycle,
          scheduled_charge_at: scheduledChargeAt,
        },
        explicitIdempotencyKey: `subscription:${subscriptionId}:${scheduledChargeAt}`,
        phase2ProviderErrorCode: 'subscription_provider_pending',
        phase2ProviderErrorMessage: 'Aguardando criação da cobrança recorrente no provedor.',
      })

      const { providerSplit } = await (async () => {
        try {
          return await calculateSplitForProvider(
            input.supabase,
            {
              organizationId,
              paymentLinkId: (plan as any).payment_link_id ?? null,
              grossAmount: Number((plan as any).amount_centavos ?? 0),
            },
            String((row as any).recebedor_id),
          )
        } catch (e) {
          throw new Error(mapSplitConfigErrorToUserMessage(e))
        }
      })()

      const payment = await provider.createPayment({
        amount: { amount: Number((plan as any).amount_centavos ?? 0), currency: 'BRL' },
        method: 'card',
        description: String((plan as any).name ?? 'Assinatura Connekt Pay'),
        customerId: String((payer as any).provider_customer_id),
        metadata: {
          organization_id: organizationId,
          internal_transaction_id: internalPayment.transaction.transactionId,
          internal_payment_link_id: paymentLink?.id ?? '',
          idempotency_key: internalPayment.transaction.idempotencyKey,
          provider_environment: runtime.environment,
          assinatura_id: subscriptionId,
          plano_id: String((plan as any).id),
          recebedor_id: String((row as any).recebedor_id),
          payment_origin: 'subscription',
        },
        installments: 1,
        split: providerSplit.receivers.map((entry) => ({ receiverId: entry.receiverId, amount: entry.amount })),
        connektFeeAmount: providerSplit.connektFeeAmount,
        card: {
          cardId: String((payer as any).provider_card_id),
          holderName: String((payer as any).name ?? 'Assinante'),
          brand: (payer as any).provider_card_brand ? String((payer as any).provider_card_brand) : undefined,
          last4: (payer as any).provider_card_last4 ? String((payer as any).provider_card_last4) : undefined,
          recurrenceCycle,
          paymentOriginChargeId:
            recurrenceCycle === 'subsequent' && (row as any).provider_first_charge_id
              ? String((row as any).provider_first_charge_id)
              : undefined,
        },
      })

      const occurredAtIso = payment.createdAt ?? nowIso
      await syncRecurringChargeTransaction({
        supabase: input.supabase,
        transactionId: internalPayment.transaction.transactionId,
        status: payment.status,
        providerReference: payment.providerReference ?? payment.id,
        providerOrderId: payment.providerOrderId ?? null,
        providerChargeId: payment.providerChargeId ?? null,
        providerPayload: payment.raw ?? payment,
      })

      const nextStatus = getSubscriptionChargeStatusFromPayment(payment.status)
      await input.supabase.from('pay_subscription_events').insert({
        organization_id: organizationId,
        assinatura_id: subscriptionId,
        provider: runtime.providerId,
        provider_environment: runtime.environment,
        provider_event_id: null,
        event_type: 'recurring.charge.created',
        payload: {
          transaction_id: internalPayment.transaction.transactionId,
          provider_reference: payment.providerReference ?? payment.id,
          provider_order_id: payment.providerOrderId ?? null,
          provider_charge_id: payment.providerChargeId ?? null,
          status: payment.status,
          scheduled_charge_at: scheduledChargeAt,
        },
      })

      if (nextStatus === 'active') {
        if (payment.status === 'paid') {
          await markRecurringChargePaid({
            supabase: input.supabase,
            organizationId,
            subscriptionId,
            transactionId: internalPayment.transaction.transactionId,
            providerPaymentId: payment.providerReference ?? payment.id,
            providerPayload: payment.raw ?? payment,
            occurredAtIso,
          })
        } else {
          await input.supabase
            .from('pay_assinatura')
            .update({ status: 'active', attempts_failed: 0, last_charge_at: occurredAtIso, internal_notes: null })
            .eq('organization_id', organizationId)
            .eq('id', subscriptionId)
        }

        await input.supabase
          .from('pay_assinatura')
          .update({
            status: 'active',
            attempts_failed: 0,
            last_charge_at: occurredAtIso,
            next_charge_at: addCycleUtc(scheduledChargeAt, String((plan as any).cycle ?? 'monthly') as PlanCycle),
            billing_cycles_completed: Number((row as any).billing_cycles_completed ?? 0) + 1,
            provider_reference: payment.providerReference ?? null,
            provider_first_order_id: (row as any).provider_first_order_id ?? payment.providerOrderId ?? null,
            provider_first_charge_id: (row as any).provider_first_charge_id ?? payment.providerChargeId ?? null,
            provider_last_order_id: payment.providerOrderId ?? null,
            provider_last_charge_id: payment.providerChargeId ?? null,
            internal_notes: null,
          })
          .eq('organization_id', organizationId)
          .eq('id', subscriptionId)
        charged += 1
      } else if (nextStatus === 'pending') {
        await input.supabase
          .from('pay_assinatura')
          .update({
            status: 'pending',
            provider_reference: payment.providerReference ?? null,
            provider_last_order_id: payment.providerOrderId ?? null,
            provider_last_charge_id: payment.providerChargeId ?? null,
            internal_notes: 'Cobrança recorrente pendente no provedor.',
            next_charge_at: addDaysUtc(nowIso, 1),
          })
          .eq('organization_id', organizationId)
          .eq('id', subscriptionId)
      } else {
        await applyDunningOnFailure({
          supabase: input.supabase,
          organizationId,
          subscriptionId,
          providerEventId: null,
          payload: payment.raw ?? payment,
        })
        failed += 1
      }

      processed += 1
    } catch (error) {
      await input.supabase.from('pay_subscription_events').insert({
        organization_id: organizationId,
        assinatura_id: subscriptionId,
        provider: runtime.providerId,
        provider_environment: runtime.environment,
        provider_event_id: null,
        event_type: 'recurring.charge.error',
        payload: {
          message: error instanceof Error ? error.message.slice(0, 500) : 'provider_error',
          scheduled_charge_at: scheduledChargeAt,
        },
      })
      await input.supabase
        .from('pay_assinatura')
        .update({ status: 'past_due', internal_notes: error instanceof Error ? error.message.slice(0, 500) : 'provider_error' })
        .eq('organization_id', organizationId)
        .eq('id', subscriptionId)
      failed += 1
    }
  }

  return {
    scanned: rows.length,
    processed,
    charged,
    failed,
    skipped,
  }
}
