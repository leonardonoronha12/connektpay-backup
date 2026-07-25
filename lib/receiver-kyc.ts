import { inferPersonTypeFromDocument, onlyDigits, validateDocument } from '@/lib/kyc-core'

export const RECEIVER_KYC_ALLOWED_ROLES = ['owner', 'admin', 'super_admin'] as const

export const RECEIVER_INTERNAL_STATUS = {
  draft: 'draft',
  documentsPending: 'documents_pending',
  underReview: 'under_review',
  internallyApproved: 'internally_approved',
  internallyRejected: 'internally_rejected',
  providerPending: 'provider_pending',
  providerSynced: 'provider_synced',
  active: 'active',
  blocked: 'blocked',
} as const

export type ReceiverInternalStatus = (typeof RECEIVER_INTERNAL_STATUS)[keyof typeof RECEIVER_INTERNAL_STATUS]

export const KYC_ALLOWED_STATUSES = ['pending', 'under_review', 'approved', 'rejected'] as const
export type KycWorkflowStatus = (typeof KYC_ALLOWED_STATUSES)[number]

export const KYC_ALLOWED_DOC_TYPES = [
  'document_front',
  'document_back',
  'selfie',
  'proof_of_address',
  'company_registration',
  'legal_representative_document',
  'bank_statement',
] as const

export const KYC_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const KYC_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

export function isAllowedKycDocType(input: unknown): input is (typeof KYC_ALLOWED_DOC_TYPES)[number] {
  return typeof input === 'string' && (KYC_ALLOWED_DOC_TYPES as readonly string[]).includes(input)
}

export function isAllowedKycMimeType(input: unknown) {
  return typeof input === 'string' && (KYC_ALLOWED_MIME_TYPES as readonly string[]).includes(input.toLowerCase())
}

export function normalizeReceiverDocument(input: unknown) {
  return onlyDigits(input)
}

export function normalizePhone(input: unknown) {
  const digits = onlyDigits(input)
  return digits || null
}

export function normalizeEmail(input: unknown) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim().toLowerCase()
  return trimmed || null
}

export function normalizeOptionalText(input: unknown) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return trimmed || null
}

export function normalizeStateCode(input: unknown) {
  const trimmed = normalizeOptionalText(input)
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : null
}

export function normalizeDateInput(input: unknown) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  return trimmed
}

export function sanitizeAddress(input: unknown) {
  const value = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}
  const zip = onlyDigits(value.zip).slice(0, 8)
  const state = normalizeStateCode(value.state)
  return {
    zip: zip || null,
    street: normalizeOptionalText(value.street),
    number: normalizeOptionalText(value.number),
    complement: normalizeOptionalText(value.complement),
    city: normalizeOptionalText(value.city),
    state,
  }
}

export function sanitizeBankAccount(input: unknown) {
  const value = typeof input === 'object' && input ? (input as Record<string, unknown>) : {}
  return {
    bank_code: onlyDigits(value.bank_code ?? value.bankCode).slice(0, 3) || null,
    agency: onlyDigits(value.agency).slice(0, 6) || null,
    account: onlyDigits(value.account).slice(0, 14) || null,
    account_digit: onlyDigits(value.account_digit ?? value.accountDigit).slice(0, 2) || null,
    account_type: normalizeOptionalText(value.account_type ?? value.accountType),
    pix_key: normalizeOptionalText(value.pix_key ?? value.pixKey),
  }
}

export function validateEmail(input: unknown) {
  const email = normalizeEmail(input)
  if (!email) return true
  return email.includes('@') && email.includes('.')
}

export function validateBirthDate(input: unknown) {
  const date = normalizeDateInput(input)
  if (!date) return input == null || input === ''
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return false
  const now = new Date()
  return parsed.getTime() < now.getTime()
}

export function isReceiverProfileComplete(input: {
  personType: 'pf' | 'pj'
  name?: unknown
  legalName?: unknown
  tradeName?: unknown
  document?: unknown
  birthDate?: unknown
  legalResponsibleName?: unknown
  legalResponsibleDocument?: unknown
  email?: unknown
  phone?: unknown
  address?: unknown
  bankAccount?: unknown
}) {
  const name = normalizeOptionalText(input.name)
  const legalName = normalizeOptionalText(input.legalName)
  const tradeName = normalizeOptionalText(input.tradeName)
  const document = normalizeReceiverDocument(input.document)
  const birthDate = normalizeDateInput(input.birthDate)
  const legalResponsibleName = normalizeOptionalText(input.legalResponsibleName)
  const legalResponsibleDocument = normalizeReceiverDocument(input.legalResponsibleDocument)
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone)
  const address = sanitizeAddress(input.address)
  const bank = sanitizeBankAccount(input.bankAccount)

  if (!name || !validateDocument(document)) return false
  if (!email || !validateEmail(email)) return false
  if (!phone || phone.length < 10) return false
  if (!address.zip || !address.street || !address.number || !address.city || !address.state) return false
  if (!bank.bank_code || !bank.agency || !bank.account || !bank.account_type) return false

  if (input.personType === 'pf') {
    if (inferPersonTypeFromDocument(document) !== 'pf') return false
    if (!birthDate || !validateBirthDate(birthDate)) return false
    return true
  }

  if (inferPersonTypeFromDocument(document) !== 'pj') return false
  if (!legalName || !tradeName) return false
  if (!legalResponsibleName || !validateDocument(legalResponsibleDocument) || inferPersonTypeFromDocument(legalResponsibleDocument) !== 'pf') return false
  return true
}

