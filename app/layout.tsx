import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://connektpay.vercel.app'),
  applicationName: 'Connekt Pay',
  title: {
    default: 'Connekt Pay',
    template: '%s | Connekt Pay',
  },
  description: 'Infraestrutura financeira com experiência simples, profissional e pronta para operação.',
  keywords: ['Connekt Pay', 'pagamentos', 'infraestrutura financeira', 'links de pagamento', 'recebedores', 'SaaS fintech'],
  openGraph: {
    title: 'Connekt Pay',
    description: 'Infraestrutura financeira com experiência simples, profissional e pronta para operação.',
    url: 'https://connektpay.vercel.app',
    siteName: 'Connekt Pay',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: '/brand/logo-purple.png',
        width: 1200,
        height: 630,
        alt: 'Connekt Pay',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Connekt Pay',
    description: 'Infraestrutura financeira com experiência simples, profissional e pronta para operação.',
    images: ['/brand/logo-purple.png'],
  },
  icons: {
    icon: '/brand/simbolo-roxo-1.svg',
    shortcut: '/brand/simbolo-roxo-1.svg',
    apple: '/brand/logo-purple.png',
  },
  category: 'finance',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
