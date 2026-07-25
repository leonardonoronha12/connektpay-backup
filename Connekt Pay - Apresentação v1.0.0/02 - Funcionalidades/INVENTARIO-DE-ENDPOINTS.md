# Inventário de Endpoints — Connekt Pay v1.0.0

Data: 2026-06-24  
BASE_URL (demo local): `http://localhost:3001`

Este documento mapeia:
- APIs internas (`/api/*`)
- APIs públicas (`/api/public/*`)
- Rotas administrativas (UI e APIs admin)
- Webhooks
- Integrações MyGateway (endpoints externos consumidos)

## 1) Padrões de autenticação

### API interna (`/api/*`)

- Autenticação: sessão Supabase (cookies) + organização no contexto
- Autorização: RBAC por papel quando aplicável (admin/financeiro etc.)

### API pública (`/api/public/*`)

- Autenticação: API Key por organização (headers)
- Rate limit: por organização + hash da API key

Headers esperados (padrão do projeto):
- `x-organization-id`
- `x-api-key` (ou `Authorization: Bearer ...` quando aplicável)

### Webhooks (`/api/webhooks`)

- Autenticação: assinatura HMAC com `MYGATEWAY_WEBHOOK_SECRET` (fail-closed em produção)

## 2) APIs internas (Next.js Route Handlers)

Formato:
- Método
- Endpoint
- Finalidade
- Autenticação exigida

### Identidade/Organização

- GET `/api/me` — Perfil/autenticação atual — Sessão (cookie)
- PUT `/api/me` — Atualizar perfil — Sessão (cookie)
- GET `/api/organization` — Dados da organização — Sessão (cookie)
- PUT `/api/organization` — Atualizar organização — Sessão (cookie)

### Dashboard/Comercial

- GET `/api/dashboard` — KPIs e agregações — Sessão (cookie)
- GET `/api/transactions` — Listar transações (filtros) — Sessão (cookie)
- POST `/api/payments` — Criar pagamento (fluxos internos/checkout) — Sessão (cookie) ou público controlado (conforme implementação)

### Payment Links / Checkout

- GET `/api/payment-links` — Listar links / consultar por slug — Sessão (cookie)
- POST `/api/payment-links` — Criar payment link — Sessão (cookie)

### Recorrência (Assinaturas/Planos)

- GET `/api/subscriptions` — Listar assinaturas — Sessão (cookie)
- POST `/api/subscriptions` — Criar assinatura — Sessão (cookie) ou público controlado (conforme implementação)
- GET `/api/subscriptions/:id` — Detalhar assinatura — Sessão (cookie)
- PATCH `/api/subscriptions/:id` — Atualizar assinatura (ex.: status) — Sessão (cookie)
- POST `/api/subscriptions/:id/cancel` — Cancelar assinatura — Sessão (cookie)

- GET `/api/plans` — Listar planos — Sessão (cookie)
- POST `/api/plans` — Criar plano — Sessão (cookie)
- PATCH `/api/plans/:id` — Atualizar plano — Sessão (cookie)

### Recebedores e KYC

- GET `/api/receivers` — Listar recebedores — Sessão (cookie)
- POST `/api/receivers` — Criar recebedor — Sessão (cookie)
- PATCH `/api/receivers/:id` — Atualizar recebedor — Sessão (cookie)

- GET `/api/kyc-requests` — Listar solicitações KYC — Sessão (cookie)
- POST `/api/kyc-requests` — Criar solicitação KYC — Sessão (cookie)
- PATCH `/api/kyc-requests/:id` — Atualizar status/decisão KYC — Sessão (cookie, papel admin)
- GET `/api/kyc-requests/:id/documents` — Listar/obter docs KYC — Sessão (cookie, papel admin)
- POST `/api/kyc/upload` — Upload de documento KYC — Sessão (cookie; backend com service role)

### Financeiro

- GET `/api/ledger` — Extrato/ledger — Sessão (cookie; papel financeiro)

- GET `/api/payouts` — Listar repasses — Sessão (cookie; papel financeiro)
- POST `/api/payouts` — Criar repasse — Sessão (cookie; papel financeiro)
- GET `/api/payouts/:id` — Detalhar repasse — Sessão (cookie; papel financeiro)
- PATCH `/api/payouts/:id` — Atualizar repasse (status) — Sessão (cookie; papel financeiro/admin)

- GET `/api/anticipation` — Listar/consultar antecipações — Sessão (cookie; papel financeiro)
- POST `/api/anticipation` — Solicitar antecipação — Sessão (cookie; papel financeiro)
- POST `/api/anticipation/simulate` — Simular antecipação — Sessão (cookie; papel financeiro)
- GET `/api/anticipation/:id` — Detalhar antecipação — Sessão (cookie; papel financeiro)
- POST `/api/anticipation/:id/cancel` — Cancelar antecipação — Sessão (cookie; papel financeiro)

- GET `/api/anticipations` — Listar solicitações de antecipação — Sessão (cookie; papel financeiro)
- POST `/api/anticipations` — Criar solicitação de antecipação — Sessão (cookie; papel financeiro)
- PATCH `/api/anticipations/:id` — Atualizar solicitação — Sessão (cookie; papel financeiro/admin)

### Split

- GET `/api/split-rules` — Listar regras de split — Sessão (cookie)
- POST `/api/split-rules` — Criar regra — Sessão (cookie)
- PATCH `/api/split-rules/:id` — Atualizar regra — Sessão (cookie)
- DELETE `/api/split-rules/:id` — Remover/desativar regra — Sessão (cookie)

