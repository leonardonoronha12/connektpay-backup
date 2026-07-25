'use client'

export type GuideStep = {
  id: string
  title: string
  description: string
  path: string
  ctaLabel: string
  myGateway?: boolean
}

export type PageGuide = {
  title: string
  summary: string
  whatYouCanDo: string
  nextStep: string
  howItWorks: string
  primaryAction?: { label: string; href: string }
  secondaryAction?: { label: string; href: string }
  note?: string
}

export const ONBOARDING_STEPS: GuideStep[] = [
  {
    id: 'company',
    title: 'Complete os dados da sua empresa',
    description: 'Preencha os dados principais da empresa para deixar sua conta pronta para uso.',
    path: '/configuracoes',
    ctaLabel: 'Abrir configurações',
  },
  {
    id: 'receiver',
    title: 'Cadastre um recebedor',
    description: 'Cadastre a pessoa ou empresa que vai receber os pagamentos da sua operação.',
    path: '/recebedores',
    ctaLabel: 'Abrir recebedores',
  },
  {
    id: 'kyc',
    title: 'Envie os documentos do recebedor',
    description: 'Confira os dados do cadastro e envie os documentos para análise.',
    path: '/recebedores',
    ctaLabel: 'Enviar documentos',
  },
  {
    id: 'payment-link',
    title: 'Crie sua primeira cobrança',
    description: 'Monte uma cobrança simples para compartilhar com um cliente.',
    path: '/links-pagamento/novo',
    ctaLabel: 'Criar link',
  },
  {
    id: 'checkout',
    title: 'Revise a experiência do cliente',
    description: 'Veja como a cobrança aparece antes de compartilhar o link.',
    path: '/links-pagamento',
    ctaLabel: 'Ver links criados',
  },
  {
    id: 'transactions',
    title: 'Acompanhe seus pagamentos',
    description: 'Veja os pagamentos, o andamento de cada um e o que aconteceu depois do envio.',
    path: '/transacoes',
    ctaLabel: 'Abrir transações',
  },
  {
    id: 'finance',
    title: 'Acompanhe saldo e movimentações',
    description: 'Entenda saldo, envios e previsões financeiras da sua operação.',
    path: '/ledger',
    ctaLabel: 'Abrir visão financeira',
  },
  {
    id: 'integrations',
    title: 'Prepare conexões quando esta etapa estiver liberada',
    description: 'Deixe as conexões preparadas para ativar fluxos reais quando essa etapa estiver disponível.',
    path: '/configuracoes/integracoes',
    ctaLabel: 'Abrir integrações',
    myGateway: true,
  },
]

export const TOUR_STOPS = [
  { path: '/dashboard', title: 'Dashboard', description: 'Este painel mostra a visão geral da sua operação e ajuda você a entender o que já aconteceu e o que precisa de atenção.' },
  { path: '/links-pagamento', title: 'Links de Pagamento', description: 'Aqui você cria links para cobrar seus clientes e acompanha o que já foi compartilhado.' },
  { path: '/recebedores', title: 'Recebedores', description: 'Aqui você cadastra quem receberá os valores e acompanha o avanço do KYC.' },
  { path: '/ledger', title: 'Ledger', description: 'Aqui ficam as movimentações financeiras que mostram entradas, saídas e saldo da operação.' },
  { path: '/antecipacao', title: 'Antecipação', description: 'Aqui você visualiza ou simula antecipações. O fluxo real será habilitado após integração com a MyGateway.' },
  { path: '/repasses', title: 'Repasses', description: 'Aqui você acompanha valores enviados aos recebedores e o andamento de cada repasse.' },
  { path: '/configuracoes', title: 'Configurações', description: 'Aqui ficam os dados da empresa, da conta e os ajustes básicos da operação.' },
  { path: '/configuracoes/integracoes', title: 'Integrações', description: 'Aqui você prepara credenciais e conexões. Parte dos fluxos reais depende da MyGateway.' },
]

