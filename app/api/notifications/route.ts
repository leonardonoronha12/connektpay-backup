import { isSupabaseConfigured, isSupabaseServiceConfigured } from '@/lib/env'
import { insertAuditLog } from '@/lib/audit-log'
import { assertRole, requireSessionOrgContext } from '@/lib/session-org-context'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { classifyInternalApiError } from '@/lib/api-error'
import {
  getOrCreateNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from '@/lib/notifications'
import { NextResponse } from 'next/server'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function serializePreferences(row: any) {
  return {
    organizationId: String(row?.organization_id ?? ''),
    emailEnabled: Boolean(row?.email_enabled ?? true),
    smsEnabled: Boolean(row?.sms_enabled ?? false),
    webhookEnabled: Boolean(row?.webhook_enabled ?? true),
    createdAt: row?.created_at ? String(row.created_at) : null,
    updatedAt: row?.updated_at ? String(row.updated_at) : null,
  }
}

function defaultPreferences() {
  return {
    organizationId: '',
    emailEnabled: true,
    smsEnabled: false,
    webhookEnabled: true,
    createdAt: null,
    updatedAt: null,
  }
}

function canManagePreferences(role: string) {
  return role === 'owner' || role === 'super_admin'
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return json({
      notifications: [],
      unreadCount: 0,
      preferences: defaultPreferences(),
      permissions: { canManagePreferences: false },
    })
  }

  try {
    const ctx = await requireSessionOrgContext()
    const url = new URL(request.url)
    const limitValue = Number(url.searchParams.get('limit') ?? '20')
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.trunc(limitValue), 50) : 20
    const sync = url.searchParams.get('sync') !== 'false'
    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    const [notificationData, preferences] = await Promise.all([
      listNotifications({ supabase, organizationId: ctx.organizationId, limit, sync }),
      getOrCreateNotificationPreferences(supabase, ctx.organizationId),
    ])

    return json({
      ...notificationData,
      preferences: serializePreferences(preferences),
      permissions: { canManagePreferences: canManagePreferences(ctx.role) },
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    const body = (await request.json().catch(() => null)) as
      | null
      | {
          notificationId?: string
          markAllRead?: boolean
        }

    const notificationId = typeof body?.notificationId === 'string' ? body.notificationId.trim() : ''
    const markAllReadRequested = body?.markAllRead === true
    if (!markAllReadRequested && !notificationId) {
      return json({ error: 'Informe uma notificação para atualizar.' }, { status: 400 })
    }

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()

    let notification = null
    if (markAllReadRequested) {
      await markAllNotificationsRead({ supabase, organizationId: ctx.organizationId })
      await insertAuditLog({
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        authType: 'session',
        origin: 'internal_api',
        action: 'UPDATE',
        entity: 'notification',
        entityId: null,
        before: { markAllRead: false },
        after: { markAllRead: true },
      })
    } else {
      notification = await markNotificationRead({
        supabase,
        organizationId: ctx.organizationId,
        notificationId,
      })
      await insertAuditLog({
        organizationId: ctx.organizationId,
        actorProfileId: ctx.actorProfileId,
        authType: 'session',
        origin: 'internal_api',
        action: 'UPDATE',
        entity: 'notification',
        entityId: notificationId,
        before: { read: false },
        after: { read: true },
      })
    }

    const next = await listNotifications({
      supabase,
      organizationId: ctx.organizationId,
      limit: 20,
      sync: false,
    })

    return json({
      ok: true,
      notification,
      ...next,
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) return json({ error: 'Funcionalidade indisponível no momento.' }, { status: 503 })

  try {
    const ctx = await requireSessionOrgContext()
    assertRole(ctx.role, ['owner', 'super_admin'])

    const body = (await request.json().catch(() => null)) as
      | null
      | {
          emailEnabled?: boolean
          smsEnabled?: boolean
          webhookEnabled?: boolean
        }

    const hasPatch =
      typeof body?.emailEnabled === 'boolean' ||
      typeof body?.smsEnabled === 'boolean' ||
      typeof body?.webhookEnabled === 'boolean'

    if (!hasPatch) {
      return json({ error: 'Nenhuma preferência válida foi enviada.' }, { status: 400 })
    }

    const supabase = isSupabaseServiceConfigured() ? getSupabaseAdminClient() : await getSupabaseServerClient()
    const before = await getOrCreateNotificationPreferences(supabase, ctx.organizationId)
    const nextPrefs = await updateNotificationPreferences({
      supabase,
      organizationId: ctx.organizationId,
      emailEnabled: body?.emailEnabled,
      smsEnabled: body?.smsEnabled,
      webhookEnabled: body?.webhookEnabled,
    })
    const notifications = await listNotifications({
      supabase,
      organizationId: ctx.organizationId,
      limit: 20,
      sync: false,
    })

    await insertAuditLog({
      organizationId: ctx.organizationId,
      actorProfileId: ctx.actorProfileId,
      authType: 'session',
      origin: 'internal_api',
      action: 'UPDATE',
      entity: 'notification_preferences',
      entityId: ctx.organizationId,
      before: serializePreferences(before),
      after: serializePreferences(nextPrefs),
    })

    return json({
      preferences: serializePreferences(nextPrefs),
      permissions: { canManagePreferences: true },
      ...notifications,
    })
  } catch (e) {
    const err = classifyInternalApiError(e)
    return json({ error: err.message }, { status: err.status })
  }
}
