import Image from 'next/image'

const surface: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'linear-gradient(180deg, #F8FAFF 0%, #F4F6FB 100%)',
}

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 520,
  borderRadius: 28,
  border: '1px solid rgba(2,27,91,.08)',
  background: 'rgba(255,255,255,.96)',
  boxShadow: '0 24px 60px rgba(2,27,91,.08)',
  padding: 28,
}

export default function Loading() {
  return (
    <div style={surface}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <Image src="/brand/logo-purple.png" alt="Connekt Pay" width={160} height={48} priority style={{ height: 30, width: 'auto' }} />
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 11px',
              borderRadius: 999,
              background: 'rgba(2,27,91,.05)',
              color: '#021B5B',
              fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            <span className="inline-block w-4 h-4 rounded-full border-2 border-[#021B5B] border-t-transparent animate-spin" />
            Preparando sua experiência
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontWeight: 800, fontSize: 24, color: '#0A0F1E', marginBottom: 8 }}>
            Carregando a Connekt Pay
          </div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 14, color: '#64748B', lineHeight: 1.6 }}>
            Estamos organizando seus dados para deixar a próxima tela pronta para uso.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="cp-skeleton" style={{ height: 14, width: '48%', borderRadius: 999 }} />
          <div className="cp-skeleton" style={{ height: 88, width: '100%', borderRadius: 20 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div className="cp-skeleton" style={{ height: 74, width: '100%', borderRadius: 18 }} />
            <div className="cp-skeleton" style={{ height: 74, width: '100%', borderRadius: 18 }} />
            <div className="cp-skeleton" style={{ height: 74, width: '100%', borderRadius: 18 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
