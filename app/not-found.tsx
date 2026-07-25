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
  maxWidth: 560,
  borderRadius: 28,
  border: '1px solid rgba(2,27,91,.08)',
  background: 'rgba(255,255,255,.97)',
  boxShadow: '0 24px 56px rgba(2,27,91,.08)',
  padding: 30,
  textAlign: 'center',
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
}

const primaryButton: React.CSSProperties = {
  ...secondaryButton,
  background: 'linear-gradient(180deg, #39F0AE 0%, #22C98A 100%)',
  border: 'none',
  color: '#021B5B',
  boxShadow: '0 10px 24px rgba(57,240,174,.2)',
}

export default function NotFound() {
  return (
    <div style={wrapper}>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Image src="/brand/logo-purple.png" alt="Connekt Pay" width={182} height={54} priority style={{ height: 34, width: 'auto' }} />
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '7px 11px',
            borderRadius: 999,
            background: 'rgba(2,27,91,.05)',
            color: '#021B5B',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          Página não encontrada
        </div>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 30, fontWeight: 800, color: '#0A0F1E', lineHeight: 1.15, marginBottom: 10 }}>
          Esta página não está disponível
        </h1>
        <p style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 14, color: '#64748B', lineHeight: 1.7, marginBottom: 24 }}>
          O link pode estar incorreto ou a tela pode ter sido movida. Você pode voltar ao dashboard ou acessar a documentação para continuar.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/dashboard" style={primaryButton}>
            Ir para o dashboard
          </Link>
          <Link href="/docs" style={secondaryButton}>
            Abrir documentação
          </Link>
          <Link href="/login" style={secondaryButton}>
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  )
}