### Conciliação e Auditoria

- GET `/api/conciliation` — Listar execuções/estado — Sessão (cookie; admin/financeiro)
- POST `/api/conciliation` — Executar conciliação — Sessão (cookie; admin/financeiro)

- GET `/api/reconciliation` — Listar execuções — Sessão (cookie; admin/financeiro)
- POST `/api/reconciliation` — Criar execução — Sessão (cookie; admin/financeiro)
- GET `/api/reconciliation/:id` — Detalhar execução — Sessão (cookie; admin/financeiro)
- GET `/api/reconciliation/:id/items` — Listar itens — Sessão (cookie; admin/financeiro)
- POST `/api/reconciliation/items/:itemId/reprocess` — Reprocessar item — Sessão (cookie; admin/financeiro)
- POST `/api/reconciliation/items/:itemId/resolve` — Resolver item — Sessão (cookie; admin/financeiro)

- GET `/api/audit-logs` — Listar auditoria — Sessão (cookie; admin)

### Eventos e integrações

- GET `/api/events` — Listar eventos — Sessão (cookie; admin)
- POST `/api/events/:id/reprocess` — Reprocessar evento — Sessão (cookie; admin)
- POST `/api/events/process-pending` — Processar pendentes (cron) — Segredo (`CRON_SECRET`/`EVENTS_PROCESS_SECRET`)

- GET `/api/integrations/api-keys` — Listar API keys — Sessão (cookie; admin)
- POST `/api/integrations/api-keys` — Criar API key — Sessão (cookie; admin)
- PATCH `/api/integrations/api-keys/:id` — Atualizar API key — Sessão (cookie; admin)
- POST `/api/integrations/api-keys/:id` — Ação operacional (ex.: rotacionar/revogar, conforme implementação) — Sessão (cookie; admin)

- GET `/api/integrations/tokens` — Listar tokens — Sessão (cookie; admin)
- POST `/api/integrations/tokens` — Criar token — Sessão (cookie; admin)
- PATCH `/api/integrations/tokens/:id` — Atualizar token — Sessão (cookie; admin)
- POST `/api/integrations/tokens/:id` — Ação operacional (ex.: revogar, conforme implementação) — Sessão (cookie; admin)

### Provedor financeiro (config/status)

- GET `/api/provider-settings` — Obter configuração do provider — Sessão (cookie; admin)
- PUT `/api/provider-settings` — Atualizar configuração do provider — Sessão (cookie; admin)

### Admin APIs

- GET `/api/admin/anticipation` — Admin: visão/ações do módulo de antecipação — Sessão (cookie; admin)
- POST `/api/admin/anticipation` — Admin: ação operacional — Sessão (cookie; admin)

## 3) APIs públicas

Essas rotas são para consumo externo controlado (API key + rate limit).

### Core público

- GET `/api/public/payment-links` — Listar/consultar links — API key + rate limit
- POST `/api/public/payment-links` — Criar link — API key + rate limit

- POST `/api/public/payments` — Criar pagamento — API key + rate limit
- GET `/api/public/transactions` — Listar transações — API key + rate limit
- GET `/api/public/transactions/:id` — Detalhar transação — API key + rate limit

- GET `/api/public/subscriptions` — Listar assinaturas — API key + rate limit
- POST `/api/public/subscriptions` — Criar assinatura — API key + rate limit

- GET `/api/public/payouts` — Listar repasses — API key + rate limit
- POST `/api/public/payouts` — Criar repasse — API key + rate limit

- GET `/api/public/ledger` — Consultar ledger — API key + rate limit

- GET `/api/public/customers` — Listar pagadores — API key + rate limit
- POST `/api/public/customers` — Criar pagador — API key + rate limit

- GET `/api/public/receivers` — Listar recebedores — API key + rate limit
- POST `/api/public/receivers` — Criar recebedor — API key + rate limit

## 4) Webhooks

- POST `/api/webhooks` — Ingestão de eventos do provider — Assinatura (HMAC) + persistência/reprocessamento

## 5) Rotas administrativas (UI)

Autenticação: sessão + RBAC.

- GET `/admin/painel`
- GET `/admin/aprovacao-kyc`
- GET `/admin/eventos`
- GET `/admin/conciliacao`
- GET `/admin/auditoria`
- GET `/admin/provedor-financeiro`
- GET `/admin/anticipation`

## 6) Integração MyGateway (endpoints externos consumidos)

Fonte: [MYGATEWAY-INTEGRATION-STATUS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/MYGATEWAY-INTEGRATION-STATUS.md)

| Funcionalidade | Método | Endpoint MyGateway | Status |
|---|---:|---|---|
| Autenticação | POST | `/authentication/v1/auth` | real |
| Criar Payment Link (PIX) | POST | `/payments/v1/create` | real |
| Consultar situação | GET | `/payments/v1/situation/{id}` | real |
| Tokenizar cartão | POST | `/payments/v1/creditcard/generate/token` | real |
| Criar assinatura | POST | `/subscriptions/v1/create` | real |
| Cancelar assinatura | POST | `/subscriptions/v1/cancel` | real |
| Antecipação | — | (a confirmar) | preparado |
| Payouts/Repasses | — | (a confirmar) | pendente |
| KYC submit | — | (a confirmar) | pendente |
| Pix Automático | — | (a confirmar) | pendente |

## 7) Contagem (v1.0.0)

- Rotas UI (page.tsx): 29 (inclui públicas, painel e admin)
- Route handlers em `app/api/**/route.ts`: 54
- Métodos HTTP implementados nesses handlers: 83

