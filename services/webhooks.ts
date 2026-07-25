import type { WebhookEvent } from '@/types/webhooks'

export async function listWebhookEvents(): Promise<WebhookEvent[]> {
  const res = await fetch('/api/events', { method: 'GET' })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) throw new Error(json?.error ?? 'Failed to list webhook events')
  return Array.isArray(json?.events) ? (json.events as WebhookEvent[]) : []
}
