import type { Metadata } from 'next'
import { RegisterScreen } from '@/components/screens'

export const metadata: Metadata = {
  title: 'Criar conta',
  description: 'Crie sua conta Connekt Pay para configurar sua operação financeira com clareza e segurança.',
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return <RegisterScreen />
}
