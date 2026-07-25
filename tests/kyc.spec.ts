import { expect, test } from '@playwright/test'

import { inferPersonTypeFromDocument, isValidCNPJ, isValidCPF, onlyDigits, validateDocument } from '@/lib/kyc-core'
import {
  canTransitionInternalKycStatus,
  getRequiredDocumentTypes,
  hasAllRequiredDocuments,
  isReceiverProfileComplete,
  mapInternalStatusToPortuguese,
  mapKycStatusToPortuguese,
  RECEIVER_INTERNAL_STATUS,
  resolveReceiverInternalStatus,
  validateKycFile,
} from '@/lib/receiver-kyc'
import {
  isInternalKycFlowEnabled,
  isInternalReceiversFlowEnabled,
  isMyGatewayKycEnabled,
  isReceiverProviderSyncEnabled,
} from '@/lib/env'

test.describe('KYC (CPF/CNPJ)', () => {
  test('onlyDigits remove não dígitos', async () => {
    expect(onlyDigits('123.456.789-09')).toBe('12345678909')
    expect(onlyDigits('12.345.678/0001-95')).toBe('12345678000195')
    expect(onlyDigits(null)).toBe('')
  })

  test('validação CPF', async () => {
    expect(isValidCPF('111.444.777-35')).toBe(true)
    expect(isValidCPF('11144477735')).toBe(true)
    expect(isValidCPF('000.000.000-00')).toBe(false)
    expect(isValidCPF('123')).toBe(false)
  })

  test('validação CNPJ', async () => {
    expect(isValidCNPJ('45.723.174/0001-10')).toBe(true)
    expect(isValidCNPJ('45723174000110')).toBe(true)
    expect(isValidCNPJ('00.000.000/0000-00')).toBe(false)
    expect(isValidCNPJ('123')).toBe(false)
  })

  test('inferPersonTypeFromDocument', async () => {
    expect(inferPersonTypeFromDocument('111.444.777-35')).toBe('pf')
    expect(inferPersonTypeFromDocument('45.723.174/0001-10')).toBe('pj')
    expect(inferPersonTypeFromDocument('')).toBe(null)
  })

  test('validateDocument aceita CPF ou CNPJ válidos', async () => {
    expect(validateDocument('111.444.777-35')).toBe(true)
    expect(validateDocument('45.723.174/0001-10')).toBe(true)
    expect(validateDocument('111.444.777-00')).toBe(false)
  })
})

