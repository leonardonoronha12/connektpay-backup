import './docs.css'
import { DocsProviders } from '@/components/docs/DocsProviders'
import { DocsShell } from '@/components/docs/DocsShell'
import { getDocsNav } from '@/lib/docs/store'

export default function Layout({ children }: { children: React.ReactNode }) {
  const nav = getDocsNav()
  return (
    <DocsProviders>
      <DocsShell nav={nav}>{children}</DocsShell>
    </DocsProviders>
  )
}

