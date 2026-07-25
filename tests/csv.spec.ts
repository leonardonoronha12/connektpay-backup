import { expect, test } from '@playwright/test'

import { buildCsvFilename, buildCsvString } from '@/lib/csv'

test.describe('CSV helpers', () => {
  test('gera CSV com BOM, header e escape de aspas', async () => {
    const csv = buildCsvString(
      [
        { key: 'id', header: 'id' },
        { key: 'name', header: 'name' },
        { key: 'notes', header: 'notes' },
      ],
      [
        {
          id: '1',
          name: 'Cliente "A"',
          notes: 'linha 1, linha 2',
        },
      ]
    )

    expect(csv.startsWith('\uFEFF"id","name","notes"')).toBeTruthy()
    expect(csv).toContain('"Cliente ""A"""')
    expect(csv).toContain('"linha 1, linha 2"')
  })

  test('gera filename estável e sanitizado', async () => {
    const file = buildCsvFilename('Audit Logs', new Date('2026-07-22T12:34:56.789Z'))
    expect(file).toBe('audit-logs-2026-07-22T12-34-56-789Z.csv')
  })

  test('mantem naming consistente para exportacoes administrativas internas', async () => {
    const at = new Date('2026-07-23T10:11:12.130Z')
    expect(buildCsvFilename('receivers', at)).toBe('receivers-2026-07-23T10-11-12-130Z.csv')
    expect(buildCsvFilename('kyc-requests', at)).toBe('kyc-requests-2026-07-23T10-11-12-130Z.csv')
    expect(buildCsvFilename('split-configs', at)).toBe('split-configs-2026-07-23T10-11-12-130Z.csv')
    expect(buildCsvFilename('subscriptions-plans-internal', at)).toBe('subscriptions-plans-internal-2026-07-23T10-11-12-130Z.csv')
    expect(buildCsvFilename('subscriptions-internal', at)).toBe('subscriptions-internal-2026-07-23T10-11-12-130Z.csv')
  })

  test('serializa valores monetarios e datas sem perder UTF-8', async () => {
    const csv = buildCsvString(
      [
        { key: 'receiver_name', header: 'receiver_name' },
        { key: 'amount_centavos', header: 'amount_centavos' },
        { key: 'created_at', header: 'created_at' },
      ],
      [
        {
          receiver_name: 'Recebedor São Paulo',
          amount_centavos: 12345,
          created_at: '2026-07-23T10:11:12.130Z',
        },
      ]
    )

    expect(csv.startsWith('\uFEFF')).toBeTruthy()
    expect(csv).toContain('"Recebedor São Paulo"')
    expect(csv).toContain('"12345"')
    expect(csv).toContain('"2026-07-23T10:11:12.130Z"')
  })
})
