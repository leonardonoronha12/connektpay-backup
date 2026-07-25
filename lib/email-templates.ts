export type EmailTemplateId =
  | 'payment.approved'
  | 'payment.failed'
  | 'payment_link.created'
  | 'subscription.created'
  | 'subscription.canceled'
  | 'recurring.charge.paid'
  | 'recurring.charge.failed'
  | 'kyc.approved'
  | 'kyc.rejected'
  | 'anticipation.approved'
  | 'anticipation.executed'
  | 'payout.paid'
  | 'reconciliation.divergence'

export function buildEmail(input: { template: EmailTemplateId; brandName?: string; data?: Record<string, unknown> }) {
  const brand = input.brandName ?? 'Connekt Pay'
  const d = input.data ?? {}

  const title =
    input.template === 'payment.approved'
      ? 'Pagamento aprovado'
      : input.template === 'payment.failed'
        ? 'Pagamento recusado'
        : input.template === 'payment_link.created'
          ? 'Link criado'
          : input.template === 'subscription.created'
            ? 'Assinatura criada'
            : input.template === 'subscription.canceled'
              ? 'Assinatura cancelada'
              : input.template === 'recurring.charge.paid'
                ? 'Cobrança recorrente aprovada'
                : input.template === 'recurring.charge.failed'
                  ? 'Cobrança recorrente falhou'
                  : input.template === 'kyc.approved'
                    ? 'KYC aprovado'
                    : input.template === 'kyc.rejected'
                      ? 'KYC rejeitado'
                      : input.template === 'anticipation.approved'
                        ? 'Antecipação aprovada'
                        : input.template === 'anticipation.executed'
                          ? 'Antecipação executada'
                          : input.template === 'payout.paid'
                            ? 'Repasse liquidado'
                            : 'Divergência de conciliação'

  const subtitle =
    input.template === 'reconciliation.divergence'
      ? 'Há divergências que exigem revisão.'
      : typeof d.message === 'string'
        ? d.message
        : 'Confira os detalhes no painel.'

  const details = Object.entries(d)
    .filter(([k, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .slice(0, 10)
    .map(([k, v]) => `<tr><td style="padding:8px 10px;border:1px solid #e7eefc;color:#0f172a;font-weight:600">${escapeHtml(k)}</td><td style="padding:8px 10px;border:1px solid #e7eefc;color:#334155">${escapeHtml(String(v))}</td></tr>`)
    .join('')

  const subject = `${brand} · ${title}`

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto; background:#f6f8ff; padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:white;border-radius:14px;border:1px solid #e7eefc;overflow:hidden;">
      <div style="padding:18px 20px;background:#021b5b;color:white;">
        <div style="font-weight:800;font-size:16px;letter-spacing:-0.01em;">${escapeHtml(brand)}</div>
      </div>
      <div style="padding:22px 20px;">
        <div style="font-weight:800;font-size:18px;color:#0f172a;margin:0 0 8px;">${escapeHtml(title)}</div>
        <div style="color:#475569;font-size:13.5;margin:0 0 14px;">${escapeHtml(subtitle)}</div>
        ${details ? `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:12.5px;">${details}</table>` : ''}
        <div style="margin-top:16px;color:#64748b;font-size:12px;">Este é um e-mail transacional. Se você não reconhece esta ação, entre em contato com o suporte.</div>
      </div>
    </div>
  </div>
  `.trim()

  return { subject, html }
}

function escapeHtml(input: string) {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

