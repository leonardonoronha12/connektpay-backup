import { IntegracoesScreen } from '@/components/screens'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  await requirePageAccess(['owner', 'super_admin'])
  return <IntegracoesScreen />
}
