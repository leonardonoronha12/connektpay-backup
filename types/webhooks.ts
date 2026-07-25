export type WebhookEventType =
  | 'payment.created'
  | 'payment.pending'
  | 'payment.processing'
  | 'payment.approved'
  | 'payment.paid'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.canceled'
  | 'payment.cancelled'
  | 'subscription.created'
  | 'subscription.renewed'
  | 'split.executed'
  | 'payout.executed'
  | 'kyc.submitted'
  | 'kyc.approved'
  | 'kyc.rejected'

export type WebhookDeliveryStatus = 'pending' | 'processing' | 'processed' | 'failed'

export type WebhookEvent = {
  id: string
  type: WebhookEventType
  status?: WebhookDeliveryStatus
  createdAt: string
  payload: unknown
}
