# API-SECURITY-MATRIX

## Resumo

- Rotas auditadas em `app/api/**`: 73
- Middleware: nao protege `/api/*`; toda protecao relevante precisa existir no handler
- Rotas corrigidas nesta rodada: 12
- Risco cross-tenant confirmado e corrigido: payouts externos (`/api/payouts` e `/api/public/payouts`)
- Worker automatico: protegido por `CRON_SECRET`, com validacao `Authorization: Bearer`, single-flight em memoria e cron versionado em `vercel.json`

## Legenda

- Autenticacao:
  - `Publica intencional`
  - `Autenticada`
  - `Autenticada + organization_id`
  - `Autenticada + RBAC`
  - `Webhook externo`
  - `Worker interno protegido por segredo`
- Cross-tenant:
  - `Sim` = existe protecao efetiva por `organization_id` ou ownership
  - `Parcial` = protecao existe, mas dependia de endurecimento complementar
  - `Nao` = nao se aplica
- Status:
  - `segura`
  - `corrigida`
  - `pendente`

## Auth, identidade e configuracao

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/auth/login` | `POST` | `app/api/auth/login/route.ts` | Login via Supabase e cookie `cp_role` | Publica intencional | N/A | Nao | Nao | Sim, runtime por IP | Nao | corrigida |
| `/api/auth/logout` | `POST` | `app/api/auth/logout/route.ts` | Logout e limpeza de sessao | Autenticada | N/A | Nao | Nao | Nao | Sim pratica | segura |
| `/api/me` | `GET, PUT` | `app/api/me/route.ts` | Leitura/atualizacao do proprio perfil | Autenticada | Proprio usuario | Perfil do proprio usuario | Sim | Nao | Nao | segura |
| `/api/onboarding/ensure` | `POST` | `app/api/onboarding/ensure/route.ts` | Garantir bootstrap de onboarding do usuario | Autenticada | Proprio usuario | Via contexto autenticado | Sim | Nao | Parcial | segura |
| `/api/organization` | `GET, PUT` | `app/api/organization/route.ts` | Configuracoes da organizacao | Autenticada + RBAC | `owner`, `super_admin` | Sim, `eq(id, ctx.organizationId)` | Sim | Nao | PUT parcial | segura |
| `/api/provider-settings` | `GET, PUT` | `app/api/provider-settings/route.ts` | Configuracoes do provider financeiro | Autenticada + RBAC | `owner`, `super_admin` | Sim, `organization_id` | Sim | Nao | PUT parcial | segura |

## Integracoes, auditoria e operacao

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/integrations/api-keys` | `GET, POST` | `app/api/integrations/api-keys/route.ts` | Listar e criar API keys | Autenticada + RBAC | `owner`, `super_admin` | Sim, `organization_id` em `provider_settings` | Sim | Nao | POST nao | segura |
| `/api/integrations/api-keys/[id]` | `PATCH, POST` | `app/api/integrations/api-keys/[id]/route.ts` | Revogar/rotacionar API key | Autenticada + RBAC | `owner`, `super_admin` | Sim, `organization_id` + busca por ID local | Sim | Nao | Parcial | segura |
| `/api/integrations/tokens` | `GET, POST` | `app/api/integrations/tokens/route.ts` | Listar e criar tokens | Autenticada + RBAC | `owner`, `super_admin` | Sim, `organization_id` em `provider_settings` | Sim | Nao | POST nao | segura |
| `/api/integrations/tokens/[id]` | `PATCH, POST` | `app/api/integrations/tokens/[id]/route.ts` | Revogar/rotacionar token | Autenticada + RBAC | `owner`, `super_admin` | Sim, `organization_id` + busca por ID local | Sim | Nao | Parcial | segura |
| `/api/audit-logs` | `GET` | `app/api/audit-logs/route.ts` | Consultar trilha de auditoria | Autenticada + RBAC | `owner`, `admin`, `super_admin` | Sim | Sim | Nao | N/A | segura |
| `/api/events` | `GET` | `app/api/events/route.ts` | Operacao da fila/eventos | Autenticada + RBAC | `owner`, `admin`, `operacional`, `super_admin` | Sim | Sim | Nao | N/A | segura |
| `/api/events/[id]/reprocess` | `POST` | `app/api/events/[id]/reprocess/route.ts` | Reprocessar evento manualmente | Autenticada + RBAC | `owner`, `admin`, `super_admin` | Sim, busca por evento da org | Sim | Nao | Sim pratica | segura |
| `/api/events/process-pending` | `GET, POST` | `app/api/events/process-pending/route.ts` | Worker automatico da fila | Worker interno protegido por segredo | N/A | Global da fila; sem sessao de usuario | Sim, segredo + lock | N/A | Sim, `single-flight` em memoria | corrigida |

