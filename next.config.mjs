const isDevelopment = process.env.NODE_ENV !== 'production'

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''} https:`,
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "form-action 'self'",
  ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
].join('; ')

const nextConfig = {
  outputFileTracingIncludes: {
    '/docs/assets/[...path]': ['./docs/**', './docs-web/**', './Connekt Pay - Apresentação v1.0.0/**', './test-results/**', './playwright-report/**', './*.md'],
    '/docs/search': ['./docs/**', './docs-web/**', './Connekt Pay - Apresentação v1.0.0/**', './*.md'],
    '/docs/[...slug]': ['./docs/**', './docs-web/**', './Connekt Pay - Apresentação v1.0.0/**', './*.md'],
    '/docs': ['./docs/**', './docs-web/**', './*.md'],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
        { key: 'Origin-Agent-Cluster', value: '?1' },
        { key: 'X-DNS-Prefetch-Control', value: 'off' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
  redirects: async () => [
    { source: '/', destination: '/dashboard', permanent: false },
    { source: '/links', destination: '/links-pagamento', permanent: false },
    { source: '/links/novo', destination: '/links-pagamento/novo', permanent: false },
    { source: '/financeiro/ledger', destination: '/ledger', permanent: false },
    { source: '/financeiro/antecipacao', destination: '/antecipacao', permanent: false },
    { source: '/financeiro/repasses', destination: '/repasses', permanent: false },
    { source: '/admin', destination: '/admin/painel', permanent: false },
    { source: '/admin/kyc', destination: '/admin/aprovacao-kyc', permanent: false },
  ],
  webpack: (config, { dev }) => {
    if (dev) {
      // Em desenvolvimento, a suíte E2E escreve artefatos em `artifacts/`, `test-results/`
      // e `playwright-report/`.
      // Se o watcher do Next observar essas pastas, ele recompila e provoca Fast Refresh/reloads durante o teste,
      // cancelando requests e atrapalhando a hidratação (o login vira um submit "nativo" e não chama o Supabase).
      const prev = config.watchOptions?.ignored
      const prevList = (Array.isArray(prev) ? prev : prev ? [prev] : []).filter((x) => typeof x === 'string' && x.trim())
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: [...prevList, '**/artifacts/**', '**/test-results/**', '**/playwright-report/**', '**/QA-E2E-REPORT.md'],
      }
    }
    return config
  },
}

export default nextConfig
