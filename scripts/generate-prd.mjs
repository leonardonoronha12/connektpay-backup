import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { marked } from 'marked'
import { chromium } from 'playwright'

const root = process.cwd()
const docsDir = path.join(root, 'docs')
const screenshotsDir = path.join(docsDir, 'screenshots')
const mdPath = path.join(docsDir, 'PRD-Connekt-Pay.md')
const pdfPath = path.join(docsDir, 'PRD-Connekt-Pay.pdf')

await fs.mkdir(docsDir, { recursive: true })

let manifest = []
try {
  const raw = await fs.readFile(path.join(screenshotsDir, 'manifest.json'), 'utf8')
  manifest = JSON.parse(raw)
} catch {
  manifest = []
}

const screenshotForKey = (key) => {
  const found = manifest.find((m) => m.key === key)
  if (found?.file) return found.file.replaceAll('\\', '/').replace(/^docs\//, './')
  return null
}

const now = new Date()
const dateBR = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

const blocks = []

blocks.push(`# Connekt Pay`)
blocks.push(`Documento: PRD Oficial do Produto`)
blocks.push(`Atualização: ${dateBR}`)
blocks.push(``)
blocks.push(`> Este PRD descreve o comportamento final esperado do Connekt Pay, mantendo as mesmas telas já existentes no sistema. As imagens incluídas foram geradas automaticamente a partir das rotas atuais para referência visual.`)
blocks.push(``)

blocks.push(`## Visão Geral`)
blocks.push(`O Connekt Pay é uma plataforma web de infraestrutura financeira para empresas no Brasil, reunindo operações de pagamentos, links de cobrança, recorrência, gestão de recebedores, split, ledger interno, antecipação, repasses, conciliação, webhooks, KYC, auditoria e configurações de provedor.`)
blocks.push(``)
blocks.push(`**Escopo documentado (existente no projeto):** Login, Cadastro, Checkout, Dashboard, Transações, Links de Pagamento, Novo Link de Pagamento, Assinaturas, Recebedores, Ledger, Antecipação, Repasses, Painel Administrativo, Aprovação KYC, Eventos, Conciliação, Auditoria, Configurações, Integrações, Provedor Financeiro.`)
blocks.push(``)

blocks.push(`## Arquitetura`)
blocks.push(`### Next.js`)
blocks.push(`- Framework: Next.js (App Router).`)
blocks.push(`- Rotas: definidas em \`/app\` com route groups (ex.: \`/app/(app)\`).`)
blocks.push(`- Layout autenticado: Sidebar + Header via AppShell.`)
blocks.push(`- Estilos: Tailwind v4 + CSS com tokens e estilos inline predominantes.`)
blocks.push(`- Build: \`next build\` e \`next start\`.`)
blocks.push(``)
blocks.push(`### Supabase`)
blocks.push(`- Cliente configurável via variáveis \`NEXT_PUBLIC_SUPABASE_URL\` e \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`.`)
blocks.push(`- Hook de sessão existente para leitura de sessão e subscription de auth state change.`)
blocks.push(`- Autenticação e autorização: Supabase Auth integrado ao App Router, com papéis e permissões por organização.`)
blocks.push(`- Banco de dados: PostgreSQL (Supabase) com RLS para isolamento multi-tenant.`)
blocks.push(`- Webhooks e eventos: persistência de eventos e tentativas para reprocessamento e observabilidade.`)
blocks.push(``)
blocks.push(`### PostgreSQL`)
blocks.push(`- Banco relacional principal para entidades de produto (organizações, clientes, recebedores, transações, assinaturas, ledger, conciliação, KYC e auditoria).`)
blocks.push(`- Modelo multi-tenant por organização, com políticas RLS e trilha de auditoria imutável.`)
blocks.push(``)
blocks.push(`### GitHub`)
blocks.push(`- Repositório versionado (documentação assume fluxo padrão de PR + CI).`)
blocks.push(`- Não há pipelines CI/CD adicionais configurados no estado atual do código.`)
blocks.push(``)
blocks.push(`### Vercel`)
blocks.push(`- Projeto compatível com deploy na Vercel (Next.js).`)
blocks.push(`- Variáveis de ambiente necessárias: \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`.`)
blocks.push(``)

blocks.push(`## Arquitetura Financeira`)
blocks.push(`\`\`\`text`)
blocks.push(`Connekt`)
blocks.push(`↓`)
blocks.push(`AcquirerProvider`)
blocks.push(`↓`)
blocks.push(`MygProvider`)
blocks.push(`↓`)
blocks.push(`MyGateway`)
blocks.push(`↓`)
blocks.push(`Pagar.me`)
blocks.push(`\`\`\``)
blocks.push(``)
blocks.push(`Descrição:`)
blocks.push(`- Connekt controla o produto e as regras.`)
blocks.push(`- AcquirerProvider permite troca de provedores.`)
blocks.push(`- MygProvider é a implementação atual.`)
blocks.push(`- MyGateway executa a operação financeira.`)
blocks.push(`- Pagar.me é a infraestrutura financeira final.`)
blocks.push(``)
blocks.push(`Observação: "Nenhuma tela ou regra de negócio deve acessar a MyGateway diretamente."`)
blocks.push(``)

blocks.push(`## Estrutura de Pastas`)
blocks.push(`| Caminho | Papel |`)
blocks.push(`|---|---|`)
blocks.push(`| \`app/\` | Rotas e layouts do Next.js (App Router) |`)
blocks.push(`| \`components/\` | UI reutilizável, layout e telas (screens) |`)
blocks.push(`| \`lib/\` | Tokens e integrações (ex.: Supabase) |`)
blocks.push(`| \`hooks/\` | Hooks React (ex.: sessão) |`)
blocks.push(`| \`services/\` | Serviços de domínio (auth, pagamentos, KYC, webhooks etc.) |`)
blocks.push(`| \`types/\` | Tipos TypeScript de domínio |`)
blocks.push(`| \`utils/\` | Utilidades (ex.: formatação BRL) |`)
blocks.push(`| \`docs/\` | Documentação do produto (este PRD) e imagens das telas |`)
blocks.push(``)

blocks.push(`## Componentes Reutilizáveis`)
blocks.push(`Componentes presentes e reutilizados nas telas:`)
blocks.push(`- Layout: Sidebar, Header, AppShell.`)
blocks.push(`- UI: TableCard/Th/Td, Badge (status), Buttons (Primary/Ghost/Danger), Toggle, KpiCard, Avi (avatar por iniciais), WordMark/Logo.`)
blocks.push(``)

blocks.push(`## Fluxo de Navegação`)
blocks.push(`- Entrada pública: \`/login\` e \`/register\`.`)
blocks.push(`- Autenticação: login/cadastro via Supabase Auth, com criação/associação a uma organização e carregamento de permissões do usuário.`)
blocks.push(`- Navegação principal: Sidebar com grupos Comercial, Financeiro, Administração e Configurações.`)
blocks.push(`- Fluxos internos notáveis:`)
blocks.push(`  - Dashboard → Transações (botão “Ver todas”).`)
blocks.push(`  - Links de Pagamento → Novo Link → Checkout (botão “Gerar Link de Pagamento”).`)
blocks.push(`  - Painel Administrativo → Aprovação KYC (botão “Ver todos” / “Revisar”).`)
blocks.push(``)

blocks.push(`## Papéis e Permissões`)
blocks.push(`### Owner`)
blocks.push(`Acesso total ao sistema.`)
blocks.push(``)
blocks.push(`### Admin`)
blocks.push(`Gestão operacional completa.`)
blocks.push(``)
blocks.push(`### Financeiro`)
blocks.push(`Acesso aos módulos financeiros.`)
blocks.push(``)
blocks.push(`### Operacional`)
blocks.push(`Operações do dia a dia.`)
blocks.push(``)
blocks.push(`### Viewer`)
blocks.push(`Somente leitura.`)
blocks.push(``)
blocks.push(`Observação: "As permissões são controladas por organização utilizando Supabase Auth e RLS."`)
blocks.push(``)

const modules = [
  {
    key: 'login',
    title: 'Login',
    route: '/login',
    objective: 'Autenticar usuários na plataforma, garantindo acesso seguro por organização.',
    features: [
      'Login por e-mail e senha com validação, mensagens de erro e controle de tentativas.',
      'Recuperação de senha (“Esqueci minha senha”) com envio de link por e-mail.',
      'Redirecionamento para o dashboard após autenticação bem-sucedida.',
    ],
    components: ['WordMark', 'Inputs (inline)', 'Botões (inline)'],
    rules: [
      'A sessão é persistida e utilizada para identificar usuário e organização ativa.',
      'Acesso às rotas do aplicativo exige sessão válida; rotas públicas permanecem acessíveis sem sessão.',
    ],
  },
  {
    key: 'cadastro',
    title: 'Cadastro',
    route: '/register',
    objective: 'Cadastrar uma nova conta e criar/associar uma organização (tenant) no Connekt Pay.',
    features: [
      'Cadastro com dados do usuário e identificação (CPF/CNPJ).',
      'Criação da organização e do perfil do usuário com papel inicial de administrador.',
      'Verificação de e-mail e aceite de termos de uso (quando aplicável).',
    ],
    components: ['WordMark', 'Inputs (inline)', 'Botões (inline)'],
    rules: [
      'E-mail deve ser único e validado; senha deve atender requisitos mínimos de segurança.',
      'O cadastro inicia o processo de KYC/Onboarding da organização e/ou do recebedor principal.',
    ],
  },
  {
    key: 'checkout',
    title: 'Checkout',
    route: '/checkout',
    objective: 'Permitir que o pagador finalize um pagamento com métodos PIX ou cartão, com confirmação em tempo real.',
    features: [
      'Exibição do produto/serviço, valor total e condições de parcelamento (quando aplicável).',
      'PIX: geração de QR Code e código “copia e cola”, com expiração e atualização de status.',
      'Cartão: captura segura dos dados do cartão e seleção de parcelamento.',
      'Confirmação de pagamento e retorno para o fluxo pós-compra (ex.: página de sucesso).',
    ],
    components: ['WordMark', 'Tabs (inline)', 'Inputs (inline)', 'Botões (inline)'],
    rules: [
      'O método disponível (PIX/cartão) segue as configurações do link de pagamento.',
      'O status do pagamento é sincronizado por eventos do provedor e registrado em transactions e ledger_entries.',
    ],
  },
  {
    key: 'dashboard',
    title: 'Dashboard',
    route: '/dashboard',
    objective: 'Fornecer visão executiva do desempenho financeiro e operacional da organização.',
    features: [
      'KPIs com recortes temporais (hoje/semana/mês/personalizado) e comparação com período anterior.',
      'Gráfico de volume e metas com seleção de período.',
      'Atividade recente com últimas transações e eventos relevantes.',
      'Atalhos para navegação e exploração de transações.',
    ],
    components: ['KpiCard', 'TableCard/Th/Td', 'Badge', 'Avi', 'Recharts AreaChart'],
    rules: [
      'KPIs e gráficos são calculados a partir de transactions, ledger_entries, payouts e subscriptions.',
      'A visualização respeita permissões do usuário e escopo da organização (RLS).',
    ],
  },
  {
    key: 'transacoes',
    title: 'Transações',
    route: '/transacoes',
    objective: 'Consultar e administrar transações com busca, filtros e exportação.',
    features: [
      'Busca por cliente, identificadores e referência do pagamento.',
      'Filtros por status e método de pagamento.',
      'Tabela com valores, método, status e data/hora.',
      'Exportação de resultados (ex.: CSV) com os filtros aplicados.',
    ],
    components: ['TableCard/Th/Td', 'Badge', 'Avi'],
    rules: [
      'Status seguem o ciclo de vida do pagamento (ex.: pendente → pago/recusado/estornado).',
      'Exportação deve respeitar permissões e escopo da organização.',
    ],
  },
  {
    key: 'links-pagamento',
    title: 'Links de Pagamento',
    route: '/links-pagamento',
    objective: 'Gerenciar links de pagamento para cobrança avulsa e recorrente.',
    features: [
      'Listagem de links com métricas (cobranças, receita acumulada, status).',
      'Criação de novo link e compartilhamento do URL.',
      'Ações por link: copiar URL, visualizar checkout e gerenciar status (ativo/inativo).',
    ],
    components: ['PrimaryBtn', 'TableCard/Th/Td', 'Badge'],
    rules: [
      'Links podem ser do tipo único (pagamento avulso) ou recorrente (assinatura).',
      'O checkout consome as configurações do link (valor, imagem, métodos e parcelamento).',
    ],
  },
  {
    key: 'novo-link-pagamento',
    title: 'Novo Link de Pagamento',
    route: '/links-pagamento/novo',
    objective: 'Configurar e publicar um link de pagamento com regras de cobrança e métodos.',
    features: [
      'Cadastro do produto/serviço (nome, descrição, preço e imagem).',
      'Definição do tipo de cobrança (avulsa ou recorrente) e condições (parcelamento, periodicidade).',
      'Seleção de métodos habilitados (PIX e cartão) e regras de parcelamento.',
      'Publicação do link e redirecionamento para visualização no checkout.',
    ],
    components: ['Toggle', 'PrimaryBtn (inline via botão)', 'Inputs/textarea/select (inline)'],
    rules: [
      'Parcelamento máximo define limites exibidos e aceitos no checkout.',
      'A publicação cria um registro em payment_links e emite eventos para rastreabilidade.',
    ],
  },
  {
    key: 'assinaturas',
    title: 'Assinaturas',
    route: '/assinaturas',
    objective: 'Operar recorrência: planos, assinaturas, churn e ciclo de cobrança.',
    features: [
      'KPIs de recorrência (MRR, assinaturas ativas, churn, próxima cobrança).',
      'Criação e gestão de planos (nome, preço, periodicidade e status).',
      'Listagem de assinaturas com status, plano, valor e próxima cobrança.',
      'Ações operacionais: cancelar, pausar e reativar assinaturas conforme políticas.',
    ],
    components: ['PrimaryBtn', 'TableCard/Th/Td', 'Badge', 'Avi'],
    rules: [
      'Cálculos de MRR e churn derivam de subscriptions e payments relacionados.',
      'Falhas de cobrança geram eventos e atualizam status (ex.: ativo → inadimplente → cancelado).',
    ],
  },
  {
    key: 'recebedores',
    title: 'Recebedores',
    route: '/recebedores',
    objective: 'Gerenciar recebedores (destinos de split e repasses) e seus dados bancários/KYC.',
    features: [
      'Cadastro e edição de recebedores com documento e conta bancária.',
      'Visualização de saldo, volume processado e status de KYC por recebedor.',
      'Vinculação de recebedores às regras de split e aos repasses.',
    ],
    components: ['PrimaryBtn', 'Cards (inline)', 'fmtBRL', 'initials'],
    rules: [
      'Recebedores só podem receber split/repasses quando KYC estiver aprovado.',
      'Dados bancários devem ser validados antes de transferências bancárias.',
    ],
  },
  {
    key: 'ledger',
    title: 'Ledger',
    route: '/ledger',
    objective: 'Manter um livro razão interno (ledger) para auditoria e conciliação financeira.',
    features: [
      'KPIs de saldo e movimentações (créditos/débitos) por período.',
      'Extrato com lançamentos detalhados: tipo, origem, crédito/débito e saldo após.',
      'Exportação do extrato em formato compatível (ex.: OFX).',
    ],
    components: ['TableCard/Th/Td', 'fmtBRL'],
    rules: [
      'Todo evento financeiro relevante gera um ou mais lançamentos em ledger_entries.',
      'O saldo é a soma acumulada das entradas e saídas do ledger.',
      'O pay_ledger é a fonte de verdade financeira interna da Connekt.',
    ],
  },
  {
    key: 'antecipacao',
    title: 'Antecipação',
    route: '/antecipacao',
    objective: 'Solicitar antecipação de recebíveis com simulação de taxa e acompanhamento do status.',
    features: [
      'Visão de saldo disponível e valor antecipável, com taxa aplicável.',
      'Simulação do valor líquido antes da confirmação.',
      'Solicitação de antecipação e acompanhamento do histórico.',
    ],
    components: ['KpiCard', 'PrimaryBtn', 'TableCard/Th/Td', 'Badge'],
    rules: [
      'A elegibilidade considera recebíveis futuros, risco do recebedor e regras do provedor.',
      'A confirmação cria anticipation_requests e reflete no ledger quando efetivada.',
    ],
  },
  {
    key: 'repasses',
    title: 'Repasses',
    route: '/repasses',
    objective: 'Gerenciar repasses (payouts) para recebedores, com agenda, status e auditoria.',
    features: [
      'KPIs de volume repassado, agendados, taxa média e pendências.',
      'Agenda de próximos repasses e histórico completo.',
      'Filtros por status (ex.: agendado, processando, liquidado, falhou).',
      'Exportação de relatórios e conciliação de repasses.',
    ],
    components: ['TableCard/Th/Td', 'Badge', 'fmtBRL'],
    rules: [
      'Repasses são disparados conforme regras (automático/manual) e disponibilidade de saldo.',
      'Falhas geram alertas e permitem reprocessamento controlado.',
    ],
  },
  {
    key: 'admin-painel',
    title: 'Painel Administrativo',
    route: '/admin/painel',
    objective: 'Fornecer visão global (admin) de operação, risco e performance da plataforma.',
    features: [
      'KPIs globais (TPV, usuários, recebedores, volume liquidado).',
      'Fila resumida de KYC pendentes e atalhos para revisão.',
      'Alertas do sistema (riscos, anomalias e falhas operacionais).',
      'Visão global das últimas transações e status.',
    ],
    components: ['KpiCard', 'TableCard/Th/Td', 'Badge'],
    rules: [
      'Acesso restrito a perfis administrativos.',
      'Alertas e métricas derivam de eventos operacionais (webhooks, conciliação, falhas de payout e fraude).',
    ],
  },
  {
    key: 'admin-kyc',
    title: 'Aprovação KYC',
    route: '/admin/aprovacao-kyc',
    objective: 'Revisar e decidir solicitações de KYC com trilha de auditoria.',
    features: [
      'Fila com empresa, documento, data de envio, risco, status e ações.',
      'Visualização de documentos e evidências.',
      'Ações de aprovação/rejeição com registro de justificativa e notificação.',
    ],
    components: ['TableCard/Th/Td', 'Badge', 'DangerBtn', 'GhostBtn'],
    rules: [
      'A decisão de KYC altera elegibilidade para processamento, split e repasses.',
      'Toda decisão gera audit_logs e webhook_events internos para rastreabilidade.',
    ],
  },
  {
    key: 'admin-eventos',
    title: 'Eventos',
    route: '/admin/eventos',
    objective: 'Monitorar eventos e webhooks da plataforma e do provedor, com reprocessamento.',
    features: [
      'KPIs de volume de eventos, entregas e falhas.',
      'Filtro por tipo de evento (pagamento, assinatura, split, payout).',
      'Tabela com data, tipo, origem, status, tentativas e ação de reprocessar.',
    ],
    components: ['TableCard/Th/Td', 'Badge'],
    rules: [
      'Reprocessamento é permitido para eventos falhos, respeitando limites de tentativa e backoff.',
      'Cada tentativa é registrada e auditável.',
    ],
  },
  {
    key: 'admin-conciliacao',
    title: 'Conciliação',
    route: '/admin/conciliacao',
    objective: 'Conciliar valores internos vs provedor e tratar divergências com rastreabilidade.',
    features: [
      'KPIs de transações conciliadas, divergências e valores conciliados/pendentes.',
      'Tabela comparativa por transação (interno vs provedor) com status.',
      'Exportação de relatório e evidências de conciliação.',
    ],
    components: ['TableCard/Th/Td', 'Badge', 'fmtBRL'],
    rules: [
      'Conciliação gera reconciliation_batches e relaciona entradas do ledger e eventos do provedor.',
      'Divergências exigem revisão e ficam registradas até resolução.',
    ],
  },
  {
    key: 'admin-auditoria',
    title: 'Auditoria',
    route: '/admin/auditoria',
    objective: 'Disponibilizar trilha de auditoria completa e imutável para ações críticas.',
    features: [
      'Pesquisa por usuário, entidade, ação e período.',
      'Tabela com usuário, ação, entidade, data e diffs antes/depois.',
      'Exportação para auditorias externas e compliance.',
    ],
    components: ['TableCard/Th/Td', 'Search input (inline)'],
    rules: [
      'Logs são imutáveis: sem edição ou remoção por interface.',
      'Acesso restrito por permissão, com visibilidade por organização e/ou escopo admin.',
    ],
  },
  {
    key: 'configuracoes',
    title: 'Configurações',
    route: '/configuracoes',
    objective: 'Gerenciar perfil, dados da empresa, segurança e notificações.',
    features: [
      'Perfil do usuário: atualização de dados e preferências.',
      'Dados da empresa: razão social, CNPJ, segmento e site.',
      'Segurança: 2FA, gestão de sessões e troca de senha.',
      'Notificações: e-mail, SMS e webhook.',
    ],
    components: ['PrimaryBtn', 'GhostBtn', 'Toggle'],
    rules: [
      'Ações sensíveis exigem confirmação, permissões e registro em audit_logs.',
    ],
  },
  {
    key: 'configuracoes-integracoes',
    title: 'Integrações',
    route: '/configuracoes/integracoes',
    objective: 'Gerenciar chaves, tokens, webhooks e ambientes de integração por organização.',
    features: [
      'Ambientes: seleção entre sandbox e produção, com endpoints e webhook URL correspondentes.',
      'Chaves de API: criação, rotação, revogação, visualização segura e auditoria.',
      'Webhooks: configuração de URL, versionamento de schema e política de retentativas.',
      'Tokens: geração e rotação de tokens de integração, com exibição segura e cópia controlada.',
    ],
    components: ['PrimaryBtn', 'Toggle', 'Cards (inline)'],
    rules: [
      'Toda alteração de chaves/tokens/webhooks é registrada em audit_logs.',
      'As configurações são isoladas por organization_id e ambiente.',
    ],
  },
  {
    key: 'admin-provedor-financeiro',
    title: 'Provedor Financeiro',
    route: '/admin/provedor-financeiro',
    objective: 'Configurar e monitorar a integração com o provedor financeiro (ambiente, endpoints e saúde).',
    features: [
      'Seleção de ambiente (sandbox/produção) e status da conexão.',
      'Saúde dos serviços (pagamentos, PIX, split, recorrência, antecipação, webhooks, KYC e repasses).',
      'Configurações: endpoints, webhook URL, timeouts, retries e credenciais.',
      'Ações de validação de conexão e atualização de configurações com auditoria.',
    ],
    components: ['StatusDot', 'GhostBtn', 'Cards (inline)'],
    rules: [
      'Permissão de acesso restrita aos papéis Owner e Super Admin.',
      'Nenhuma tela ou regra de negócio acessa a MyGateway diretamente; a integração ocorre via AcquirerProvider.',
    ],
  },
]

blocks.push(`## Módulos`)
blocks.push(`Os módulos abaixo descrevem o comportamento final esperado do produto, mantendo as telas já existentes. Cada módulo inclui objetivo, funcionalidades, componentes, regras do produto e a imagem real da tela.`)
blocks.push(``)

for (const m of modules) {
  blocks.push(`### ${m.title}`)
  blocks.push(`- Rota: \`${m.route}\``)
  blocks.push(`- Objetivo: ${m.objective}`)
  blocks.push(``)
  blocks.push(`**Funcionalidades**`)
  for (const f of m.features) blocks.push(`- ${f}`)
  blocks.push(``)
  blocks.push(`**Componentes presentes**`)
  for (const c of m.components) blocks.push(`- ${c}`)
  blocks.push(``)
  blocks.push(`**Regras do produto**`)
  for (const r of m.rules) blocks.push(`- ${r}`)
  blocks.push(``)
  const shot = screenshotForKey(m.key)
  if (shot) {
    blocks.push(`**Tela**`)
    blocks.push(`![Tela — ${m.title}](${shot})`)
    blocks.push(``)
  } else {
    blocks.push(`**Tela**`)
    blocks.push(`(Gerar imagens das telas em \`/docs/screenshots\` para inserir aqui.)`)
    blocks.push(``)
  }
}

blocks.push(`## Banco de Dados Planejado`)
blocks.push(`Modelo de dados para suportar integralmente os módulos do Connekt Pay (multi-tenant por organização) no PostgreSQL (Supabase).`)
blocks.push(``)
blocks.push(`### Princípios`)
blocks.push(`- Multi-tenant por \`organization_id\` em tabelas de domínio.`)
blocks.push(`- RLS (Row Level Security) para garantir isolamento de dados por organização e permissões do usuário.`)
blocks.push(`- Imutabilidade/auditabilidade: eventos e logs não são reescritos; alterações sensíveis geram trilhas de auditoria.`)
blocks.push(``)
blocks.push(`### Tabelas (escopo)`)
blocks.push(`- organizations`)
blocks.push(`- profiles`)
blocks.push(`- customers`)
blocks.push(`- payment_links`)
blocks.push(`- transactions`)
blocks.push(`- subscriptions`)
blocks.push(`- receivers`)
blocks.push(`- split_rules`)
blocks.push(`- ledger_entries`)
blocks.push(`- anticipation_requests`)
blocks.push(`- payouts`)
blocks.push(`- webhook_events`)
blocks.push(`- kyc_requests`)
blocks.push(`- audit_logs`)
blocks.push(`- provider_settings`)
blocks.push(``)

const dbTables = [
  {
    name: 'organizations',
    purpose: 'Organizações/empresas (tenant) que operam a plataforma.',
    columns: [
      ['id', 'uuid', 'PK. Identificador da organização.'],
      ['name', 'text', 'Nome/razão social (ou nome operacional).'],
      ['document', 'text', 'CNPJ/CPF quando aplicável.'],
      ['status', 'text', 'Status operacional (ex.: active, suspended).'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'profiles',
    purpose: 'Perfis de usuários vinculados ao Supabase Auth, com permissões por organização.',
    columns: [
      ['id', 'uuid', 'PK (pode ser o mesmo do auth.users).'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['email', 'text', 'E-mail do usuário.'],
      ['full_name', 'text', 'Nome completo.'],
      ['role', 'text', 'Papel (ex.: admin, operator, viewer).'],
      ['phone', 'text', 'Telefone.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'customers',
    purpose: 'Clientes finais (pagadores/assinantes) associados à organização.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['name', 'text', 'Nome do cliente.'],
      ['email', 'text', 'E-mail do cliente.'],
      ['document', 'text', 'CPF/CNPJ.'],
      ['phone', 'text', 'Telefone.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'receivers',
    purpose: 'Recebedores (destinos de split e repasses) com dados bancários e status KYC.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['name', 'text', 'Nome/razão social.'],
      ['document', 'text', 'CPF/CNPJ.'],
      ['bank_account', 'jsonb', 'Dados bancários normalizados (banco/agência/conta/tipo).'],
      ['kyc_status', 'text', 'Status KYC (ex.: pending, in_review, approved, rejected).'],
      ['status', 'text', 'Status do recebedor (ex.: active, disabled).'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'payment_links',
    purpose: 'Links de pagamento (avulso/recorrente) com produto, preço e configurações.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['name', 'text', 'Nome do produto.'],
      ['description', 'text', 'Descrição do produto.'],
      ['amount', 'bigint', 'Valor em centavos.'],
      ['type', 'text', 'one_time | recurring.'],
      ['methods', 'jsonb', 'Métodos habilitados (pix/card) e regras.'],
      ['max_installments', 'int', 'Parcelamento máximo.'],
      ['status', 'text', 'active | inactive.'],
      ['slug', 'text', 'Identificador público do link.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'transactions',
    purpose: 'Transações de pagamento com status, método, valores e referências do provedor.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['customer_id', 'uuid', 'FK → customers.id (quando aplicável).'],
      ['payment_link_id', 'uuid', 'FK → payment_links.id (quando originada por link).'],
      ['amount', 'bigint', 'Valor bruto em centavos.'],
      ['currency', 'text', 'Moeda (BRL).'],
      ['method', 'text', 'pix | card (e extensões futuras).'],
      ['status', 'text', 'pending | paid | refused | refunded | chargeback.'],
      ['provider_reference', 'text', 'Identificador do provedor.'],
      ['provider_payload', 'jsonb', 'Dados relevantes do provedor (normalizados).'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'subscriptions',
    purpose: 'Assinaturas e seu ciclo: status, próxima cobrança, plano e valores.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['customer_id', 'uuid', 'FK → customers.id'],
      ['payment_link_id', 'uuid', 'FK → payment_links.id (quando link recorrente).'],
      ['amount', 'bigint', 'Valor recorrente em centavos.'],
      ['interval', 'text', 'monthly | yearly (ou equivalente).'],
      ['status', 'text', 'active | past_due | canceled | paused.'],
      ['next_billing_at', 'timestamptz', 'Próxima cobrança.'],
      ['provider_reference', 'text', 'Identificador do provedor.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'split_rules',
    purpose: 'Regras de split por organização/link/transação, distribuindo valores para recebedores.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['receiver_id', 'uuid', 'FK → receivers.id'],
      ['payment_link_id', 'uuid', 'FK → payment_links.id (opcional).'],
      ['type', 'text', 'percentage | fixed.'],
      ['value', 'numeric', 'Percentual (0–100) ou valor fixo em centavos.'],
      ['priority', 'int', 'Ordem de aplicação.'],
      ['status', 'text', 'active | inactive.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'anticipation_requests',
    purpose: 'Solicitações de antecipação com simulação, taxa e status.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['receiver_id', 'uuid', 'FK → receivers.id (quando aplicável).'],
      ['requested_amount', 'bigint', 'Valor solicitado em centavos.'],
      ['fee_rate', 'numeric', 'Taxa aplicada (ex.: ao mês).'],
      ['fee_amount', 'bigint', 'Valor da taxa em centavos.'],
      ['net_amount', 'bigint', 'Valor líquido em centavos.'],
      ['status', 'text', 'requested | approved | rejected | paid_out.'],
      ['provider_reference', 'text', 'Identificador do provedor.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'payouts',
    purpose: 'Repasses/transferências bancárias (payouts) com status e valores.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['receiver_id', 'uuid', 'FK → receivers.id'],
      ['gross_amount', 'bigint', 'Valor bruto em centavos.'],
      ['fee_amount', 'bigint', 'Taxas em centavos.'],
      ['net_amount', 'bigint', 'Valor líquido em centavos.'],
      ['status', 'text', 'scheduled | processing | settled | failed.'],
      ['scheduled_for', 'timestamptz', 'Data/hora programada.'],
      ['provider_reference', 'text', 'Identificador do provedor.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'ledger_entries',
    purpose: 'Lançamentos do ledger interno, com saldo acumulado e origem do evento.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['transaction_id', 'uuid', 'FK → transactions.id (opcional).'],
      ['payout_id', 'uuid', 'FK → payouts.id (opcional).'],
      ['anticipation_request_id', 'uuid', 'FK → anticipation_requests.id (opcional).'],
      ['type', 'text', 'Tipo do lançamento (sale, fee, split, payout, reversal etc.).'],
      ['direction', 'text', 'credit | debit.'],
      ['amount', 'bigint', 'Valor em centavos.'],
      ['balance_after', 'bigint', 'Saldo após o lançamento, em centavos.'],
      ['origin', 'text', 'Origem (ex.: API, webhook, admin).'],
      ['occurred_at', 'timestamptz', 'Data/hora do evento.'],
      ['created_at', 'timestamptz', 'Criação.'],
    ],
  },
  {
    name: 'reconciliation_batches',
    purpose: 'Lotes de conciliação com resultados e evidências.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['period_start', 'date', 'Início do período.'],
      ['period_end', 'date', 'Fim do período.'],
      ['status', 'text', 'open | reviewed | closed.'],
      ['summary', 'jsonb', 'Resumo (conciliadas, divergências, valores).'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'webhook_events',
    purpose: 'Eventos recebidos/enviados e tentativas (para reprocessamento e observabilidade).',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['type', 'text', 'Tipo do evento (ex.: payment.approved).'],
      ['origin', 'text', 'Origem (provider/internal).'],
      ['status', 'text', 'delivered | failed | pending.'],
      ['attempts', 'int', 'Número de tentativas.'],
      ['payload', 'jsonb', 'Payload do evento.'],
      ['last_error', 'text', 'Último erro (se houver).'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'kyc_requests',
    purpose: 'Solicitações de KYC com status, risco, evidências e decisões.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['receiver_id', 'uuid', 'FK → receivers.id (opcional).'],
      ['status', 'text', 'pending | in_review | approved | rejected.'],
      ['risk', 'text', 'low | medium | high.'],
      ['submitted_at', 'timestamptz', 'Data/hora de submissão.'],
      ['reviewed_at', 'timestamptz', 'Data/hora de decisão.'],
      ['decision_reason', 'text', 'Justificativa da decisão.'],
      ['evidence', 'jsonb', 'Metadados/links para evidências.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
  {
    name: 'audit_logs',
    purpose: 'Logs de auditoria imutáveis para ações críticas, com diffs antes/depois.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['actor_profile_id', 'uuid', 'FK → profiles.id'],
      ['action', 'text', 'CREATE | UPDATE | DELETE | AUTO_CHARGE etc.'],
      ['entity', 'text', 'Entidade afetada (ex.: receiver, payout).'],
      ['entity_id', 'uuid', 'ID do registro afetado (quando aplicável).'],
      ['before', 'jsonb', 'Estado anterior (quando aplicável).'],
      ['after', 'jsonb', 'Estado posterior (quando aplicável).'],
      ['created_at', 'timestamptz', 'Criação.'],
    ],
  },
  {
    name: 'provider_settings',
    purpose: 'Configurações de integração com provedor financeiro por organização/ambiente.',
    columns: [
      ['id', 'uuid', 'PK.'],
      ['organization_id', 'uuid', 'FK → organizations.id'],
      ['environment', 'text', 'sandbox | production.'],
      ['base_url', 'text', 'Endpoint base do provedor.'],
      ['webhook_url', 'text', 'URL de webhook configurada.'],
      ['timeout_seconds', 'int', 'Timeout de requisição.'],
      ['retry_policy', 'jsonb', 'Política de retentativas.'],
      ['status', 'text', 'connected | degraded | offline.'],
      ['last_sync_at', 'timestamptz', 'Última sincronização.'],
      ['created_at', 'timestamptz', 'Criação.'],
      ['updated_at', 'timestamptz', 'Atualização.'],
    ],
  },
]

const dbTableMeta = {
  organizations: {
    mainFields: ['id', 'name', 'document', 'status'],
    relationships: ['1:N com profiles (profiles.organization_id).', '1:N com customers, receivers, payment_links, transactions, subscriptions, split_rules, payouts, ledger_entries, webhook_events, kyc_requests, audit_logs, provider_settings.'],
  },
  profiles: {
    mainFields: ['id', 'organization_id', 'email', 'full_name', 'role'],
    relationships: ['N:1 com organizations.', '1:N com audit_logs (audit_logs.actor_profile_id).'],
  },
  customers: {
    mainFields: ['id', 'organization_id', 'name', 'email', 'document'],
    relationships: ['N:1 com organizations.', '1:N com transactions (transactions.customer_id).', '1:N com subscriptions (subscriptions.customer_id).'],
  },
  payment_links: {
    mainFields: ['id', 'organization_id', 'name', 'amount', 'type', 'methods', 'status', 'slug'],
    relationships: ['N:1 com organizations.', '1:N com transactions (transactions.payment_link_id).', '1:N com subscriptions (subscriptions.payment_link_id).', '1:N com split_rules (split_rules.payment_link_id).'],
  },
  transactions: {
    mainFields: ['id', 'organization_id', 'amount', 'method', 'status', 'provider_reference', 'created_at'],
    relationships: ['N:1 com organizations.', 'N:1 com customers (opcional).', 'N:1 com payment_links (opcional).', '1:N com ledger_entries (ledger_entries.transaction_id).'],
  },
  subscriptions: {
    mainFields: ['id', 'organization_id', 'customer_id', 'amount', 'interval', 'status', 'next_billing_at'],
    relationships: ['N:1 com organizations.', 'N:1 com customers.', 'N:1 com payment_links (opcional).', 'Pode gerar transactions e webhook_events ao longo do ciclo de cobrança.'],
  },
  receivers: {
    mainFields: ['id', 'organization_id', 'name', 'document', 'bank_account', 'kyc_status', 'status'],
    relationships: ['N:1 com organizations.', '1:N com split_rules (split_rules.receiver_id).', '1:N com payouts (payouts.receiver_id).', '1:N com anticipation_requests (anticipation_requests.receiver_id).', 'Pode se relacionar a kyc_requests (kyc_requests.receiver_id).'],
  },
  split_rules: {
    mainFields: ['id', 'organization_id', 'receiver_id', 'payment_link_id', 'type', 'value', 'priority', 'status'],
    relationships: ['N:1 com organizations.', 'N:1 com receivers.', 'N:1 com payment_links (opcional).', 'Aplicadas no split lógico do produto e reconciliadas com split financeiro do provedor.'],
  },
  ledger_entries: {
    mainFields: ['id', 'organization_id', 'type', 'direction', 'amount', 'balance_after', 'occurred_at', 'origin'],
    relationships: ['N:1 com organizations.', 'N:1 com transactions (opcional).', 'N:1 com payouts (opcional).', 'N:1 com anticipation_requests (opcional).', 'Fonte de verdade do pay_ledger (consolidação/visões).'],
  },
  anticipation_requests: {
    mainFields: ['id', 'organization_id', 'requested_amount', 'fee_rate', 'fee_amount', 'net_amount', 'status', 'provider_reference'],
    relationships: ['N:1 com organizations.', 'N:1 com receivers (opcional).', '1:N com ledger_entries (ledger_entries.anticipation_request_id).'],
  },
  payouts: {
    mainFields: ['id', 'organization_id', 'receiver_id', 'gross_amount', 'fee_amount', 'net_amount', 'status', 'scheduled_for'],
    relationships: ['N:1 com organizations.', 'N:1 com receivers.', '1:N com ledger_entries (ledger_entries.payout_id).'],
  },
  webhook_events: {
    mainFields: ['id', 'organization_id', 'type', 'origin', 'status', 'attempts', 'created_at'],
    relationships: ['N:1 com organizations.', 'Pode referenciar entities internas por payload (transactions/subscriptions/payouts/etc.).', 'Tentativas e erros são auditáveis e suportam reprocessamento.'],
  },
  kyc_requests: {
    mainFields: ['id', 'organization_id', 'receiver_id', 'status', 'risk', 'submitted_at', 'reviewed_at'],
    relationships: ['N:1 com organizations.', 'N:1 com receivers (opcional).', 'Gera audit_logs e pode gerar webhook_events internos.'],
  },
  audit_logs: {
    mainFields: ['id', 'organization_id', 'actor_profile_id', 'action', 'entity', 'entity_id', 'created_at'],
    relationships: ['N:1 com organizations.', 'N:1 com profiles (ator).', 'Relaciona-se a qualquer entidade via entity/entity_id e diffs before/after.'],
  },
  provider_settings: {
    mainFields: ['id', 'organization_id', 'environment', 'base_url', 'webhook_url', 'timeout_seconds', 'status', 'last_sync_at'],
    relationships: ['N:1 com organizations.', 'Define parâmetros operacionais usados por AcquirerProvider/MygProvider (sem acoplamento direto com MyGateway na UI).'],
  },
  reconciliation_batches: {
    mainFields: ['id', 'organization_id', 'period_start', 'period_end', 'status'],
    relationships: ['N:1 com organizations.', 'Relaciona divergências a transactions/ledger_entries e evidências do provedor por referência.'],
  },
}

blocks.push(`### Tabelas`)
for (const t of dbTables) {
  blocks.push(`#### ${t.name}`)
  blocks.push(`**Objetivo:** ${t.purpose}`)
  const meta = dbTableMeta[t.name] ?? null
  if (meta?.mainFields?.length) {
    blocks.push(``)
    blocks.push(`**Campos principais:** ${meta.mainFields.map((f) => `\`${f}\``).join(', ')}`)
  }
  if (meta?.relationships?.length) {
    blocks.push(``)
    blocks.push(`**Relacionamentos**`)
    for (const r of meta.relationships) blocks.push(`- ${r}`)
  }
  blocks.push(``)
  blocks.push(`| Campo | Tipo | Descrição |`)
  blocks.push(`|---|---|---|`)
  for (const [c, ty, d] of t.columns) blocks.push(`| \`${c}\` | ${ty} | ${d} |`)
  blocks.push(``)
}

blocks.push(`## Responsabilidades do Connekt Pay`)
blocks.push(`Responsabilidades da plataforma Connekt Pay (produto):`)
blocks.push(`- Gestão dos clientes.`)
blocks.push(`- Gestão dos recebedores.`)
blocks.push(`- Regras de split.`)
blocks.push(`- Recorrência.`)
blocks.push(`- Links de pagamento.`)
blocks.push(`- Ledger interno.`)
blocks.push(`- Conciliação.`)
blocks.push(`- Webhooks.`)
blocks.push(`- KYC.`)
blocks.push(`- Auditoria.`)
blocks.push(`- Repasses.`)
blocks.push(`- Antecipações.`)
blocks.push(`- Dashboard.`)
blocks.push(`- Autenticação.`)
blocks.push(`- Permissões.`)
blocks.push(`- Configurações do provedor.`)
blocks.push(``)

blocks.push(`## Responsabilidades do Provedor Financeiro`)
blocks.push(`Responsabilidades do provedor financeiro (infraestrutura):`)
blocks.push(`- Processamento financeiro.`)
blocks.push(`- Captura.`)
blocks.push(`- Liquidação.`)
blocks.push(`- Transferências bancárias.`)
blocks.push(`- Split financeiro real.`)
blocks.push(`- Recorrência financeira real.`)
blocks.push(`- Antecipação financeira real.`)
blocks.push(``)

blocks.push(`## Responsabilidades da Connekt`)
blocks.push(`- Dashboard;`)
blocks.push(`- Usuários;`)
blocks.push(`- Empresas;`)
blocks.push(`- Recebedores;`)
blocks.push(`- KYC;`)
blocks.push(`- Produtos;`)
blocks.push(`- Checkout;`)
blocks.push(`- Links de pagamento;`)
blocks.push(`- Transações internas;`)
blocks.push(`- Split lógico;`)
blocks.push(`- Ledger;`)
blocks.push(`- Recorrência;`)
blocks.push(`- Antecipação;`)
blocks.push(`- Repasses;`)
blocks.push(`- Conciliação;`)
blocks.push(`- Relatórios;`)
blocks.push(`- Auditoria;`)
blocks.push(`- Notificações;`)
blocks.push(`- Multi-adquirente;`)
blocks.push(`- AcquirerProvider;`)
blocks.push(`- Regras de negócio.`)
blocks.push(``)

blocks.push(`## Responsabilidades da MyGateway`)
blocks.push(`- Pix;`)
blocks.push(`- Cartão;`)
blocks.push(`- Tokenização;`)
blocks.push(`- Split financeiro;`)
blocks.push(`- Recorrência financeira;`)
blocks.push(`- Pix Automático;`)
blocks.push(`- Liquidação;`)
blocks.push(`- Repasses bancários;`)
blocks.push(`- Antecipação financeira;`)
blocks.push(`- PCI;`)
blocks.push(`- Eventos financeiros.`)
blocks.push(``)
blocks.push(`Observação: "A MyGateway pode ser substituída futuramente sem alterar o produto."`)
blocks.push(``)

blocks.push(`## API Pública`)
blocks.push(`**Objetivo:**`)
blocks.push(`Permitir integrações externas com ERP, LMS, CRMs e sistemas parceiros.`)
blocks.push(``)
blocks.push(`**Autenticação:**`)
blocks.push(`- API Key;`)
blocks.push(`- Escopo por organização;`)
blocks.push(`- Rate limit.`)
blocks.push(``)
blocks.push(`**Endpoints previstos:**`)
blocks.push(`- POST /api/payments`)
blocks.push(`- GET /api/transactions`)
blocks.push(`- POST /api/payment-links`)
blocks.push(`- GET /api/payment-links`)
blocks.push(`- POST /api/subscriptions`)
blocks.push(`- GET /api/subscriptions`)
blocks.push(`- POST /api/receivers`)
blocks.push(`- GET /api/receivers`)
blocks.push(`- POST /api/payouts`)
blocks.push(`- GET /api/ledger`)
blocks.push(`- POST /api/webhooks`)
blocks.push(`- GET /api/customers`)
blocks.push(`- POST /api/customers`)
blocks.push(``)
blocks.push(`Observação: "Toda API respeita o isolamento por organization_id."`)
blocks.push(``)

blocks.push(`## Eventos Disponíveis`)
blocks.push(`- payment.created`)
blocks.push(`- payment.pending`)
blocks.push(`- payment.paid`)
blocks.push(`- payment.failed`)
blocks.push(`- payment.refunded`)
blocks.push(`- subscription.created`)
blocks.push(`- subscription.renewed`)
blocks.push(`- subscription.canceled`)
blocks.push(`- receiver.created`)
blocks.push(`- receiver.updated`)
blocks.push(`- payout.created`)
blocks.push(`- payout.completed`)
blocks.push(`- anticipation.requested`)
blocks.push(`- anticipation.completed`)
blocks.push(`- kyc.approved`)
blocks.push(`- kyc.rejected`)
blocks.push(`- split.executed`)
blocks.push(``)

blocks.push(`---`)
blocks.push(`Leonardo Noronha`)
blocks.push(``)

const markdown = blocks.join('\n')
await fs.writeFile(mdPath, markdown, 'utf8')

let htmlBody = marked.parse(markdown)

const embedLocalImagesAsDataUris = async (html) => {
  const imgTagRe = /<img\b[^>]*\ssrc="([^"]+)"[^>]*>/g
  const srcs = new Set()
  for (const m of html.matchAll(imgTagRe)) srcs.add(m[1])

  let out = html
  for (const src of srcs) {
    if (!src || src.startsWith('data:')) continue
    const normalized = src.replaceAll('\\', '/')
    const rel = normalized.startsWith('./') ? normalized.slice(2) : normalized.startsWith('/') ? normalized.slice(1) : normalized
    const abs = path.join(docsDir, rel)
    try {
      const buf = await fs.readFile(abs)
      const dataUri = `data:image/png;base64,${buf.toString('base64')}`
      out = out.replaceAll(`src="${src}"`, `src="${dataUri}"`)
    } catch {
      continue
    }
  }
  return out
}

htmlBody = await embedLocalImagesAsDataUris(htmlBody)
const baseHref = pathToFileURL(docsDir + path.sep).href

const css = `
  :root { --navy:#021B5B; --mint:#39F0AE; --bg:#F4F6FB; --text:#0A0F1E; --muted:#64748B; --border: rgba(2,27,91,.12); }
  html, body { background: #ffffff; color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
  body { margin: 0; padding: 48px 56px; }
  h1 { font-size: 34px; letter-spacing: -0.02em; margin: 0 0 6px; }
  h2 { font-size: 20px; margin: 32px 0 10px; padding-top: 8px; border-top: 1px solid var(--border); }
  h3 { font-size: 15.5px; margin: 22px 0 8px; }
  p { line-height: 1.65; color: var(--text); margin: 10px 0; }
  blockquote { margin: 16px 0; padding: 12px 14px; border-left: 4px solid var(--mint); background: #f7fffc; border-radius: 10px; }
  blockquote p { margin: 0; color: #0f2b22; }
  ul { margin: 8px 0 12px 20px; }
  li { margin: 6px 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: 0.92em; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 14px; font-size: 12.5px; }
  th, td { border: 1px solid var(--border); padding: 9px 10px; vertical-align: top; }
  th { background: #f8fafc; text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; color: #64748b; }
  img { max-width: 100%; border: 1px solid var(--border); border-radius: 14px; margin: 10px 0 16px; box-shadow: 0 8px 28px rgba(2,27,91,.09); }
  hr { border: none; border-top: 1px solid var(--border); margin: 26px 0; }
`

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="${baseHref}" />
    <title>PRD Connekt Pay</title>
    <style>${css}</style>
  </head>
  <body>
    ${htmlBody}
  </body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.pdf({
  path: pdfPath,
  format: 'A4',
  margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
  printBackground: true,
})
await page.close()
await browser.close()
