import { ReppassesScreen } from '@/components/screens'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  await requirePageAccess(['owner', 'financeiro', 'super_admin'])
  return <ReppassesScreen />
}
