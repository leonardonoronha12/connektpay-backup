import { AnticipationInternalScreen } from '@/components/anticipation/AnticipationInternalScreen'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  await requirePageAccess(['owner', 'financeiro', 'super_admin'])
  return <AnticipationInternalScreen />
}
