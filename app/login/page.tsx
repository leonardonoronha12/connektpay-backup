import type { Metadata } from 'next'
import { LoginScreen } from '@/components/screens'

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse sua conta Connekt Pay para acompanhar cobranças, pagamentos e configurações da sua operação.',
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return <LoginScreen />
}
