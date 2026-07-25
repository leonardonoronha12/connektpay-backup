# QA — Entrega Final (Connekt Pay v1.0.0)

Documento objetivo para o time de QA validar a versão **v1.0.0**.

---

## 1) URL da aplicação

- Produção / ambiente de homologação: **https://connektpay.vercel.app**

---

## 2) Usuários de teste disponíveis

- **Contas QA (RBAC por perfil)**:
  - Owner
    - E-mail: **qa.owner@connektpay.com**
    - Senha: **QaOwner@2026!**
  - Admin
    - E-mail: **qa.admin@connektpay.com**
    - Senha: **QaAdmin@2026!**
  - Financeiro
    - E-mail: **qa.financeiro@connektpay.com**
    - Senha: **QaFin@2026!**

- **Conta principal (E2E/Admin demo)**:
  - E-mail: **admin@connektpay.com**
  - Senha: **fornecida separadamente** (não está versionada no repositório)
  - Observação: esta conta é a usada nos fluxos automatizados de auditoria final (E2E_EMAIL).

- **Contas adicionais (sob demanda)**:
  - Se o QA precisar validar RBAC por perfil (Admin/Financeiro/Operacional/Viewer), solicitar ao time responsável o provisionamento de contas específicas por perfil.

---

## 3) Perfis de acesso

Perfis suportados pela aplicação (RBAC por organização):
- **Owner**: acesso total ao sistema.
- **Admin**: gestão operacional completa.
- **Financeiro**: acesso aos módulos financeiros.
- **Operacional**: operações do dia a dia (cadastros e rotinas comuns).
- **Viewer**: somente leitura.

Observação:
- O que cada perfil enxerga pode variar conforme permissões/rotas protegidas; validar com as contas específicas quando fornecidas.

---

## 4) Escopo do que deve ser testado

Foco: validação funcional e regressão da experiência da v1.0.0 (sem testes exploratórios de integrações externas não finalizadas).

### Rotas públicas
- `/` (redirect/landing)
- `/login`
- `/register`
- `/reset-password`
- `/checkout?slug=...` (checkout público)
- `/checkout/success` (pós-checkout público)

### Rotas autenticadas (painel)
- `/dashboard`
- `/transacoes` (filtros + export CSV)
- `/links-pagamento`
- `/links-pagamento/novo`
- `/assinaturas`
- `/subscriptions` (lista)
- `/subscriptions/new` (criar)
- `/subscriptions/plans` (planos)
- `/subscriptions/[id]` (detalhe)
- `/recebedores` (cadastro + KYC)
- `/ledger` (KPIs + listagem)
- `/antecipacao` (simulação + solicitações)
- `/repasses` (listagem + ações)
- `/configuracoes`
- `/configuracoes/integracoes`
- `/configuracoes/provedor`

### Rotas administrativas
- `/admin/painel`
- `/admin/aprovacao-kyc` (revisar documentos)
- `/admin/eventos` (reprocessar)
- `/admin/anticipation`
- `/admin/conciliacao`
- `/admin/auditoria`
- `/admin/provedor-financeiro`

---

## 5) Escopo do que NÃO deve ser testado ainda

Não testar (ou marcar como “bloqueado por dependência externa”) itens que exigem endpoints/eventos finais da MyGateway ou credenciais reais quando não disponíveis:
- **Antecipação real via provider** (endpoints finais do contrato).
- **Payouts/Repasses com status real via provider** (create/get/list e conciliação completa).
- **Listagens específicas do provider para conciliação** (ex.: listTransactions/listPayouts/listAnticipations) quando não houver endpoints finais.
- **listPaymentLinks** no provider (placeholder).
- **Homologação financeira real (PIX/cartão) com dinheiro real** se o ambiente não estiver com credenciais MyGateway e webhooks habilitados oficialmente.

Fora de escopo nesta entrega para QA funcional:
- Pentest / auditoria de segurança aprofundada (além de verificação de comportamento visível).
- Testes de carga/performance (além de percepção de performance no uso normal).
- Validação de integrações externas não relacionadas ao fluxo (e-mail transacional, SMS, etc.), se não estiverem oficialmente configuradas.

---

## 6) Lista dos módulos disponíveis

Módulos/áreas principais (UI):
- Autenticação: Login, Cadastro, Reset de senha
- Dashboard
- Transações
- Links de Pagamento (criar/listar)
- Checkout Público
- Assinaturas (lista + detalhe) + Planos
- Recebedores + KYC (cadastro e upload/visualização de docs)
- Ledger (extrato interno)
- Antecipação
- Repasses (Payouts)
- Administração:
  - Painel Admin
  - Aprovação KYC
  - Eventos (reprocessamento)
  - Conciliação
  - Auditoria
  - Provedor financeiro (status/config)
- Configurações:
  - Perfil/Organização
  - Integrações (API Keys/Tokens/Webhooks)
  - Provedor

---

## 7) Fluxos principais para validar

