import { AppShell } from '@/components/layout/AppShell'
import { normalizeRole } from '@/lib/rbac'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const devRole = process.env.NODE_ENV === 'development' ? normalizeRole(cookieStore.get('cp_dev_role')?.value) : null
  const cookieRole = normalizeRole(cookieStore.get('cp_role')?.value)
  const initialRole = devRole ?? cookieRole

  return <AppShell initialRole={initialRole}>{children}</AppShell>
}