test.describe('Recebedores e KYC interno', () => {
  test('perfil PF completo é reconhecido', async () => {
    expect(
      isReceiverProfileComplete({
        personType: 'pf',
        name: 'João da Silva',
        document: '111.444.777-35',
        birthDate: '1990-05-20',
        email: 'joao@empresa.com',
        phone: '(11) 99999-0000',
        address: {
          zip: '01310930',
          street: 'Av. Paulista',
          number: '1000',
          city: 'São Paulo',
          state: 'sp',
        },
        bankAccount: {
          bankCode: '001',
          agency: '1234',
          account: '987654',
          accountType: 'corrente',
          pixKey: 'joao@empresa.com',
        },
      }),
    ).toBe(true)
  })

  test('perfil PJ completo é reconhecido', async () => {
    expect(
      isReceiverProfileComplete({
        personType: 'pj',
        name: 'Connekt Pay Ltda',
        legalName: 'Connekt Pay Ltda',
        tradeName: 'Connekt Pay',
        document: '45.723.174/0001-10',
        legalResponsibleName: 'Maria Souza',
        legalResponsibleDocument: '111.444.777-35',
        email: 'financeiro@connektpay.com',
        phone: '(11) 99999-0000',
        address: {
          zip: '01310930',
          street: 'Av. Paulista',
          number: '1000',
          city: 'São Paulo',
          state: 'SP',
        },
        bankAccount: {
          bank_code: '341',
          agency: '1234',
          account: '7654321',
          account_type: 'corrente',
        },
      }),
    ).toBe(true)
  })

  test('perfil com CPF inválido permanece incompleto', async () => {
    expect(
      isReceiverProfileComplete({
        personType: 'pf',
        name: 'João da Silva',
        document: '111.444.777-00',
        birthDate: '1990-05-20',
        email: 'joao@empresa.com',
        phone: '(11) 99999-0000',
        address: {
          zip: '01310930',
          street: 'Av. Paulista',
          number: '1000',
          city: 'São Paulo',
          state: 'SP',
        },
        bankAccount: {
          bank_code: '001',
          agency: '1234',
          account: '987654',
          account_type: 'corrente',
        },
      }),
    ).toBe(false)
  })

  test('documentos obrigatórios diferenciam PF e PJ', async () => {
    expect(getRequiredDocumentTypes('pf')).toEqual(['document_front', 'document_back', 'selfie', 'proof_of_address'])
    expect(getRequiredDocumentTypes('pj')).toEqual([
      'company_registration',
      'legal_representative_document',
      'document_front',
      'selfie',
      'proof_of_address',
    ])
  })

  test('hasAllRequiredDocuments valida checklist documental', async () => {
    expect(
      hasAllRequiredDocuments('pf', [
        { doc_type: 'document_front' },
        { doc_type: 'document_back' },
        { doc_type: 'selfie' },
        { doc_type: 'proof_of_address' },
      ]),
    ).toBe(true)

    expect(
      hasAllRequiredDocuments('pj', [
        { doc_type: 'company_registration' },
        { doc_type: 'document_front' },
        { doc_type: 'selfie' },
      ]),
    ).toBe(false)
  })

  test('decisões internas de KYC exigem documentos obrigatórios', async () => {
    expect(canTransitionInternalKycStatus({ nextStatus: 'under_review', hasRequiredDocuments: false })).toBe(false)
    expect(canTransitionInternalKycStatus({ nextStatus: 'approved', hasRequiredDocuments: false })).toBe(false)
    expect(canTransitionInternalKycStatus({ nextStatus: 'rejected', hasRequiredDocuments: false })).toBe(false)
    expect(canTransitionInternalKycStatus({ nextStatus: 'approved', hasRequiredDocuments: true })).toBe(true)
  })

  test('validateKycFile aceita upload válido e bloqueia inválidos', async () => {
    expect(
      validateKycFile({
        docType: 'document_front',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        filename: 'documento.pdf',
      }),
    ).toEqual({ ok: true })

    expect(
      validateKycFile({
        docType: 'document_front',
        mimeType: 'text/plain',
        sizeBytes: 1024,
        filename: 'documento.txt',
      }),
    ).toEqual({
      ok: false,
      message: 'Formato de arquivo inválido. Envie PDF, JPG, PNG ou WEBP.',
    })

    expect(
      validateKycFile({
        docType: 'document_front',
        mimeType: 'application/pdf',
        sizeBytes: 11 * 1024 * 1024,
        filename: 'documento.pdf',
      }),
    ).toEqual({
      ok: false,
      message: 'O arquivo excede o limite de 10 MB.',
    })
  })

  test('resolveReceiverInternalStatus respeita o ciclo interno', async () => {
    expect(
      resolveReceiverInternalStatus({
        operationalStatus: 'active',
        kycStatus: 'pending',
        providerReference: null,
        hasProfileComplete: false,
        hasRequiredDocuments: false,
      }),
    ).toBe(RECEIVER_INTERNAL_STATUS.draft)

    expect(
      resolveReceiverInternalStatus({
        operationalStatus: 'active',
        kycStatus: 'under_review',
        providerReference: null,
        hasProfileComplete: true,
        hasRequiredDocuments: true,
      }),
    ).toBe(RECEIVER_INTERNAL_STATUS.underReview)

    expect(
      resolveReceiverInternalStatus({
        operationalStatus: 'active',
        kycStatus: 'approved',
        providerReference: null,
        hasProfileComplete: true,
        hasRequiredDocuments: true,
      }),
    ).toBe(RECEIVER_INTERNAL_STATUS.internallyApproved)

    expect(
      resolveReceiverInternalStatus({
        operationalStatus: 'blocked',
        kycStatus: 'approved',
        providerReference: 'prov_123',
        hasProfileComplete: true,
        hasRequiredDocuments: true,
      }),
    ).toBe(RECEIVER_INTERNAL_STATUS.blocked)
  })

  test('status em português deixam claro quando o fluxo é interno', async () => {
    expect(mapInternalStatusToPortuguese('internally_approved')).toBe('Aprovado internamente')
    expect(mapKycStatusToPortuguese('under_review')).toBe('Em análise interna')
  })
})

test.describe('Feature flags da Fase 2A', () => {
  test('fluxos internos permanecem habilitados por padrão', async () => {
    delete process.env.INTERNAL_RECEIVERS_FLOW_ENABLED
    delete process.env.INTERNAL_KYC_FLOW_ENABLED

    expect(isInternalReceiversFlowEnabled()).toBe(true)
    expect(isInternalKycFlowEnabled()).toBe(true)
  })

  test('sincronização com provider e KYC MyGateway permanecem desligados por padrão', async () => {
    delete process.env.RECEIVER_PROVIDER_SYNC_ENABLED
    delete process.env.MYGATEWAY_KYC_ENABLED

    expect(isReceiverProviderSyncEnabled()).toBe(false)
    expect(isMyGatewayKycEnabled()).toBe(false)
  })
})