export const PAGE_GUIDES: Record<string, PageGuide> = {
  '/dashboard': {
    title: 'Entenda sua operação em poucos minutos',
    summary: 'O dashboard reúne os principais números para você saber quanto entrou, o que está pendente e onde vale agir primeiro.',
    whatYouCanDo: 'Conferir resultados, filtrar por período e descobrir os próximos módulos que merecem atenção.',
    nextStep: 'Se esta é a sua primeira vez aqui, comece preenchendo os dados da empresa e depois cadastre um recebedor.',
    howItWorks: 'Os cards mostram o resumo da operação e as tabelas ajudam você a acompanhar as movimentações mais recentes.',
    primaryAction: { label: 'Completar dados da empresa', href: '/configuracoes' },
    secondaryAction: { label: 'Cadastrar recebedor', href: '/recebedores' },
  },
  '/transacoes': {
    title: 'Acompanhe os pagamentos recebidos',
    summary: 'Esta tela mostra os pagamentos que seus clientes fizeram e o status de cada cobrança.',
    whatYouCanDo: 'Filtrar, revisar detalhes e copiar IDs quando precisar compartilhar uma referência interna.',
    nextStep: 'Depois de criar um link de pagamento, volte aqui para acompanhar as cobranças realizadas.',
    howItWorks: 'Cada linha representa uma transação e indica valor, método de pagamento, status e data.',
    primaryAction: { label: 'Criar link de pagamento', href: '/links-pagamento/novo' },
  },
  '/links-pagamento': {
    title: 'Crie cobranças simples para compartilhar',
    summary: 'Links de Pagamento permitem cobrar seus clientes sem precisar montar uma integração complexa.',
    whatYouCanDo: 'Criar novos links, copiar URLs, revisar status e organizar a sua operação comercial.',
    nextStep: 'Depois de criar um link, copie a URL e teste o checkout antes de divulgar para clientes.',
    howItWorks: 'Cada link reúne produto, valor e meios de pagamento em uma página pronta para cobrança.',
    primaryAction: { label: 'Criar meu primeiro link', href: '/links-pagamento/novo' },
    secondaryAction: { label: 'Ver transações', href: '/transacoes' },
    note: 'Split real depende da MyGateway. Enquanto isso, a plataforma mostra o fluxo de configuração de forma guiada.',
  },
  '/links-pagamento/novo': {
    title: 'Monte sua primeira cobrança',
    summary: 'Você está configurando um link de pagamento para compartilhar com o cliente.',
    whatYouCanDo: 'Definir nome, descrição, valor e visualizar uma simulação de parcelamento.',
    nextStep: 'Depois de criar o link, copie a URL e faça um teste no checkout.',
    howItWorks: 'Os campos principais definem o produto e o checkout que o cliente verá ao abrir o link.',
    secondaryAction: { label: 'Voltar para links', href: '/links-pagamento' },
    note: 'Recorrência e fluxos reais de cobrança recorrente ficam disponíveis após integração com a MyGateway.',
  },
  '/assinaturas': {
    title: 'Gerencie cobranças recorrentes com clareza',
    summary: 'Esta área reúne assinaturas, planos e a saúde da sua base recorrente.',
    whatYouCanDo: 'Acompanhar status das assinaturas e entender o que está ativo, pausado ou precisa de ação.',
    nextStep: 'Se ainda não houver base recorrente, crie um plano primeiro e associe a um recebedor com KYC.',
    howItWorks: 'As assinaturas dependem dos planos criados e da configuração correta de quem recebe os valores.',
    primaryAction: { label: 'Ver planos', href: '/subscriptions/plans' },
    secondaryAction: { label: 'Abrir recebedores', href: '/recebedores' },
    note: 'Assinaturas reais serão habilitadas por completo após integração com a MyGateway.',
  },
  '/recebedores': {
    title: 'Cadastre quem vai receber os valores',
    summary: 'Recebedores são as pessoas ou empresas vinculadas ao recebimento da operação.',
    whatYouCanDo: 'Cadastrar dados básicos, preencher dados bancários e iniciar o envio de documentos de KYC.',
    nextStep: 'Depois de cadastrar o recebedor, abra o KYC e envie os documentos para análise.',
    howItWorks: 'Sem um recebedor bem configurado, a operação financeira fica incompleta e algumas ações permanecem indisponíveis.',
    primaryAction: { label: 'Adicionar recebedor', href: '/recebedores' },
    secondaryAction: { label: 'Abrir configurações', href: '/configuracoes' },
    note: 'A validação integrada com provider externo fica disponível após integração com a MyGateway.',
  },
  '/ledger': {
    title: 'Veja entradas, saídas e saldo da operação',
    summary: 'O ledger funciona como um extrato consolidado da sua operação financeira.',
    whatYouCanDo: 'Acompanhar saldo, consultar lançamentos e exportar dados para análise.',
    nextStep: 'Depois de receber pagamentos, acompanhe aqui como o dinheiro circulou dentro da operação.',
    howItWorks: 'Cada lançamento mostra se houve entrada ou saída de valor e qual foi a origem da movimentação.',
    secondaryAction: { label: 'Abrir repasses', href: '/repasses' },
  },
  '/antecipacao': {
    title: 'Entenda antecipações antes de solicitar',
    summary: 'Esta tela ajuda você a visualizar ou simular antecipações de recebíveis com linguagem simples.',
    whatYouCanDo: 'Conferir histórico, entender taxa aplicada e revisar valores líquidos estimados.',
    nextStep: 'Use a simulação para entender o impacto financeiro antes de seguir com uma solicitação.',
    howItWorks: 'A plataforma calcula uma estimativa e organiza o histórico para que você saiba o que foi simulado ou solicitado.',
    secondaryAction: { label: 'Abrir ledger', href: '/ledger' },
    note: 'Disponível após integração com a MyGateway.',
  },
  '/repasses': {
    title: 'Acompanhe o envio de valores aos recebedores',
    summary: 'Repasses mostram o que foi programado ou enviado para cada recebedor.',
    whatYouCanDo: 'Consultar status, filtrar histórico e entender o andamento da liquidação.',
    nextStep: 'Depois de acompanhar o ledger, use esta tela para ver o destino dos valores.',
    howItWorks: 'Cada repasse representa um envio de valor para um recebedor cadastrado na plataforma.',
    secondaryAction: { label: 'Abrir recebedores', href: '/recebedores' },
    note: 'Disponível após integração com a MyGateway.',
  },
  '/configuracoes': {
    title: 'Deixe sua conta pronta para operar',
    summary: 'Aqui você ajusta dados da conta e completa as informações da empresa.',
    whatYouCanDo: 'Atualizar perfil, revisar dados da empresa e definir informações básicas da operação.',
    nextStep: 'Depois de salvar os dados da empresa, siga para Recebedores para cadastrar quem receberá os valores.',
    howItWorks: 'Essas informações ajudam a organizar a conta e são a base para os próximos passos do onboarding.',
    primaryAction: { label: 'Abrir recebedores', href: '/recebedores' },
    secondaryAction: { label: 'Abrir integrações', href: '/configuracoes/integracoes' },
  },
  '/configuracoes/integracoes': {
    title: 'Prepare integrações com segurança',
    summary: 'Esta área organiza chaves, tokens e o ambiente usado pela sua operação.',
    whatYouCanDo: 'Gerar credenciais, copiar valores com segurança e revisar o ambiente configurado.',
    nextStep: 'Depois de completar o onboarding básico, volte aqui para preparar as integrações necessárias.',
    howItWorks: 'As credenciais ficam disponíveis para uso técnico e ajudam a conectar sistemas externos à plataforma.',
    note: 'Disponível após integração com a MyGateway.',
  },
}