export function countReceiverKycChecklist(input: {
  personType: 'pf' | 'pj'
  hasProfileComplete: boolean
  hasRequiredDocuments: boolean
  kycStatus?: unknown
  providerReference?: unknown
  isBlocked?: boolean
}) {
  let completed = 0
  const total = 4
  if (input.hasProfileComplete) completed += 1
  if (input.hasRequiredDocuments) completed += 1
  if (String(input.kycStatus ?? '') === 'approved') completed += 1
  if (typeof input.providerReference === 'string' && input.providerReference.trim()) completed += 1
  if (input.isBlocked) completed = Math.min(completed, 3)
  return { completed, total, percent: Math.round((completed / total) * 100) }
}

export function getRequiredDocumentTypes(personType: 'pf' | 'pj') {
  return personType === 'pj'
    ? (['company_registration', 'legal_representative_document', 'document_front', 'selfie', 'proof_of_address'] as const)
    : (['document_front', 'document_back', 'selfie', 'proof_of_address'] as const)
}

export function hasAllRequiredDocuments(personType: 'pf' | 'pj', docs: Array<{ doc_type?: unknown }>) {
  const set = new Set(docs.map((doc) => String(doc.doc_type ?? '').trim()).filter(Boolean))
  return getRequiredDocumentTypes(personType).every((type) => set.has(type))
}

export function canTransitionInternalKycStatus(input: { nextStatus: unknown; hasRequiredDocuments: boolean }) {
  const nextStatus = String(input.nextStatus ?? '').trim().toLowerCase()
  if (nextStatus === 'under_review' || nextStatus === 'approved' || nextStatus === 'rejected') {
    return input.hasRequiredDocuments
  }
  return true
}

export function resolveReceiverInternalStatus(input: {
  currentStatus?: unknown
  operationalStatus?: unknown
  kycStatus?: unknown
  providerReference?: unknown
  hasProfileComplete: boolean
  hasRequiredDocuments: boolean
}) {
  const operationalStatus = String(input.operationalStatus ?? 'active')
  if (operationalStatus === RECEIVER_INTERNAL_STATUS.blocked) return RECEIVER_INTERNAL_STATUS.blocked

  const kycStatus = String(input.kycStatus ?? 'pending')
  const hasProviderReference = typeof input.providerReference === 'string' && input.providerReference.trim().length > 0

  if (!input.hasProfileComplete) return RECEIVER_INTERNAL_STATUS.draft
  if (!input.hasRequiredDocuments) return RECEIVER_INTERNAL_STATUS.documentsPending
  if (kycStatus === 'rejected') return RECEIVER_INTERNAL_STATUS.internallyRejected
  if (kycStatus === 'approved' && hasProviderReference) return RECEIVER_INTERNAL_STATUS.active
  if (kycStatus === 'approved') return RECEIVER_INTERNAL_STATUS.internallyApproved
  if (kycStatus === 'under_review') return RECEIVER_INTERNAL_STATUS.underReview
  return RECEIVER_INTERNAL_STATUS.documentsPending
}

export function mapInternalStatusToPortuguese(status: unknown) {
  const value = String(status ?? '').trim().toLowerCase()
  const labels: Record<string, string> = {
    draft: 'Rascunho',
    documents_pending: 'Documentos pendentes',
    under_review: 'Em análise',
    internally_approved: 'Aprovado internamente',
    internally_rejected: 'Reprovado internamente',
    provider_pending: 'Aguardando integração',
    provider_synced: 'Sincronizado com o provedor',
    active: 'Ativo',
    blocked: 'Bloqueado',
  }
  return labels[value] ?? 'Status'
}

export function mapKycStatusToPortuguese(status: unknown) {
  const value = String(status ?? '').trim().toLowerCase()
  const labels: Record<string, string> = {
    pending: 'Aguardando envio para análise',
    under_review: 'Em análise interna',
    approved: 'Aprovado internamente',
    rejected: 'Reprovado internamente',
  }
  return labels[value] ?? 'Status'
}

export function getKycDocumentLabel(docType: unknown) {
  const value = String(docType ?? '').trim().toLowerCase()
  const labels: Record<string, string> = {
    document_front: 'Documento (frente)',
    document_back: 'Documento (verso)',
    selfie: 'Selfie',
    proof_of_address: 'Comprovante de endereco',
    company_registration: 'Contrato social ou cartao CNPJ',
    legal_representative_document: 'Documento do responsavel legal',
    bank_statement: 'Comprovante bancario',
  }
  return labels[value] ?? 'Documento'
}

