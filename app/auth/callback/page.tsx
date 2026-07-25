'use client'

import { emitAppToast } from '@/lib/app-events'
import { getSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Page() {
  const router = useRouter()
  const [message, setMessage] = useState('Finalizando autenticação...')

  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
      const hashParams = new URLSearchParams(hash)
      const hashAccessToken = hashParams.get('access_token')
      const hashRefreshToken = hashParams.get('refresh_token')
      const code = new URLSearchParams(window.location.search).get('code')
      const supabase = getSupabaseClient()

      const { error } = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : hashAccessToken && hashRefreshToken
          ? await supabase.auth.setSession({ access_token: hashAccessToken, refresh_token: hashRefreshToken })
          : { error: new Error('Missing code') }
      if (error) {
        router.replace('/login')
        return
      }

      setMessage('Preparando sua conta...')
      try {
        const res = await fetch('/api/onboarding/ensure', { method: 'POST' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          const message =
            typeof json?.error === 'string' && json.error.trim()
              ? json.error.trim()
              : 'Sua sessão foi criada, mas não foi possível concluir a preparação inicial da conta agora.'
          setMessage(message)
          emitAppToast({
            tone: 'warning',
            title: 'Conta criada com aviso',
            message: 'Sua sessão foi iniciada, mas a preparação inicial da conta falhou. Você pode continuar e tentar novamente no painel.',
          })
        }
      } catch {
        setMessage('Sua sessão foi criada, mas a preparação inicial da conta não pôde ser concluída agora.')
        emitAppToast({
          tone: 'warning',
          title: 'Conta criada com aviso',
          message: 'Sua sessão foi iniciada, mas a preparação inicial da conta falhou. Você pode continuar e tentar novamente no painel.',
        })
      }
      window.location.assign('/dashboard')
    }

    void run()
  }, [router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <p style={{ fontFamily: 'system-ui', fontSize: 14 }}>{message}</p>
    </div>
  )
}
