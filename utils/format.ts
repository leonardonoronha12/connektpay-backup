export const fmtBRL = (v: number) =>
  (Number(v ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
