'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export function DocsThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const current = mounted ? (resolvedTheme ?? theme ?? 'light') : 'light'
  const isDark = current === 'dark'

  return (
    <button
      type="button"
      className="docs-btn"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span style={{ display: 'none' }}>{isDark ? 'Claro' : 'Escuro'}</span>
    </button>
  )
}

