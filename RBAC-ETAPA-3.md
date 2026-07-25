# RBAC — Etapa 3 (APIs: app/api/**)

Data: 2026-06-27  
Escopo desta etapa: **somente** rotas internas em `app/api/**` (RBAC por role).  
Fora de escopo: UI, banco/migrations, MyGateway, regras financeiras, rotas públicas em `app/api/public/**`, webhooks assinados.

## 1) Arquivos alterados

- [dashboard/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/dashboard/route.ts)
- [transactions/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/transactions/route.ts)
- [customers/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/customers/route.ts)
- [payments/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payments/route.ts)
- [split-rules/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/split-rules/route.ts)
- [split-rules/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/split-rules/%5Bid%5D/route.ts)
- [integrations/tokens/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/integrations/tokens/%5Bid%5D/route.ts)

## 2) Convenção de RBAC aplicada nas APIs

- **Sem sessão**: `requireSessionOrgContext()` lança `Unauthorized` → resposta 401 via `classifyInternalApiError`.
- **Com sessão, sem permissão**: `assertRole(...)` lança `Forbidden` → resposta 403 via `classifyInternalApiError`.
- **Com permissão**: mantém status/shape original (200/201 etc).

Observação:
- Onde existiam fluxos **públicos não `/api/public/*`** (checkout por `token`/`slug`), eles foram preservados para não quebrar o produto.

## 3) Matriz de endpoints (roles, regra e status esperado)

Legenda de roles:
- OWNER = `owner` (e `super_admin` com acesso equivalente)
- ADMIN = `admin` (e `operacional` tratado como “operacional/admin”)
- FINANCEIRO = `financeiro`

### 3.1 Core (dashboard / transações / assinaturas)

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| GET `/api/dashboard` | OWNER, ADMIN, FINANCEIRO | `getOrgFromApiKey()` **ou** `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET `/api/transactions` (lista) | OWNER, ADMIN, FINANCEIRO | `getOrgFromApiKey()` **ou** `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET `/api/transactions?transactionId=...&token=...` | Público (token) | `public_token` (sem sessão) | 200/404 | — | 200 |
| GET `/api/transactions?transactionId=...` (sem token/apiKey) | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/404 |
| GET `/api/subscriptions` | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/subscriptions` (planId) | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 201/4xx |
| POST `/api/subscriptions` (planSlug - checkout) | Público (slug) | lookup por slug + actor owner (sem sessão) | 201/4xx | — | 201 |

### 3.2 Comercial (payment links / recebedores / planos)

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| GET `/api/payment-links?slug=...` | Público (slug) | leitura por slug (sem sessão) | 200/404 | — | 200 |
| GET `/api/payment-links` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/payment-links` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 201 |
| GET `/api/receivers` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/receivers` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 201 |
| GET/PATCH `/api/receivers/:id` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET/POST `/api/plans` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/201 |
| GET/PATCH `/api/plans/:id` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |

### 3.3 Financeiro (ledger / repasses / antecipação / conciliação)

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| GET `/api/ledger` | OWNER, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET/POST `/api/payouts` | OWNER, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/201 |
| GET/PATCH `/api/payouts/:id` | OWNER, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET/POST `/api/anticipation` | OWNER, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/201 |
| POST `/api/anticipation/simulate` | OWNER, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET `/api/anticipation/:id` | OWNER, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/anticipation/:id/cancel` | OWNER, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET/POST `/api/reconciliation` | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/201 |
| GET `/api/reconciliation/:id` | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET `/api/reconciliation/:id/items` | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/reconciliation/items/:itemId/resolve` | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/reconciliation/items/:itemId/reprocess` | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET/POST `/api/conciliation` | OWNER, ADMIN, FINANCEIRO | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/200 |

### 3.4 Admin (KYC / eventos / auditoria)

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| GET/POST `/api/kyc-requests` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/201 |
| PATCH `/api/kyc-requests/:id` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET `/api/kyc-requests/:id/documents` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/kyc/upload` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET `/api/events` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/events/:id/reprocess` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/events/process-pending` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET `/api/audit-logs` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| GET/POST `/api/admin/anticipation` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200/200 |

### 3.5 Sensíveis (owner-only)

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| GET/PUT `/api/provider-settings` | OWNER | `requireSessionOrgContext + assertRole(['owner','super_admin'])` | 401 | 403 | 200 |
| GET/PUT `/api/organization` | OWNER | `requireSessionOrgContext + assertRole(['owner','super_admin'])` | 401 | 403 | 200 |
| GET/POST `/api/integrations/api-keys` | OWNER | `requireSessionOrgContext + assertRole(['owner','super_admin'])` | 401 | 403 | 200/201 |
| PATCH/POST `/api/integrations/api-keys/:id` | OWNER | `requireSessionOrgContext + assertRole(['owner','super_admin'])` | 401 | 403 | 200/201 |
| GET/POST `/api/integrations/tokens` | OWNER | `requireSessionOrgContext + assertRole(['owner','super_admin'])` | 401 | 403 | 200/201 |
| PATCH/POST `/api/integrations/tokens/:id` | OWNER | `requireSessionOrgContext + assertRole(['owner','super_admin'])` | 401 | 403 | 200/201 |

### 3.6 Checkout (pagamentos) + split rules (config)

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| POST `/api/payments` (paymentLinkSlug) | Público (checkout) | slug + owner actor (sem sessão) | 201/4xx | — | 201 |
| POST `/api/payments` (sem paymentLinkSlug) | OWNER, ADMIN | `getOrgFromApiKey()` **ou** `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 201/4xx |
| GET `/api/split-rules` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |
| POST `/api/split-rules` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 201 |
| PATCH/DELETE `/api/split-rules/:id` | OWNER, ADMIN | `requireSessionOrgContext + assertRole([...])` | 401 | 403 | 200 |

### 3.7 Identidade / bootstrap

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| GET/PUT `/api/me` | Qualquer usuário autenticado | `getAuthedProfile()` | 401 | — | 200 |
| POST `/api/onboarding/ensure` | Qualquer usuário autenticado | `supabase.auth.getUser()` | 401 | — | 200 |

### 3.8 Fora do RBAC por sessão (públicos / assinatura)

| Endpoint | Roles permitidas | Regra aplicada | Sem sessão | Sem permissão | Com permissão |
|---|---|---|---:|---:|---:|
| `/api/public/*` | API key + rate limit | `getOrgFromApiKey` + rate limit | 401/429 | — | 200/201 |
| POST `/api/webhooks` | Público (assinatura) | HMAC/secret do provider | 200/4xx | — | 200 |

## 4) Resultado do lint/build

- `npm run lint`: OK (sem erros ESLint)
- `npm run build`: OK

## 5) Pendências para a Etapa 4 (validação com usuários QA)

- Rodar validação automatizada com os usuários QA (Owner/Admin/Financeiro) verificando:
  - status HTTP (401/403/200) por endpoint crítico
  - navegação em UI (já ajustada na etapa 2) alinhada com o backend
- Atualizar/expandir o script de validação para contemplar:
  - endpoints com fluxos públicos especiais (`/api/transactions?token=...`, `/api/payments` e `/api/subscriptions` por slug)
  - split-rules e customers (quando relevantes)