export function validateKycFile(input: { docType: unknown; mimeType: unknown; sizeBytes: unknown; filename: unknown }) {
  if (!isAllowedKycDocType(input.docType)) return { ok: false as const, message: 'Tipo de documento inválido.' }
  if (!isAllowedKycMimeType(input.mimeType)) return { ok: false as const, message: 'Formato de arquivo inválido. Envie PDF, JPG, PNG ou WEBP.' }
  const sizeBytes = typeof input.sizeBytes === 'number' ? input.sizeBytes : Number(input.sizeBytes ?? 0)
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false as const, message: 'Arquivo inválido. Tente novamente.' }
  if (sizeBytes > KYC_FILE_MAX_SIZE_BYTES) return { ok: false as const, message: 'O arquivo excede o limite de 10 MB.' }
  const filename = typeof input.filename === 'string' ? input.filename.trim() : ''
  if (!filename) return { ok: false as const, message: 'Arquivo inválido. Tente novamente.' }
  return { ok: true as const }
}

export function getSafeFileExtension(filename: unknown) {
  if (typeof filename !== 'string') return null
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!match) return null
  const ext = match[1]
  if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) return null
  return ext
}

export function maskDocument(input: unknown) {
  const digits = onlyDigits(input)
  if (digits.length <= 4) return digits
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`
}

export function redactBankAccount(input: unknown) {
  const bank = sanitizeBankAccount(input)
  return {
    bank_code: bank.bank_code,
    agency: bank.agency ? `${bank.agency.slice(0, 2)}***` : null,
    account: bank.account ? `***${bank.account.slice(-3)}` : null,
    account_digit: bank.account_digit ? '*' : null,
    account_type: bank.account_type,
    pix_key: bank.pix_key ? '***' : null,
  }
}

export function redactReceiverForAudit(input: Record<string, unknown> | null | undefined) {
  if (!input) return null
  return {
    id: typeof input.id === 'string' ? input.id : null,
    type: typeof input.type === 'string' ? input.type : null,
    internal_status: typeof input.internal_status === 'string' ? input.internal_status : null,
    kyc_status: typeof input.kyc_status === 'string' ? input.kyc_status : null,
    status: typeof input.status === 'string' ? input.status : null,
    provider_reference: typeof input.provider_reference === 'string' && input.provider_reference ? 'configured' : null,
    name: normalizeOptionalText(input.name),
    legal_name: normalizeOptionalText(input.legal_name),
    trade_name: normalizeOptionalText(input.trade_name),
    birth_date: normalizeDateInput(input.birth_date),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone) ? 'configured' : null,
    document_masked: maskDocument(input.document),
    legal_responsible_name: normalizeOptionalText(input.legal_responsible_name),
    legal_responsible_document_masked: maskDocument(input.legal_responsible_document),
    address: sanitizeAddress(input.address),
    bank_account: redactBankAccount(input.bank_account),
  }
}

export function redactKycRequestForAudit(input: Record<string, unknown> | null | undefined) {
  if (!input) return null
  return {
    id: typeof input.id === 'string' ? input.id : null,
    receiver_id: typeof input.receiver_id === 'string' ? input.receiver_id : null,
    status: typeof input.status === 'string' ? input.status : null,
    risk: normalizeOptionalText(input.risk),
    submitted_at: typeof input.submitted_at === 'string' ? input.submitted_at : null,
    reviewed_at: typeof input.reviewed_at === 'string' ? input.reviewed_at : null,
    decision_reason: normalizeOptionalText(input.decision_reason),
    internal_notes: normalizeOptionalText(input.internal_notes),
    reviewed_by_profile_id: typeof input.reviewed_by_profile_id === 'string' ? input.reviewed_by_profile_id : null,
  }
}

export function redactKycDocumentForAudit(input: Record<string, unknown> | null | undefined) {
  if (!input) return null
  return {
    id: typeof input.id === 'string' ? input.id : null,
    receiver_id: typeof input.receiver_id === 'string' ? input.receiver_id : null,
    kyc_request_id: typeof input.kyc_request_id === 'string' ? input.kyc_request_id : null,
    doc_type: typeof input.doc_type === 'string' ? input.doc_type : null,
    mime_type: typeof input.mime_type === 'string' ? input.mime_type : null,
    size_bytes: typeof input.size_bytes === 'number' ? input.size_bytes : Number(input.size_bytes ?? 0),
    storage_path: typeof input.storage_path === 'string' ? 'stored' : null,
    status: typeof input.status === 'string' ? input.status : null,
  }
}

export function buildReceiverEducationMessage() {
  return 'Cadastre os dados de quem recebera os valores da sua operacao. Esta analise e interna da Connekt Pay.'
}

export function buildKycEducationMessage() {
  return 'Esta analise e interna da Connekt Pay. A sincronizacao com a MyGateway sera habilitada apos a integracao com o provedor.'
}
