'use client'

export type AppToastTone = 'success' | 'warning' | 'error' | 'info' | 'loading'

export type AppToastDetail = {
  id?: number
  tone: AppToastTone
  title?: string
  message: string
  durationMs?: number
}

export type AppGuideEventDetail = {
  target?: string
}

export const APP_TOAST_EVENT = 'cp:toast'
export const APP_GUIDE_EVENT = 'cp:guide'

export function tonePalette(tone: AppToastTone) {
  switch (tone) {
    case 'success':
      return { bg: '#ECFDF5', border: '#A7F3D0', title: '#065F46', text: '#047857', icon: 'OK' }
    case 'warning':
      return { bg: '#FFF7ED', border: '#FED7AA', title: '#9A3412', text: '#C2410C', icon: '!' }
    case 'error':
      return { bg: '#FEF2F2', border: '#FECACA', title: '#991B1B', text: '#B91C1C', icon: '!' }
    case 'loading':
      return { bg: '#EFF6FF', border: '#BFDBFE', title: '#1D4ED8', text: '#2563EB', icon: '...' }
    default:
      return { bg: '#F8FAFC', border: '#CBD5E1', title: '#0F172A', text: '#475569', icon: 'i' }
  }
}

export function emitAppToast(detail: AppToastDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail }))
}

export function openGuide(target: 'onboarding' | 'tour', detail?: AppGuideEventDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AppGuideEventDetail>(`${APP_GUIDE_EVENT}:${target}`, { detail }))
}