## Core comercial, checkout e leitura publica

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/dashboard` | `GET` | `app/api/dashboard/route.ts` | Metricas do dashboard | Autenticada + RBAC ou API key | Sessao: `owner`, `admin`, `operacional`, `financeiro`, `super_admin` | Sim | Sim | Sim para API key | N/A | corrigida |
| `/api/customers` | `GET, POST` | `app/api/customers/route.ts` | Clientes internos ou por API key mista | Autenticada + RBAC ou API key | Sessao: `owner`, `admin`, `operacional`, `super_admin` | Sim | Sim | Sim para API key | POST nao | corrigida |
| `/api/public/customers` | `GET, POST` | `app/api/public/customers/route.ts` | Clientes via API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | POST nao | segura |
| `/api/payment-links` | `GET, POST` | `app/api/payment-links/route.ts` | Lista interna, create interno e leitura publica por slug | GET slug publica; restante autenticada + RBAC | `owner`, `admin`, `super_admin` | Sim no fluxo privado; slug publico sem tenant exposto | Sim | Sim no slug publico | POST nao | corrigida |
| `/api/public/payment-links` | `GET, POST` | `app/api/public/payment-links/route.ts` | Payment Links por API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | POST nao | segura |
| `/api/payments` | `POST` | `app/api/payments/route.ts` | Pagamento avulso ou checkout de link | Misto: sessao, API key ou checkout publico por slug | Sessao: `owner`, `admin`, `operacional`, `super_admin` | Sim; `paymentLinkSlug` resolve a org do link | Parcial antes; agora reforcado | Sim para API key e checkout publico | Parcial, replay window para checkout publico | corrigida |
| `/api/public/payments` | `POST` | `app/api/public/payments/route.ts` | Pagamento via API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | Parcial | segura |
| `/api/transactions` | `GET` | `app/api/transactions/route.ts` | Listagem interna/exportacao e detalhe publico por token | Sessao, API key ou token publico | Sessao: `owner`, `admin`, `operacional`, `financeiro`, `super_admin` | Sim; detalhe por `organization_id` ou `public_token` | Sim | Sim para API key e token publico | N/A | corrigida |
| `/api/public/transactions` | `GET` | `app/api/public/transactions/route.ts` | Listagem de transacoes via API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | N/A | segura |
| `/api/public/transactions/[id]` | `GET` | `app/api/public/transactions/[id]/route.ts` | Detalhe de transacao via API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | N/A | segura |
| `/api/ledger` | `GET` | `app/api/ledger/route.ts` | Extrato/ledger interno | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim | Sim | Nao | N/A | segura |
| `/api/public/ledger` | `GET` | `app/api/public/ledger/route.ts` | Ledger via API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | N/A | segura |

## Assinaturas, planos e modulos internos de recorrencia

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/plans` | `GET, POST` | `app/api/plans/route.ts` | Listar/criar planos | Autenticada + RBAC | `owner`, `admin`, `super_admin` | Sim | Sim | Nao | POST nao | segura |
| `/api/plans/[id]` | `PATCH` | `app/api/plans/[id]/route.ts` | Atualizar plano | Autenticada + RBAC | `owner`, `admin`, `super_admin` | Sim por servico/ID | Sim | Nao | Nao | segura |
| `/api/subscriptions` | `GET, POST` | `app/api/subscriptions/route.ts` | Listar assinaturas e criar assinatura por `planId` ou `planSlug` | Sessao ou fluxo publico por `planSlug` | GET: `owner`, `admin`, `financeiro`, `super_admin`; POST por sessao: `owner`, `admin`, `super_admin` | Sim; `planSlug` resolve org do link recorrente | Parcial antes; agora reforcado | Sim para API key e fluxo publico | Parcial, replay window para `planSlug` publico | corrigida |
| `/api/subscriptions/[id]` | `GET, PATCH` | `app/api/subscriptions/[id]/route.ts` | Detalhe/edicao da assinatura | Autenticada + RBAC | `owner`, `admin`, `financeiro`, `super_admin` | Sim por servico/ID | Sim | Nao | N/A | segura |
| `/api/subscriptions/[id]/cancel` | `POST` | `app/api/subscriptions/[id]/cancel/route.ts` | Cancelar assinatura | Autenticada + RBAC | `owner`, `admin`, `super_admin` | Sim por servico/ID | Sim | Nao | Parcial | segura |
| `/api/public/subscriptions` | `GET, POST` | `app/api/public/subscriptions/route.ts` | Assinaturas via API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | Parcial | segura |
| `/api/subscriptions-internal` | `GET` | `app/api/subscriptions-internal/route.ts` | Listagem interna de assinaturas | Autenticada + RBAC | Roles do modulo interno | Sim | Sim | Nao | N/A | segura |
| `/api/subscriptions-internal/simulate` | `POST` | `app/api/subscriptions-internal/simulate/route.ts` | Simulacao interna de assinatura | Autenticada + RBAC | Roles do modulo interno | Sim | Sim | Nao | N/A | segura |
| `/api/subscriptions-internal/plans` | `GET, POST` | `app/api/subscriptions-internal/plans/route.ts` | Planos internos de recorrencia | Autenticada + RBAC | Roles do modulo interno | Sim | Sim | Nao | POST nao | segura |
| `/api/subscriptions-internal/plans/[id]` | `GET, PATCH, DELETE` | `app/api/subscriptions-internal/plans/[id]/route.ts` | Operacoes em plano interno | Autenticada + RBAC | Roles do modulo interno | Sim por servico/ID | Sim | Nao | Nao | segura |
| `/api/subscriptions-internal/plans/[id]/duplicate` | `POST` | `app/api/subscriptions-internal/plans/[id]/duplicate/route.ts` | Duplicar plano interno | Autenticada + RBAC | Roles do modulo interno | Sim por servico/ID | Sim | Nao | Nao | segura |
| `/api/subscriptions-internal/subscriptions` | `GET, POST` | `app/api/subscriptions-internal/subscriptions/route.ts` | Assinaturas internas | Autenticada + RBAC | Roles do modulo interno | Sim | Sim | Nao | POST nao | segura |
| `/api/subscriptions-internal/subscriptions/[id]` | `GET, PATCH, DELETE` | `app/api/subscriptions-internal/subscriptions/[id]/route.ts` | Operacoes em assinatura interna | Autenticada + RBAC | Roles do modulo interno | Sim por servico/ID | Sim | Nao | Nao | segura |

