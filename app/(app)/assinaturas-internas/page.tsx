import { SubscriptionsInternalScreen } from '@/components/subscriptions/SubscriptionsInternalScreen'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  await requirePageAccess(['owner', 'admin', 'financeiro', 'super_admin'])
  return <SubscriptionsInternalScreen />
}
