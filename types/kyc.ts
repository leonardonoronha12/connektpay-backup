export type KycStatus = 'pending' | 'under_review' | 'approved' | 'rejected'

export type RiskLevel = 'low' | 'medium' | 'high'

export type KycSubmission = {
  id: string
  receiverId: string
  status: KycStatus
  riskLevel?: RiskLevel
  submittedAt: string
}
