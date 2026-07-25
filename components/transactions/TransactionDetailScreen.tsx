'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, QrCode } from 'lucide-react'

import { emitAppToast } from '@/lib/app-events'
import { BORDER, F, FAINT, MONO, MUTED, NAVY, TEXT } from '@/lib/design-tokens'
import { fmtBRL } from '@/utils/format'

function jsonErrorMessage(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return 'Não foi possível carregar a transação.'
  const lower = raw.toLowerCase()
  if (lower.includes('internal server error')) return 'Não foi possível carregar a transação.'
  if (lower.includes('supabase') || lower.includes('postgres') || lower.includes('provider') || lower.includes('sqlstate')) {
    return 'Não foi possível carregar a transação.'
  }
  return raw
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', background: '#FFF7ED', color: '#9A3412', fontFamily: F, fontSize: 12.5 }}>
      {children}
    </div>
  )
}

async function copyWithFeedback(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    emitAppToast({ tone: 'success', title: 'Copiado', message: successMessage })
  } catch {
    emitAppToast({ tone: 'error', title: 'Não foi possível copiar', message: 'Copie o conteúdo manualmente.' })
  }
}

export function TransactionDetailScreen({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transaction, setTransaction] = useState<any | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/transactions?transactionId=${encodeURIComponent(id)}`, { method: 'GET' })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(jsonErrorMessage(json?.error))
          setTransaction(null)
          return
        }
        setTransaction(json?.transaction ?? null)
      } catch (err) {
        setError(jsonErrorMessage(err instanceof Error ? err.message : String(err)))
        setTransaction(null)
      } finally {
        setLoading(false)
      }
    }
    void run()
  }, [id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/transacoes')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'white', color: TEXT, fontFamily: F, fontWeight: 700, cursor: 'pointer' }}
        >
          <ArrowLeft size={14} />
          Voltar para transações
        </button>
        {!loading && transaction?.id ? (
          <button
            onClick={async () => copyWithFeedback(String(transaction.id), 'ID da transação copiado com sucesso.')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'white', color: TEXT, fontFamily: F, fontWeight: 700, cursor: 'pointer' }}
          >
            <Copy size={14} />
            Copiar ID
          </button>
        ) : null}
      </div>

      {error ? <Notice>{error}</Notice> : null}

      <div style={{ background: 'white', borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 1px 4px rgba(2,27,91,.04)', padding: 20 }}>
        {loading ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} style={{ height: 20, borderRadius: 8, background: FAINT }} />
            ))}
          </div>
        ) : !transaction ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <p style={{ fontFamily: F, fontWeight: 800, fontSize: 16, color: TEXT }}>Transação não encontrada</p>
            <p style={{ fontFamily: F, fontSize: 13, color: MUTED }}>Não foi possível localizar esta transação para a sua organização.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                { label: 'ID', value: transaction.id ?? '—', mono: true },
                { label: 'Status', value: transaction.status ?? '—', mono: false },
                { label: 'Valor', value: fmtBRL(Number(transaction.amount ?? 0)), mono: false },
                { label: 'Moeda', value: transaction.currency ?? 'BRL', mono: false },
                { label: 'Referência do provider', value: transaction.provider_reference ?? '—', mono: true },
                {
                  label: 'Criada em',
                  value: transaction.created_at ? new Date(transaction.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—',
                  mono: false,
                },
              ].map((item) => (
                <div key={item.label} style={{ background: FAINT, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 16px' }}>
                  <p style={{ fontFamily: F, fontSize: 11.5, color: MUTED, marginBottom: 4 }}>{item.label}</p>
                  <p style={{ fontFamily: item.mono ? MONO : F, fontSize: 13.5, fontWeight: 700, color: TEXT, wordBreak: 'break-word' }}>{String(item.value)}</p>
                </div>
              ))}
            </div>

            {transaction.pixCopyPaste ? (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 14, padding: 16, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <QrCode size={16} style={{ color: NAVY }} />
                  <p style={{ fontFamily: F, fontWeight: 800, fontSize: 14, color: NAVY }}>PIX Copia e Cola</p>
                </div>
                <p style={{ fontFamily: MONO, fontSize: 12, color: TEXT, wordBreak: 'break-all' }}>{String(transaction.pixCopyPaste)}</p>
                <div>
                  <button
                    onClick={async () => copyWithFeedback(String(transaction.pixCopyPaste), 'Código PIX copiado com sucesso.')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'white', color: TEXT, fontFamily: F, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Copy size={13} />
                    Copiar código PIX
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
