import { ProviderScreen } from '@/components/screens'
import { requirePageAccess } from '@/lib/rbac-server'

export default async function Page() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <ProviderScreen />
  }

  await requirePageAccess(['owner', 'super_admin'])
  return <ProviderScreen />
}
