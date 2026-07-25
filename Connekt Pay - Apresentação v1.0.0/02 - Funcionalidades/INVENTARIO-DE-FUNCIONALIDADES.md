# Inventário de Funcionalidades — Connekt Pay v1.0.0

Data: 2026-06-24  
Objetivo: mapear o que existe hoje na plataforma, com status e dependências.

Legenda de status:
- Implementado: disponível e operacional no app (com ressalvas normais de ambiente/dados)
- Parcial: existe, mas com limitações conhecidas de escopo/UX ou dependências indiretas
- Dependente de Provider: fluxo depende de endpoints/eventos MyGateway para validação completa

## Inventário (18 módulos)

### 1) Autenticação

- Status: Implementado
- Rotas principais:
  - `/login`, `/register`, `/reset-password`
- Dependências:
  - Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Observações:
  - Proteção de rotas e RBAC aplicadas via middleware e checks server-side

### 2) Dashboard

- Status: Implementado
- Rotas principais:
  - `/dashboard`
- Dependências:
  - Supabase (dados por organização)
- Observações:
  - KPIs principais e visão consolidada (últimos N dias)

### 3) Transações

- Status: Implementado
- Rotas principais:
  - `/transacoes`
- Dependências:
  - Supabase (transactions)
- Observações:
  - Inclui filtros, busca, detalhes e export CSV

### 4) Links de Pagamento

- Status: Implementado
- Rotas principais:
  - `/links-pagamento`, `/links-pagamento/novo`
- Dependências:
  - Supabase (payment_links)
  - MyGateway (criação/consulta quando credenciais reais estão configuradas)
- Observações:
  - Criação gera slug usado no checkout

### 5) Checkout Público

- Status: Dependente de Provider
- Rotas principais:
  - `/checkout?slug=...`, `/checkout/success`
- Dependências:
  - Supabase (consulta por slug)
  - MyGateway (pagamento PIX/cartão real, webhooks reais)
- Observações:
  - Opera por slug; pode funcionar em modo “demo” com respostas controladas quando provider não está configurado

### 6) Assinaturas

- Status: Dependente de Provider
- Rotas principais:
  - `/assinaturas` (atalho), `/subscriptions`, `/subscriptions/new`, `/subscriptions/[id]`
- Dependências:
  - Supabase (subscriptions)
  - MyGateway (criação/cancelamento/situação real; eventos de cobrança por webhook)
- Observações:
  - Gestão completa no painel; validação “real” depende de webhooks/eventos do provider

### 7) Planos

- Status: Parcial
- Rotas principais:
  - `/subscriptions/plans`
- Dependências:
  - Supabase (plans)
- Observações:
  - Algumas ações dependem de ter recebedor com KYC aprovado (regras de negócio)

### 8) Recebedores

- Status: Implementado
- Rotas principais:
  - `/recebedores`
- Dependências:
  - Supabase (receivers)
- Observações:
  - Cadastro/gestão de recebedores; base para split, payouts e KYC

### 9) KYC

- Status: Parcial
- Rotas principais:
  - `/admin/aprovacao-kyc`
- Dependências:
  - Supabase (kyc_requests, kyc_documents)
  - Supabase Storage (bucket de documentos)
- Observações:
  - Processo de upload e aprovação interna implementado; submit real no provider é pendente

### 10) Ledger

- Status: Implementado
- Rotas principais:
  - `/ledger`
- Dependências:
  - Supabase (ledger_entries e agregações)
- Observações:
  - Extrato e export CSV; base para conciliação e auditoria financeira interna

### 11) Antecipação

- Status: Dependente de Provider
- Rotas principais:
  - `/antecipacao`
- Dependências:
  - Supabase (anticipation_requests e eventos)
  - MyGateway (endpoints oficiais request/get/cancel a confirmar)
- Observações:
  - Implementação preparada; fluxo “real” depende do contrato MyGateway

### 12) Repasses

- Status: Dependente de Provider
- Rotas principais:
  - `/repasses`
- Dependências:
  - Supabase (payouts e eventos)
  - MyGateway (create/get/list a confirmar)
- Observações:
  - Gestão no painel; integração real do provider para status é pendente

### 13) Conciliação

- Status: Parcial
- Rotas principais:
  - `/admin/conciliacao`
- Dependências:
  - Supabase (conciliation runs/items/events)
  - MyGateway (consultas/listagens completas são pendentes; há conciliação por referência quando aplicável)
- Observações:
  - Útil para auditoria; completude depende de endpoints de listagem do provider

### 14) Auditoria

- Status: Implementado
- Rotas principais:
  - `/admin/auditoria`
- Dependências:
  - Supabase (audit_logs)
- Observações:
  - Logs imutáveis; export CSV disponível

### 15) Eventos/Webhooks

- Status: Parcial
- Rotas principais:
  - `/admin/eventos`
  - Webhook: `/api/webhooks` (backend)
- Dependências:
  - MyGateway (eventos reais)
  - Segredo de assinatura `MYGATEWAY_WEBHOOK_SECRET`
- Observações:
  - Persistência e reprocessamento implementados; cobertura real depende do catálogo final de eventos do provider

### 16) Configurações

- Status: Implementado
- Rotas principais:
  - `/configuracoes`
- Dependências:
  - Supabase (organization/profiles)
- Observações:
  - Atualização de dados de organização/perfil conforme permissão

### 17) Integrações

- Status: Implementado
- Rotas principais:
  - `/configuracoes/integracoes`
- Dependências:
  - Supabase (tokens/api keys)
- Observações:
  - Gestão de credenciais internas para API pública (quando usada)

### 18) Navegação Mobile

- Status: Implementado
- Rotas principais:
  - Drawer via header no layout autenticado; navega para módulos do painel
- Dependências:
  - UI (layout + componentes)
- Observações:
  - Resolve ausência de sidebar no mobile e habilita demo em viewport reduzida

