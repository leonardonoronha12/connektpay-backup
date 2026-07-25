import { TransactionDetailScreen } from '@/components/transactions/TransactionDetailScreen'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess(['owner', 'admin', 'financeiro', 'operacional', 'super_admin'])
  const { id } = await params
  return <TransactionDetailScreen id={id} />
}
