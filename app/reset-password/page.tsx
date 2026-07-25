import type { Metadata } from 'next'
import { ResetPasswordScreen } from '@/components/screens'

export const metadata: Metadata = {
  title: 'Redefinir senha',
  description: 'Crie uma nova senha para voltar a acessar sua conta Connekt Pay com segurança.',
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return <ResetPasswordScreen />
}
