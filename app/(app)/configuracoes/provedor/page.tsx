import { requirePageAccess } from '@/lib/rbac-server'
import { ProviderScreen } from '@/components/screens'

export default async function Page() {
  await requirePageAccess(['owner', 'super_admin'])
  return <ProviderScreen />
}
