export async function requestAnticipation(input: { receiverId: string; amount: number }) {
  const requestedAmount = Number(input.amount)
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) throw new Error('Invalid amount')

  const res = await fetch('/api/anticipations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestedAmount }),
  })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) throw new Error(json?.error ?? 'Failed to request anticipation')
  return json?.anticipationRequest ?? null
}
