import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { buildEmail, type EmailTemplateId } from '@/lib/email-templates'

type SendEmailInput = {
  organizationId: string | null
  to: string
  template: EmailTemplateId
  data?: Record<string, unknown>
}

function isSendGridConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL)
}

export async function sendTransactionalEmail(input: SendEmailInput) {
  const to = String(input.to ?? '').trim()
  if (!to || !to.includes('@')) return { ok: false as const, skipped: true as const, reason: 'invalid_to' as const }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  const fromName = process.env.SENDGRID_FROM_NAME ?? 'Connekt Pay'
  const apiKey = process.env.SENDGRID_API_KEY

  const supabase = getSupabaseAdminClient()
  const built = buildEmail({ template: input.template, brandName: 'Connekt Pay', data: input.data })

  const logInsert = await supabase
    .from('email_logs')
    .insert({
      organization_id: input.organizationId,
      to_email: to,
      template: input.template,
      subject: built.subject,
      status: isSendGridConfigured() ? 'pending' : 'skipped',
      error: isSendGridConfigured() ? null : 'SendGrid not configured',
      metadata: { ...(input.data ?? {}) },
    })
    .select('id')
    .single()

  const logId = (logInsert.data as any)?.id ?? null

  if (!isSendGridConfigured()) return { ok: false as const, skipped: true as const, reason: 'not_configured' as const, logId }
  if (!fromEmail || !apiKey) return { ok: false as const, skipped: true as const, reason: 'not_configured' as const, logId }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: fromEmail, name: fromName },
        personalizations: [{ to: [{ email: to }] }],
        subject: built.subject,
        content: [{ type: 'text/html', value: built.html }],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (logId) await supabase.from('email_logs').update({ status: 'failed', error: text ? text.slice(0, 500) : `SendGrid error ${res.status}` }).eq('id', logId)
      return { ok: false as const, skipped: false as const, reason: 'send_failed' as const, logId }
    }

    if (logId) await supabase.from('email_logs').update({ status: 'sent', error: null }).eq('id', logId)
    return { ok: true as const, logId }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed'
    if (logId) await supabase.from('email_logs').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', logId)
    return { ok: false as const, skipped: false as const, reason: 'exception' as const, logId }
  }
}

