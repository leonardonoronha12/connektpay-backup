'use client'

import type { AppToastDetail } from '@/lib/app-events'

export type AppToastItem = AppToastDetail & { id: number }

type AppToastStore = {
  toasts: AppToastItem[]
  listeners: Set<() => void>
}

function getStore(): AppToastStore {
  if (typeof window === 'undefined') {
    return { toasts: [], listeners: new Set() }
  }
  const w = window as any
  if (!w.__cpToastStore) {
    w.__cpToastStore = {
      toasts: [],
      listeners: new Set(),
    } satisfies AppToastStore
  }
  return w.__cpToastStore as AppToastStore
}

export function subscribeAppToasts(listener: () => void) {
  const store = getStore()
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}

export function getAppToasts() {
  return getStore().toasts
}

export function pushAppToast(detail: AppToastDetail) {
  if (!detail?.message) return null
  const store = getStore()
  const id = detail.id ?? Date.now() + Math.floor(Math.random() * 1000)
  const next = { ...detail, id }
  store.toasts = [...store.toasts.filter((item) => item.id !== id), next].slice(-3)
  store.listeners.forEach((listener) => listener())
  return id
}

export function dismissAppToast(id: number) {
  const store = getStore()
  const next = store.toasts.filter((item) => item.id !== id)
  if (next.length === store.toasts.length) return
  store.toasts = next
  store.listeners.forEach((listener) => listener())
}
