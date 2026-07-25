export type DocsSectionKey =
  | 'inicio'
  | 'status'
  | 'modulos'
  | 'perfis'
  | 'homologacao'
  | 'proxima-fase'

export type DocsNavItem = {
  title: string
  href: string
  sourcePath: string
  section: DocsSectionKey
}

export const DOCS_HOME_SOURCE_PATH = 'docs-web/README.md'

export const DOCS_SECTIONS: Array<{ key: DocsSectionKey; title: string }> = [
  { key: 'inicio', title: 'Início' },
  { key: 'status', title: 'Status do Projeto' },
  { key: 'modulos', title: 'Módulos' },
  { key: 'perfis', title: 'Perfis' },
  { key: 'homologacao', title: 'Guia de Homologação' },
  { key: 'proxima-fase', title: 'Próxima Fase' },
]

export const DOCS_NAV: DocsNavItem[] = [
  {
    section: 'inicio',
    title: 'Início',
    href: '/docs',
    sourcePath: DOCS_HOME_SOURCE_PATH,
  },
  {
    section: 'status',
    title: 'Status do Projeto',
    href: '/docs/status-do-projeto',
    sourcePath: 'docs-web/status-do-projeto.md',
  },
  {
    section: 'modulos',
    title: 'Dashboard',
    href: '/docs/modulos/dashboard',
    sourcePath: 'docs-web/modulos/dashboard.md',
  },
  {
    section: 'modulos',
    title: 'Transações',
    href: '/docs/modulos/transacoes',
    sourcePath: 'docs-web/modulos/transacoes.md',
  },
  {
    section: 'modulos',
    title: 'Links de Pagamento',
    href: '/docs/modulos/links-de-pagamento',
    sourcePath: 'docs-web/modulos/links-de-pagamento.md',
  },
  {
    section: 'modulos',
    title: 'Checkout',
    href: '/docs/modulos/checkout',
    sourcePath: 'docs-web/modulos/checkout.md',
  },
  {
    section: 'modulos',
    title: 'Assinaturas',
    href: '/docs/modulos/assinaturas',
    sourcePath: 'docs-web/modulos/assinaturas.md',
  },
  {
    section: 'modulos',
    title: 'Planos',
    href: '/docs/modulos/planos',
    sourcePath: 'docs-web/modulos/planos.md',
  },
  {
    section: 'modulos',
    title: 'Recebedores',
    href: '/docs/modulos/recebedores',
    sourcePath: 'docs-web/modulos/recebedores.md',
  },
  {
    section: 'modulos',
    title: 'KYC',
    href: '/docs/modulos/kyc',
    sourcePath: 'docs-web/modulos/kyc.md',
  },
  {
    section: 'modulos',
    title: 'Ledger',
    href: '/docs/modulos/ledger',
    sourcePath: 'docs-web/modulos/ledger.md',
  },
  {
    section: 'modulos',
    title: 'Antecipação',
    href: '/docs/modulos/antecipacao',
    sourcePath: 'docs-web/modulos/antecipacao.md',
  },
  {
    section: 'modulos',
    title: 'Repasses',
    href: '/docs/modulos/repasses',
    sourcePath: 'docs-web/modulos/repasses.md',
  },
  {
    section: 'modulos',
    title: 'Conciliação',
    href: '/docs/modulos/conciliacao',
    sourcePath: 'docs-web/modulos/conciliacao.md',
  },
  {
    section: 'modulos',
    title: 'Auditoria',
    href: '/docs/modulos/auditoria',
    sourcePath: 'docs-web/modulos/auditoria.md',
  },
  {
    section: 'modulos',
    title: 'Configurações',
    href: '/docs/modulos/configuracoes',
    sourcePath: 'docs-web/modulos/configuracoes.md',
  },
  {
    section: 'modulos',
    title: 'Integrações',
    href: '/docs/modulos/integracoes',
    sourcePath: 'docs-web/modulos/integracoes.md',
  },
  {
    section: 'modulos',
    title: 'Admin',
    href: '/docs/modulos/admin',
    sourcePath: 'docs-web/modulos/admin.md',
  },
  {
    section: 'perfis',
    title: 'Owner, Admin e Financeiro',
    href: '/docs/perfis',
    sourcePath: 'docs-web/perfis.md',
  },
  {
    section: 'homologacao',
    title: 'Guia de Homologação',
    href: '/docs/guia-de-homologacao',
    sourcePath: 'docs-web/guia-de-homologacao.md',
  },
  {
    section: 'proxima-fase',
    title: 'Próxima Fase',
    href: '/docs/proxima-fase',
    sourcePath: 'docs-web/proxima-fase.md',
  },
]
