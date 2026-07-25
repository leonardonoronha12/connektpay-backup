import { isAnticipationProviderEnabled, isPayoutProviderEnabled } from '@/lib/env'

export function getEnabledReconciliationEntityTypes() {
  const types = ['transaction']
  if (isAnticipationProviderEnabled()) types.push('anticipation')
  if (isPayoutProviderEnabled()) types.push('payout')
  return types
}
