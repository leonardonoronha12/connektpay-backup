export function slugifyHeading(input: string) {
  const s = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return s || 'section'
}

export function encodePathSegments(segments: string[]) {
  return segments.map((s) => encodeURIComponent(s)).join('/')
}

