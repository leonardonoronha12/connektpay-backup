import Link from 'next/link'

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const slug = typeof sp.slug === 'string' ? sp.slug : null
  const transactionId = typeof sp.transactionId === 'string' ? sp.transactionId : null
  const subscriptionId = typeof sp.subscriptionId === 'string' ? sp.subscriptionId : null

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, border: '1px solid rgba(2,27,91,.12)', boxShadow: '0 8px 40px rgba(2,27,91,.08)', padding: '34px 28px', width: '100%', maxWidth: 520 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: '#021B5B' }}>Pagamento confirmado</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'rgba(2,27,91,.65)', marginBottom: 18 }}>
          {subscriptionId ? 'Sua assinatura foi criada com sucesso.' : 'Sua compra foi processada com sucesso.'}
        </p>
        <div style={{ background: '#FAFBFD', border: '1px solid rgba(2,27,91,.08)', borderRadius: 14, padding: 14, marginBottom: 18 }}>
          <p style={{ fontSize: 11.5, color: 'rgba(2,27,91,.6)', marginBottom: 6 }}>Referências</p>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12.5, color: 'rgba(2,27,91,.7)' }}>Transação</span>
              <span style={{ fontSize: 12.5, color: '#021B5B', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{transactionId ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12.5, color: 'rgba(2,27,91,.7)' }}>Assinatura</span>
              <span style={{ fontSize: 12.5, color: '#021B5B', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{subscriptionId ?? '—'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href={slug ? `/checkout?slug=${encodeURIComponent(slug)}` : '/checkout'}
            style={{
              flex: '1 1 180px',
              textAlign: 'center',
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(2,27,91,.12)',
              background: '#FAFBFD',
              color: '#021B5B',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Voltar ao checkout
          </Link>
          <Link
            href="/login"
            style={{
              flex: '1 1 180px',
              textAlign: 'center',
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: '#39F0AE',
              color: '#021B5B',
              fontWeight: 900,
              textDecoration: 'none',
            }}
          >
            Entrar no painel
          </Link>
        </div>
        <p style={{ marginTop: 14, fontSize: 11.5, color: 'rgba(2,27,91,.55)' }}>
          Você pode fechar esta página com segurança.
        </p>
      </div>
    </div>
  )
}
