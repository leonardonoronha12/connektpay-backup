export function DocsMissing({ title }: { title: string }) {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '18px 18px 0' }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, boxShadow: '0 1px 4px rgba(2,27,91,.04)' }}>
        <div style={{ fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>{title}</div>
        <div style={{ color: 'var(--muted-foreground)', fontSize: 13.5, lineHeight: 1.6 }}>
          Não foi possível carregar este conteúdo no momento.
        </div>
      </div>
    </div>
  )
}

