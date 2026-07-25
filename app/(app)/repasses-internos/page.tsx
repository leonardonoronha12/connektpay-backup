import { PayoutsInternalScreen } from '@/components/payouts/PayoutsInternalScreen'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  await requirePageAccess(['owner', 'admin', 'financeiro', 'super_admin'])
  return <PayoutsInternalScreen />
}