## Split

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/split-rules` | `GET, POST` | `app/api/split-rules/route.ts` | Regras de split legadas | Autenticada + RBAC | Roles de split | Sim | Sim | Nao | POST nao | segura |
| `/api/split-rules/[id]` | `PATCH, DELETE` | `app/api/split-rules/[id]/route.ts` | Atualizar/remover regra | Autenticada + RBAC | Roles de split | Sim por `organization_id` + ID | Sim | Nao | Nao | segura |
| `/api/split-configs` | `GET, POST` | `app/api/split-configs/route.ts` | Configuracoes internas de split | Autenticada + RBAC | Roles de split | Sim por servico e org | Sim | Nao | POST nao | segura |
| `/api/split-configs/[id]` | `GET, PATCH, DELETE` | `app/api/split-configs/[id]/route.ts` | Operacoes por config de split | Autenticada + RBAC | Roles de split | Sim por servico e ID | Sim | Nao | Nao | segura |
| `/api/split-configs/validate` | `POST` | `app/api/split-configs/validate/route.ts` | Validacao de regras de split | Autenticada + RBAC | Roles de split | Sim | Sim | Nao | N/A | segura |
| `/api/split-configs/simulate` | `POST` | `app/api/split-configs/simulate/route.ts` | Simulacao interna de split | Autenticada + RBAC | Roles de split | Sim | Sim | Nao | N/A | segura |

## Recebedores e KYC

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/receivers` | `GET, POST` | `app/api/receivers/route.ts` | Listar/criar recebedores | Autenticada + RBAC | Roles KYC/recebedores | Sim | Sim | Nao | Parcial por documento | segura |
| `/api/receivers/[id]` | `PATCH` | `app/api/receivers/[id]/route.ts` | Atualizar recebedor | Autenticada + RBAC | Roles KYC/recebedores | Sim por `organization_id` + ID | Sim | Nao | Nao | segura |
| `/api/public/receivers` | `GET, POST` | `app/api/public/receivers/route.ts` | Recebedores via API publica | API key + `x-organization-id` | N/A | Sim | Sim | Sim | Parcial por documento | segura |
| `/api/kyc/upload` | `POST` | `app/api/kyc/upload/route.ts` | Upload de documento KYC | Autenticada + RBAC | Roles KYC/recebedores | Sim | Sim | Nao | Parcial por checksum | segura |
| `/api/kyc-requests` | `GET, POST` | `app/api/kyc-requests/route.ts` | Listar/abrir solicitacoes KYC | Autenticada + RBAC | Roles KYC/recebedores | Sim | Sim | Nao | Parcial | segura |
| `/api/kyc-requests/[id]` | `PATCH` | `app/api/kyc-requests/[id]/route.ts` | Atualizar status KYC | Autenticada + RBAC | Roles KYC/recebedores | Sim por `organization_id` + ID | Sim | Nao | Nao | segura |
| `/api/kyc-requests/[id]/documents` | `GET` | `app/api/kyc-requests/[id]/documents/route.ts` | Listar documentos do pedido KYC | Autenticada + RBAC | Roles KYC/recebedores | Sim por `organization_id` + ID | Sim | Nao | N/A | segura |
| `/api/kyc-documents/[id]` | `DELETE` | `app/api/kyc-documents/[id]/route.ts` | Remover documento KYC | Autenticada + RBAC | Roles KYC/recebedores | Sim por `organization_id` + ID | Sim | Nao | Sim pratica | segura |

