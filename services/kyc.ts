import type { KycSubmission } from '@/types/kyc'

export async function listKycSubmissions(): Promise<KycSubmission[]> {
  const res = await fetch('/api/kyc-requests', { method: 'GET' })
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) throw new Error(json?.error ?? 'Failed to list KYC submissions')
  return Array.isArray(json?.kycRequests) ? (json.kycRequests as KycSubmission[]) : []
}
