import { AdminAnticipationInternalScreen } from '@/components/anticipation/AnticipationInternalScreen'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  await requirePageAccess(['owner', 'admin', 'super_admin'])
  return <AdminAnticipationInternalScreen />
}