## Payouts, antecipacao e backoffice financeiro

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/payouts` | `GET, POST` | `app/api/payouts/route.ts` | Repasses externos internos por sessao | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim | Corrigida com ownership de `receiverId` | Nao | POST nao | corrigida |
| `/api/payouts/[id]` | `GET, PATCH` | `app/api/payouts/[id]/route.ts` | Detalhe/atualizacao de repasse externo | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim por `organization_id` + ID | Sim | Nao | Parcial | segura |
| `/api/public/payouts` | `GET, POST` | `app/api/public/payouts/route.ts` | Repasses externos via API publica | API key + `x-organization-id` | N/A | Sim | Corrigida com ownership de `receiverId` | Sim | POST nao | corrigida |
| `/api/payouts-internal` | `GET, POST` | `app/api/payouts-internal/route.ts` | Repasses internos | Autenticada + RBAC | Roles de payout interno | Sim | Sim | Nao | POST nao | segura |
| `/api/payouts-internal/[id]` | `GET, PATCH, DELETE` | `app/api/payouts-internal/[id]/route.ts` | Operacoes em repasse interno | Autenticada + RBAC | Roles de payout interno | Sim por servico/ID | Sim | Nao | Nao | segura |
| `/api/payouts-internal/simulate` | `POST` | `app/api/payouts-internal/simulate/route.ts` | Simulacao de repasse interno | Autenticada + RBAC | Roles de payout interno | Sim | Sim | Nao | N/A | corrigida |
| `/api/anticipation` | `GET, POST` | `app/api/anticipation/route.ts` | Bootstrap e criacao de antecipacao interna | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim | Sim | Nao | POST nao | segura |
| `/api/anticipation/[id]` | `GET` | `app/api/anticipation/[id]/route.ts` | Detalhe de antecipacao | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim por `organization_id` + ID | Sim | Nao | N/A | segura |
| `/api/anticipation/[id]/cancel` | `POST` | `app/api/anticipation/[id]/cancel/route.ts` | Cancelar antecipacao | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim por `organization_id` + ID | Sim | Nao | Parcial | segura |
| `/api/anticipation/simulate` | `POST` | `app/api/anticipation/simulate/route.ts` | Simulacao de antecipacao | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim | Sim | Nao | N/A | corrigida |
| `/api/anticipations` | `GET, POST` | `app/api/anticipations/route.ts` | Lista/solicitacao legada de antecipacao | Autenticada + RBAC | `owner`, `financeiro`, `super_admin` | Sim | Sim | Nao | POST nao | segura |
| `/api/anticipations/[id]` | `PATCH` | `app/api/anticipations/[id]/route.ts` | Placeholder legado/compat | N/A | N/A | N/A | N/A | N/A | N/A | segura |
| `/api/admin/anticipation` | `GET, POST` | `app/api/admin/anticipation/route.ts` | Backoffice de antecipacao | Autenticada + RBAC | `owner`, `admin`, `super_admin` | Sim | Sim | Nao | Parcial | segura |

## Reconciliacao, conciliacao e webhook

| Endpoint | Metodo | Arquivo | Finalidade | Autenticacao necessaria | Role necessaria | Validacao de `organization_id` | Protecao cross-tenant | Rate limit | Idempotencia | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/reconciliation` | `GET, POST` | `app/api/reconciliation/route.ts` | Rodadas de reconciliacao | Autenticada + RBAC | `owner`, `admin`, `financeiro`, `super_admin` | Sim | Sim | Nao | POST parcial | segura |
| `/api/reconciliation/[id]` | `GET` | `app/api/reconciliation/[id]/route.ts` | Detalhe de run de reconciliacao | Autenticada + RBAC | `owner`, `admin`, `financeiro`, `super_admin` | Sim por `organization_id` + ID | Sim | Nao | N/A | segura |
| `/api/reconciliation/[id]/items` | `GET` | `app/api/reconciliation/[id]/items/route.ts` | Itens da reconciliacao | Autenticada + RBAC | `owner`, `admin`, `financeiro`, `super_admin` | Sim por `organization_id` + ID | Sim | Nao | N/A | segura |
| `/api/reconciliation/items/[itemId]/resolve` | `POST` | `app/api/reconciliation/items/[itemId]/resolve/route.ts` | Resolver item divergente | Autenticada + RBAC | `owner`, `admin`, `financeiro`, `super_admin` | Sim por lookup do item | Sim | Nao | Parcial | segura |
| `/api/reconciliation/items/[itemId]/reprocess` | `POST` | `app/api/reconciliation/items/[itemId]/reprocess/route.ts` | Reprocessar item divergente | Autenticada + RBAC | `owner`, `admin`, `financeiro`, `super_admin` | Sim por lookup do item | Sim | Nao | Parcial | segura |
| `/api/conciliation` | `GET, POST` | `app/api/conciliation/route.ts` | Compatibilidade de conciliacao legado | Autenticada + RBAC | `owner`, `admin`, `financeiro`, `super_admin` | Sim | Sim | Nao | POST parcial | segura |
| `/api/webhooks` | `POST` | `app/api/webhooks/route.ts` | Recebimento de webhooks do PSP | Webhook externo | N/A | Inferida do payload/meta + persistencia da org | Sim | N/A | Sim, dedupe por `provider_event_id` | segura |

## Observacoes finais

- Correcoes aplicadas nesta rodada:
  - `POST /api/auth/login`
  - `GET /api/dashboard`
  - `GET, POST /api/customers`
  - `GET /api/transactions`
  - `GET /api/payment-links?slug=...`
  - `POST /api/payments`
  - `POST /api/subscriptions`
  - `POST /api/payouts`
  - `POST /api/public/payouts`
  - `GET, POST /api/events/process-pending`
  - `POST /api/anticipation/simulate`
  - `POST /api/payouts-internal/simulate`
- Rota de maior risco encontrada e fechada:
  - payout externo aceitando `receiverId` sem ownership check
- Pontos intencionais mantidos:
  - rotas em `/api/public/**` seguem publicas apenas quando dependem de API key da organizacao
  - `GET /api/payment-links?slug=...` e detalhe publico de transacao continuam publicos por necessidade do checkout, agora com limitacao adicional de abuso
