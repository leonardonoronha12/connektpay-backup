'use client'

import { ThemeProvider } from 'next-themes'

export function DocsProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={true} disableTransitionOnChange>
      {children}
    </ThemeProvider>
  )
}

