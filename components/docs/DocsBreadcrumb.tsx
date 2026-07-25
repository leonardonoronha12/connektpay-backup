import Link from 'next/link'

export function DocsBreadcrumb({
  segments,
}: {
  segments: Array<{ title: string; href?: string }>
}) {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '18px 18px 0', color: 'var(--muted-foreground)', fontSize: 12.5, fontWeight: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {segments.map((s, idx) => (
          <span key={`${s.title}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {s.href ? (
              <Link href={s.href} prefetch={false} className="docs-link" style={{ color: 'var(--muted-foreground)', fontWeight: 800 }}>
                {s.title}
              </Link>
            ) : (
              <span style={{ color: 'var(--foreground)' }}>{s.title}</span>
            )}
            {idx < segments.length - 1 ? <span style={{ opacity: 0.6 }}>/</span> : null}
          </span>
        ))}
      </div>
    </div>
  )
}
