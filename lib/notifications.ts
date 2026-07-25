type NotificationSeverity = 'info' | 'warning' | 'error' | 'success'

type NotificationCandidate = {
  type: string
  severity: NotificationSeverity
  title: string
  message: string
  href: string | null
  sourceType: string
  sourceId: string
  metadata?: Record<string, unknown>
  createdAt?: string | null
}

const MANAGED_SOURCE_TYPES = ['kyc_request', 'webhook_event', 'reconciliation_item'] as const

const DEFAULT_NOTIFICATION_PREFERENCES = {
  email_enabled: true,
  sms_enabled: false,
  webhook_enabled: true,
}

function isSafeNotificationStorageError(err: any) {
  const code = err?.code ? String(err.code) : ''
  if (code === '42P01' || code === '42703' || code === 'PGRST205') return true
  const msg = err?.message ? String(err.message).toLowerCase() : ''
  return msg.includes('schema cache') || msg.includes('does not exist')
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('pt-BR')
}

function notificationKey(sourceType: string, sourceId: string) {
  return `${sourceType}:${sourceId}`
}

function serializeNotification(row: any) {
  return {
    id: String(row.id),
    type: String(row.type ?? 'info'),
    severity: String(row.severity ?? 'info'),
    title: String(row.title ?? ''),
    message: String(row.message ?? ''),
    href: row.href ? String(row.href) : null,
    read: Boolean(row.read_at),
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    metadata: row.metadata ?? {},
  }
}

export async function getOrCreateNotificationPreferences(supabase: any, organizationId: string) {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('organization_id, email_enabled, sms_enabled, webhook_enabled, created_at, updated_at')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    if (isSafeNotificationStorageError(error)) {
      return { organization_id: organizationId, ...DEFAULT_NOTIFICATION_PREFERENCES, created_at: null, updated_at: null }
    }
    throw error
  }

  if (data) return data

  const { data: created, error: insertError } = await supabase
    .from('notification_preferences')
    .insert({ organization_id: organizationId, ...DEFAULT_NOTIFICATION_PREFERENCES })
    .select('organization_id, email_enabled, sms_enabled, webhook_enabled, created_at, updated_at')
    .single()

  if (insertError) {
    if (isSafeNotificationStorageError(insertError)) {
      return { organization_id: organizationId, ...DEFAULT_NOTIFICATION_PREFERENCES, created_at: null, updated_at: null }
    }
    throw insertError
  }

  return created
}

export async function updateNotificationPreferences(input: {
  supabase: any
  organizationId: string
  emailEnabled?: boolean
  smsEnabled?: boolean
  webhookEnabled?: boolean
}) {
  await getOrCreateNotificationPreferences(input.supabase, input.organizationId)
  const patch: Record<string, unknown> = {}
  if (typeof input.emailEnabled === 'boolean') patch.email_enabled = input.emailEnabled
  if (typeof input.smsEnabled === 'boolean') patch.sms_enabled = input.smsEnabled
  if (typeof input.webhookEnabled === 'boolean') patch.webhook_enabled = input.webhookEnabled

  const { data, error } = await input.supabase
    .from('notification_preferences')
    .update(patch)
    .eq('organization_id', input.organizationId)
    .select('organization_id, email_enabled, sms_enabled, webhook_enabled, created_at, updated_at')
    .single()

  if (error) throw error
  return data
}

async function listPendingKycCandidates(supabase: any, organizationId: string): Promise<NotificationCandidate[]> {
  const { data, error } = await supabase
    .from('kyc_requests')
    .select('id, created_at, receiver:receivers(name)')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) {
    if (isSafeNotificationStorageError(error)) return []
    throw error
  }

  return (data ?? []).map((row: any) => {
    const receiverName = row?.receiver?.name ? String(row.receiver.name) : 'Recebedor'
    const createdAtLabel = fmtDateTime(row?.created_at)
    return {
      type: 'kyc.pending',
      severity: 'warning',
      title: 'KYC aguardando análise',
      message: createdAtLabel ? `${receiverName} está pendente desde ${createdAtLabel}.` : `${receiverName} está pendente de análise.`,
      href: '/admin/aprovacao-kyc',
      sourceType: 'kyc_request',
      sourceId: String(row.id),
      metadata: { kyc_request_id: row.id, receiver_name: receiverName },
      createdAt: row?.created_at ? String(row.created_at) : null,
    }
  })
}

async function listFailedWebhookCandidates(supabase: any, organizationId: string): Promise<NotificationCandidate[]> {
  const { data, error } = await supabase
    .from('webhook_events')
    .select('id, type, created_at, last_error')
    .eq('organization_id', organizationId)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    if (isSafeNotificationStorageError(error)) return []
    throw error
  }

  return (data ?? []).map((row: any) => ({
    type: 'webhook.failed',
    severity: 'error',
    title: 'Falha no processamento de evento',
    message: row?.last_error
      ? `Evento ${String(row.type ?? 'desconhecido')} falhou: ${String(row.last_error)}`
      : `Evento ${String(row.type ?? 'desconhecido')} falhou e requer reprocessamento.`,
    href: '/admin/eventos',
    sourceType: 'webhook_event',
    sourceId: String(row.id),
    metadata: { event_id: row.id, event_type: row?.type ?? null },
    createdAt: row?.created_at ? String(row.created_at) : null,
  }))
}

