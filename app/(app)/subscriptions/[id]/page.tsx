import { SubscriptionDetailScreen } from '@/components/screens'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess(['owner', 'admin', 'financeiro', 'super_admin'])
  const { id } = await params
  return <SubscriptionDetailScreen id={id} />
}
