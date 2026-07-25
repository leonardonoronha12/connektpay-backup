import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3008'
const outDir = path.join(process.cwd(), 'docs', 'screenshots')

const routes = [
  { key: 'login', title: 'Login', path: '/login' },
  { key: 'cadastro', title: 'Cadastro', path: '/register' },
  { key: 'checkout', title: 'Checkout', path: '/checkout' },
  { key: 'dashboard', title: 'Dashboard', path: '/dashboard' },
  { key: 'transacoes', title: 'Transações', path: '/transacoes' },
  { key: 'links-pagamento', title: 'Links de Pagamento', path: '/links-pagamento' },
  { key: 'novo-link-pagamento', title: 'Novo Link de Pagamento', path: '/links-pagamento/novo' },
  { key: 'assinaturas', title: 'Assinaturas', path: '/assinaturas' },
  { key: 'recebedores', title: 'Recebedores', path: '/recebedores' },
  { key: 'ledger', title: 'Ledger', path: '/ledger' },
  { key: 'antecipacao', title: 'Antecipação', path: '/antecipacao' },
  { key: 'repasses', title: 'Repasses', path: '/repasses' },
  { key: 'admin-painel', title: 'Painel Administrativo', path: '/admin/painel' },
  { key: 'admin-kyc', title: 'Aprovação KYC', path: '/admin/aprovacao-kyc' },
  { key: 'admin-eventos', title: 'Eventos', path: '/admin/eventos' },
  { key: 'admin-conciliacao', title: 'Conciliação', path: '/admin/conciliacao' },
  { key: 'admin-auditoria', title: 'Auditoria', path: '/admin/auditoria' },
  { key: 'configuracoes', title: 'Configurações', path: '/configuracoes' },
  { key: 'configuracoes-integracoes', title: 'Integrações', path: '/configuracoes/integracoes' },
  { key: 'admin-provedor-financeiro', title: 'Provedor Financeiro', path: '/admin/provedor-financeiro' },
]

const withDevRole = (p) => {
  if (process.env.NODE_ENV !== 'development') return p
  if (p === '/login' || p === '/register' || p === '/checkout') return p
  if (p.includes('?')) return `${p}&as=owner`
  return `${p}?as=owner`
}

const slug = (s) =>
  s
    .toLowerCase()
    .replaceAll('ç', 'c')
    .replaceAll('ã', 'a')
    .replaceAll('õ', 'o')
    .replaceAll('á', 'a')
    .replaceAll('é', 'e')
    .replaceAll('í', 'i')
    .replaceAll('ó', 'o')
    .replaceAll('ú', 'u')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '')

await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})

const manifest = []

for (let i = 0; i < routes.length; i += 1) {
  const r = routes[i]
  const filename = `${String(i + 1).padStart(2, '0')}-${slug(r.key)}.png`
  const filePath = path.join(outDir, filename)
  const page = await context.newPage()
  const url = `${baseUrl}${withDevRole(r.path)}`
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await page.screenshot({ path: filePath, fullPage: true })
  await page.close()

  manifest.push({
    order: i + 1,
    key: r.key,
    title: r.title,
    path: r.path,
    url,
    file: `docs/screenshots/${filename}`,
  })
}

await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
await context.close()
await browser.close()
