export type CsvColumn<T> = {
  key: keyof T | string
  header: string
}

function sanitizeFilenamePart(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'export'
}

function toCsvCell(value: unknown) {
  if (value == null) return '""'
  if (value instanceof Date) return `"${value.toISOString()}"`
  return `"${String(value).replaceAll('"', '""')}"`
}

export function buildCsvString<T extends Record<string, unknown>>(columns: CsvColumn<T>[], rows: T[]) {
  const header = columns.map((column) => toCsvCell(column.header)).join(',')
  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const key = String(column.key)
        return toCsvCell((row as Record<string, unknown>)[key])
      })
      .join(',')
  )
  return ['\uFEFF' + header, ...lines].join('\n')
}

export function buildCsvFilename(prefix: string, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  return `${sanitizeFilenamePart(prefix)}-${stamp}.csv`
}
