from pathlib import Path


path = Path(r"c:\Users\Leonardo\Desktop\ConnektPay\components\screens.tsx")
text = path.read_text(encoding="utf-8")

old = """function Notice({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #FFFDF5 0%, #FFF7D6 100%)',
        border: '1px solid #FDE68A',
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        boxShadow: '0 10px 24px rgba(146,64,14,.05)',
        ...(style ?? null),
      }}
    >
      <AlertCircle size={16} style={{ color: '#D97706', marginTop: 1, flexShrink: 0 }} />
      <div style={{ fontFamily: F, fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}
"""

new = """function Notice({
  children,
  style,
  tone = 'warning',
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  tone?: 'warning' | 'info' | 'success'
}) {
  const palette =
    tone === 'success'
      ? {
          background: 'linear-gradient(180deg, #F0FDF4 0%, #DCFCE7 100%)',
          border: '#86EFAC',
          text: '#166534',
          icon: '#16A34A',
          shadow: 'rgba(22,163,74,.08)',
        }
      : tone === 'info'
        ? {
            background: 'linear-gradient(180deg, #F8FAFC 0%, #E0F2FE 100%)',
            border: '#7DD3FC',
            text: '#0F4C81',
            icon: '#0284C7',
            shadow: 'rgba(2,132,199,.08)',
          }
        : {
            background: 'linear-gradient(180deg, #FFFDF5 0%, #FFF7D6 100%)',
            border: '#FDE68A',
            text: '#92400E',
            icon: '#D97706',
            shadow: 'rgba(146,64,14,.05)',
          }

  return (
    <div
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        boxShadow: `0 10px 24px ${palette.shadow}`,
        ...(style ?? null),
      }}
    >
      <AlertCircle size={16} style={{ color: palette.icon, marginTop: 1, flexShrink: 0 }} />
      <div style={{ fontFamily: F, fontSize: 13, color: palette.text, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}
"""

if old not in text:
    raise SystemExit("Trecho original de Notice nao encontrado para substituicao.")

path.write_text(text.replace(old, new), encoding="utf-8")