async function listConciliationCandidates(supabase: any, organizationId: string): Promise<NotificationCandidate[]> {
  const { data, error } = await supabase
    .from('pay_conciliation_items')
    .select('id, entity_type, entity_id, provider_reference, status, created_at')
    .eq('organization_id', organizationId)
    .in('status', ['divergent', 'pending'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    if (isSafeNotificationStorageError(error)) return []
    throw error
  }

  return (data ?? []).map((row: any) => {
    const entityLabel = row?.entity_type ? String(row.entity_type) : 'item'
    const reference = row?.provider_reference ? String(row.provider_reference) : row?.entity_id ? String(row.entity_id) : 'sem referência'
    const isDivergent = String(row?.status ?? '') === 'divergent'
    return {
      type: isDivergent ? 'reconciliation.divergence' : 'reconciliation.pending',
      severity: isDivergent ? 'warning' : 'info',
      title: isDivergent ? 'Divergência de conciliação' : 'Item aguardando conciliação',
      message: `${entityLabel} ${reference} exige revisão manual na conciliação.`,
      href: '/admin/conciliacao',
      sourceType: 'reconciliation_item',
      sourceId: String(row.id),
      metadata: { entity_type: row?.entity_type ?? null, entity_id: row?.entity_id ?? null, provider_reference: row?.provider_reference ?? null },
      createdAt: row?.created_at ? String(row.created_at) : null,
    }
  })
}

async function listManagedCandidates(supabase: any, organizationId: string) {
  const [kyc, webhook, conciliation] = await Promise.all([
    listPendingKycCandidates(supabase, organizationId),
    listFailedWebhookCandidates(supabase, organizationId),
    listConciliationCandidates(supabase, organizationId),
  ])

  return [...kyc, ...webhook, ...conciliation]
}

export async function syncOperationalNotifications(input: { supabase: any; organizationId: string }) {
  const { supabase, organizationId } = input
  const candidates = await listManagedCandidates(supabase, organizationId)

  const { data: existingRows, error } = await supabase
    .from('notifications')
    .select('id, source_type, source_id')
    .eq('organization_id', organizationId)
    .in('source_type', [...MANAGED_SOURCE_TYPES])
    .is('resolved_at', null)

  if (error) {
    if (isSafeNotificationStorageError(error)) return []
    throw error
  }

  const existing = new Map<string, any>()
  for (const row of existingRows ?? []) {
    existing.set(notificationKey(String(row.source_type ?? ''), String(row.source_id ?? '')), row)
  }

  const openKeys = new Set<string>()
  for (const candidate of candidates) {
    const key = notificationKey(candidate.sourceType, candidate.sourceId)
    openKeys.add(key)
    if (existing.has(key)) continue

    await supabase.from('notifications').insert({
      organization_id: organizationId,
      type: candidate.type,
      severity: candidate.severity,
      title: candidate.title,
      message: candidate.message,
      href: candidate.href,
      source_type: candidate.sourceType,
      source_id: candidate.sourceId,
      metadata: candidate.metadata ?? {},
      created_at: candidate.createdAt ?? undefined,
    })
  }

  const staleIds = (existingRows ?? [])
    .filter((row: any) => !openKeys.has(notificationKey(String(row.source_type ?? ''), String(row.source_id ?? ''))))
    .map((row: any) => String(row.id))

  if (staleIds.length > 0) {
    await supabase.from('notifications').update({ resolved_at: new Date().toISOString() }).in('id', staleIds)
  }

  return candidates
}

export async function listNotifications(input: { supabase: any; organizationId: string; limit?: number; sync?: boolean }) {
  const { supabase, organizationId } = input
  if (input.sync !== false) await syncOperationalNotifications({ supabase, organizationId })

  const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(input.limit, 50) : 20
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, severity, title, message, href, metadata, read_at, resolved_at, created_at')
    .eq('organization_id', organizationId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isSafeNotificationStorageError(error)) return { notifications: [], unreadCount: 0 }
    throw error
  }

  const { count, error: countError } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('resolved_at', null)
    .is('read_at', null)

  if (countError && !isSafeNotificationStorageError(countError)) throw countError

  return {
    notifications: (data ?? []).map(serializeNotification),
    unreadCount: count ?? 0,
  }
}

export async function markNotificationRead(input: { supabase: any; organizationId: string; notificationId: string }) {
  const { data, error } = await input.supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', input.organizationId)
    .eq('id', input.notificationId)
    .is('resolved_at', null)
    .select('id, type, severity, title, message, href, metadata, read_at, resolved_at, created_at')
    .maybeSingle()

  if (error) throw error
  return data ? serializeNotification(data) : null
}

export async function markAllNotificationsRead(input: { supabase: any; organizationId: string }) {
  const now = new Date().toISOString()
  const { error } = await input.supabase
    .from('notifications')
    .update({ read_at: now })
    .eq('organization_id', input.organizationId)
    .is('resolved_at', null)
    .is('read_at', null)

  if (error && !isSafeNotificationStorageError(error)) throw error
}

export async function createOperationalNotification(input: {
  supabase: any
  organizationId: string
  type: string
  severity: NotificationSeverity
  title: string
  message: string
  href?: string | null
  sourceType?: string | null
  sourceId?: string | null
  metadata?: Record<string, unknown>
}) {
  const payload = {
    organization_id: input.organizationId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    message: input.message,
    href: input.href ?? null,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    metadata: input.metadata ?? {},
  }

  if (input.sourceType && input.sourceId) {
    const { data: existing, error: lookupError } = await input.supabase
      .from('notifications')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('source_type', input.sourceType)
      .eq('source_id', input.sourceId)
      .is('resolved_at', null)
      .maybeSingle()

    if (lookupError && !isSafeNotificationStorageError(lookupError)) throw lookupError
    if (existing?.id) return existing
  }

  const { data, error } = await input.supabase.from('notifications').insert(payload).select('id').maybeSingle()
  if (error && !isSafeNotificationStorageError(error)) throw error
  return data ?? null
}
