import { ConciliationScreen } from '@/components/screens'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  await requirePageAccess(['owner', 'admin', 'financeiro', 'super_admin'])
  return <ConciliationScreen />
}
