'use client'

import Image from 'next/image'
import Link from 'next/link'

const wrapper: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'linear-gradient(180deg, #F8FAFF 0%, #F4F6FB 100%)',
}

const panel: React.CSSProperties = {
  width: '100%',
  maxWidth: 580,
  borderRadius: 28,
  border: '1px solid rgba(2,27,91,.08)',
  background: 'rgba(255,255,255,.97)',
  boxShadow: '0 24px 56px rgba(2,27,91,.08)',
  padding: 30,
}

const secondaryButton: React.CSSProperties = {
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '0 16px',
  borderRadius: 12,
  border: '1px solid rgba(2,27,91,.08)',
  background: 'white',
  color: '#021B5B',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
}

const primaryButton: React.CSSProperties = {
  ...secondaryButton,
  background: 'linear-gradient(180deg, #39F0AE 0%, #22C98A 100%)',
  border: 'none',
  boxShadow: '0 10px 24px rgba(57,240,174,.2)',
}

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>
        <div style={wrapper}>
          <div style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Image src="/brand/logo-purple.png" alt="Connekt Pay" width={182} height={54} priority style={{ height: 32, width: 'auto' }} />
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '7px 11px',
                  borderRadius: 999,
                  background: 'rgba(245,158,11,.12)',
                  color: '#92400E',
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                Recarregando a experiência
              </div>
            </div>

            <h1 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 30, fontWeight: 800, color: '#0A0F1E', lineHeight: 1.15, marginBottom: 10 }}>
              Não foi possível abrir esta tela agora
            </h1>
            <p style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 24 }}>
              Isso pode acontecer por uma instabilidade temporária. Tente recarregar esta área ou volte para o dashboard para continuar usando a plataforma.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={reset} style={primaryButton}>
                Tentar novamente
              </button>
              <Link href="/dashboard" style={secondaryButton}>
                Ir para o dashboard
              </Link>
              <Link href="/login" style={secondaryButton}>
                Voltar para o login
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