### Autenticação
- Login com **admin@connektpay.com** → redireciona para `/dashboard`
- Logout → volta para `/login` e não quebra navegação
- Reset de senha: `/reset-password` (fluxo de atualização)

### Comercial
- Transações:
  - listar
  - filtrar por status
  - buscar
  - exportar CSV (quando houver dados)
- Links de pagamento:
  - listar
  - criar novo link
  - copiar/abrir checkout
- Checkout público:
  - abrir `/checkout?slug=...`
  - selecionar método (PIX/cartão)
  - gerar cobrança (quando MyGateway estiver configurada)
  - acompanhar status / pós-checkout (`/checkout/success`)

### Assinaturas (recorrência)
- Listar assinaturas
- Abrir detalhe (`/subscriptions/[id]`) e validar eventos/estado
- Criar assinatura (`/subscriptions/new`) e gerenciar planos (`/subscriptions/plans`) conforme permissões/dados

### Financeiro
- Ledger:
  - KPIs e listagem
  - validação de estados de loading/empty quando não houver dados
- Antecipação:
  - simulação e criação (validação completa depende de provider real)
- Repasses:
  - listar e ações manuais disponíveis no painel (status completo depende do provider)

### Admin / Operação
- Aprovação KYC:
  - listar pendências
  - abrir documentos
  - aprovar/rejeitar com motivo
- Eventos:
  - listar e reprocessar evento
- Conciliação:
  - executar e revisar divergências (fluxo completo depende do provider para comparação total)
- Auditoria:
  - listar logs e validar busca/visualização
- Provedor financeiro:
  - status/configuração e mensagens quando não configurado

---

## 8) Funcionalidades que dependem da MyGateway

Dependem do provider para validação “real” (PIX/cartão/assinaturas/webhooks/status):
- Checkout (PIX e cartão): criação de cobrança, tokenização, autorização/captura, confirmação de “pago”
- Assinaturas: criação/cancelamento e eventos de cobrança
- Webhooks: assinatura, idempotência, retries e reprocessamento de eventos
- Conciliação: dados do provider (comparação completa)

Itens “preparados/pendentes” (dependem de endpoints finais do contrato MyGateway):
- Antecipação: request/get/cancel (implementado com mock/estrutura, pendente confirmação)
- Payouts/Repasses: create/get/list (parte pendente para conciliação completa)
- Listagens do provider para conciliação (listTransactions/listPayouts/listAnticipations)
- listPaymentLinks (placeholder)

---

## 9) Como reportar bugs

Abrir ticket com o seguinte checklist (copiar/colar):
- **Título**: [Módulo] resumo curto e objetivo
- **Ambiente**: https://connektpay.vercel.app
- **Conta usada**: e-mail + perfil (Owner/Admin/Financeiro/Operacional/Viewer)
- **Rota/URL**: `/...`
- **Passos para reproduzir** (numerados)
- **Resultado atual**
- **Resultado esperado**
- **Evidências**:
  - screenshot e/ou gravação de tela
  - console (apenas mensagens relevantes)
  - payload/IDs quando aplicável (transactionId, subscriptionId etc.) sem dados sensíveis
- **Frequência**: sempre / intermitente / 1ª vez
- **Impacto**: descreva o bloqueio para o usuário final

---

## 10) Severidade dos bugs

- **CRÍTICO**:
  - quebra de login, tela branca/crash, perda/corrupção de dados, loop de redirect, falha geral do sistema
  - vulnerabilidade de segurança evidente (exposição de dados entre organizações, bypass de auth)
- **ALTO**:
  - fluxo principal bloqueado sem workaround (criar link, abrir checkout, listar transações, aprovar KYC, etc.)
  - valores/estados claramente incorretos em módulos financeiros (mesmo que apenas UI)
- **MÉDIO**:
  - fluxo funciona com workaround; inconsistências relevantes de UX/validação; erros intermitentes
- **BAIXO**:
  - problemas visuais, textos/microcopy, alinhamentos, pequenos erros de navegação sem impacto funcional
- **INFO/SUGESTÃO**:
  - melhorias e oportunidades (não bloqueia homologação)

---

## 11) Observações importantes

- Após logout, podem ocorrer respostas **401** em chamadas pendentes (ex.: `/api/me`, `/api/dashboard`, `/api/transactions`). Isso é **comportamento esperado** quando a sessão é encerrada durante navegação.
- Caso a MyGateway não esteja configurada no ambiente, endpoints dependentes devem falhar de forma controlada (ex.: mensagem “MyGateway not configured” / status adequado), sem quebrar login e navegação do painel.
- Evitar registrar/compartilhar dados sensíveis em tickets (tokens, chaves completas, dados de cartão).

---

## 12) Status atual da v1.0.0

- Deploy ativo: **https://connektpay.vercel.app**
- Auditoria final (Playwright):
  - **CRÍTICO: 0**
  - **ALTO: 0**
  - **MÉDIO: 1**
  - **INFO: 12**
- Documentação e pacote de evidências já consolidados no repositório (inclui relatórios QA e auditoria).
