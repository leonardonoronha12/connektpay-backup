# PROJECT-STATUS

## Resumo executivo

- Projeto: Connekt Pay
- Stack principal: Next.js 15 App Router, React 18, TypeScript, Supabase, Vercel
- Superficie atual do app: 26 paginas autenticadas em `app/(app)`, checkout publico em `app/checkout`, login/callback/docs publicos e 73 rotas de API em `app/api`
- Banco: Supabase com 25 migrations versionadas em `supabase/migrations`
- PSP integrado de fato: MyGateway
- Dependencias externas reais em uso: Supabase, MyGateway, SendGrid e Vercel
- Estado geral: base funcional ampla, com modulos internos operacionais e integracoes externas ainda mistas entre concluido, parcial, bloqueado por contrato e nao iniciado

## Arquitetura atual

### Camadas

1. Frontend App Router
   - Area autenticada em `app/(app)`
   - Area publica em `app/checkout`, `app/login`, `app/register`, `app/reset-password`, `app/auth/callback`
   - Shell principal em `components/layout/AppShell.tsx`, `components/layout/Sidebar.tsx` e `components/layout/Header.tsx`

2. Backend HTTP interno
   - Rotas em `app/api/**`
   - Separacao por dominio: billing, recebedores, KYC, split, assinaturas, repasses, antecipacao, reconciliacao, auditoria, eventos, integracoes e rotas publicas

3. Servicos de dominio
   - Logica de negocio em `lib/**`
   - Provider financeiro abstraido por `lib/acquirer/provider.ts`
   - Implementacao concreta atual em `lib/acquirer/myg-provider.ts`

4. Persistencia
   - Supabase como Auth, Postgres e storage de estado operacional
   - Multi-tenant por `organization_id`

### Fluxo de seguranca

- Middleware web em `middleware.ts`
  - Protege navegacao web
  - Libera `/_next`, `/docs`, `/login`, `/checkout` e todo `/api`
  - Redireciona para `/login` quando nao ha sessao
  - Aplica RBAC por path quando o papel esta no cookie
- RBAC central em `lib/rbac.ts`
  - Roles: `owner`, `admin`, `financeiro`, `operacional`, `super_admin`
  - Regras centralizadas por rota
- Guard server-side adicional em `lib/rbac-server.ts`
  - Usa cookie `cp_role` ou fallback no perfil autenticado para bloquear/redirect em paginas RSC
- Guard de API em `lib/session-org-context.ts`
  - Toda API protegida depende do proprio handler para validar sessao e role

### Autenticacao

- Auth principal via Supabase
- Login em `app/api/auth/login/route.ts`
  - faz `signInWithPassword`
  - resolve role via metadata/perfil
  - grava cookie httpOnly `cp_role`
- Logout em `app/api/auth/logout/route.ts`
- Callback em `app/auth/callback/page.tsx`
- Contexto de usuario/perfil em `lib/auth-context.ts`
- Hook cliente em `hooks/useSession.ts`

## Matriz de status por modulo

| Modulo | Status | Evidencia atual | Observacao tecnica |
|---|---|---|---|
| Login e autenticacao | Concluido | `app/api/auth/*`, `app/auth/callback`, `hooks/useSession.ts` | Fluxo real via Supabase e role cookie |
| RBAC e permissoes | Concluido | `lib/rbac.ts`, `lib/rbac-server.ts`, `middleware.ts` | Regras por rota e bloqueio server-side |
| Dashboard | Concluido | `app/(app)/dashboard`, `app/api/dashboard` | Operacional no painel |
| Transacoes | Concluido | `app/(app)/transacoes`, `app/api/transactions` | Listagem interna e publica |
| Planos | Concluido | `app/(app)/subscriptions/plans`, `app/api/plans` | CRUD base disponivel |
| Recebedores internos | Concluido | `app/(app)/recebedores`, `app/api/receivers` | Fluxo interno implementado; sync externo separado por flag |
| Ledger | Concluido | `app/(app)/ledger`, `app/api/ledger` | Modulo financeiro interno operacional |
| Auditoria | Concluido | `app/(app)/admin/auditoria`, `app/api/audit-logs` | Trilha de acoes implementada |
| Configuracoes | Concluido | `app/(app)/configuracoes*`, `app/api/organization`, `app/api/provider-settings` | Gestao interna operacional |
| Payment Links | Concluido | `app/(app)/links-pagamento`, `app/api/payment-links`, `lib/acquirer/myg-provider.ts` | Auth v2, create/get/list, cache de token, checkout publico e producao validados; recorrencia permanece separada em Assinaturas |
| Checkout / Billing | Em desenvolvimento | `app/checkout`, `app/api/payments`, `app/api/public/payments` | Checkout publico e link hospedado funcionam; pagamento avulso e modulos externos seguem parciais |
| KYC interno | Em desenvolvimento | `app/api/kyc-*`, `app/(app)/admin/aprovacao-kyc` | Workflow interno pronto; integracao externa ainda parcial |
| Split interno | Em desenvolvimento | `app/(app)/split`, `app/api/split-configs*`, `app/api/split-rules*` | Motor interno existe; contrato externo ainda pendente |
| Assinaturas internas | Em desenvolvimento | `app/(app)/assinaturas-internas`, `app/api/subscriptions-internal/**` | Fluxo interno e simulacao existem |
| Repasses internos | Em desenvolvimento | `app/(app)/repasses-internos`, `app/api/payouts-internal/**` | Fluxo interno e simulacao existem |
| Antecipacao interna | Em desenvolvimento | `app/(app)/antecipacao`, `app/api/anticipation*`, `app/api/anticipations*` | Simulacao e fluxo interno existem |
| Conciliacao | Em desenvolvimento | `app/(app)/admin/conciliacao`, `app/api/reconciliation/**`, `lib/reconciliation-service.ts` | Motor pronto com fallback legado; depende de endpoints externos completos |
| Painel administrativo | Em desenvolvimento | `app/(app)/admin/**`, `app/api/events`, `app/api/reconciliation`, `app/api/admin/anticipation` | Backoffice amplo, mas parte do dominio ainda depende do PSP |
| Integracoes MyGateway adicionais | Bloqueado | `lib/acquirer/myg-provider.ts` | KYC provider, split externo, payouts completos, antecipacao completa e listagens ainda dependem de contrato/endpoints reais |
| Assinaturas no provider | Bloqueado | `lib/acquirer/myg-provider.ts`, `app/api/subscriptions` | Adapter existe, mas o modulo ainda depende de homologacao externa plena |
| Repasses no provider | Bloqueado | `app/api/payouts*`, `lib/acquirer/myg-provider.ts` | Fluxo externo condicionado a contrato/configuracao |
| Antecipacao no provider | Bloqueado | `lib/acquirer/myg-provider.ts`, `app/api/anticipation*` | Ha stubs e compatibilidade, mas nao fechamento contratual total |
| Webhooks outbound | Nao iniciado | `provider_settings.webhook_url` sem evidencia de uso emissor | Ha recebimento inbound; nao ha emissao versionada |
| Cron operacional versionado | Concluido | `vercel.json`, `app/api/events/process-pending` | Cron versionado a cada 5 minutos, worker protegido por `CRON_SECRET` e fluxo preparado para execucao automatica na Vercel |
| Pix Automatico | Nao iniciado | Documentacao apenas | Sem implementacao no codigo |
| Edge Functions | Nao iniciado | Sem `supabase/functions` | Nao implementado no repo |

## Modulos concluidos

- Login e autenticacao
- RBAC e permissoes
- Dashboard
- Transacoes
- Planos
- Recebedores internos
- Ledger
- Auditoria
- Configuracoes
- Payment Links
- Cron operacional versionado

## Modulos parcialmente concluidos

- Checkout / Billing
- KYC interno
- Split interno
- Assinaturas internas
- Repasses internos
- Antecipacao interna
- Conciliacao
- Painel administrativo

## Modulos bloqueados

- KYC no provider
- Split externo no provider
- Assinaturas no provider
- Repasses no provider
- Antecipacao no provider
- Parte da conciliacao dependente de listagens/endpoints do provider

## Modulos nao iniciados

- Pix Automatico
- Webhooks outbound
- Edge Functions

## Dependencias externas

- `next`, `react`, `react-dom`
- `@supabase/ssr`, `@supabase/supabase-js`
- `lucide-react`
- `@mui/material`, `@mui/icons-material`
- `@playwright/test`, `playwright`
- API SendGrid via `lib/email-service.ts`
- API MyGateway via `lib/acquirer/myg-provider.ts`
- Plataforma Vercel

## Integracoes existentes

### Integracoes reais

- Supabase
  - Auth
  - Postgres
  - storage operacional de estado
- MyGateway
  - auth v2
  - payment links
  - checkout publico hospedado por `provider_url`
  - demais contratos externos permanecem preparados, parciais ou bloqueados por flag/contrato
- SendGrid
  - envio de e-mail transacional
- Vercel
  - build/deploy/runtime

### Integracoes previstas, mas nao implementadas como provider separado

- Nao ha Stripe, Mercado Pago, Asaas, Pagar.me direto, Adyen, Stone, Cielo ou PagSeguro integrados no codigo
- A interface `AcquirerProvider` e generica, mas a unica implementacao concreta atual e MyGateway

## Endpoints internos

### Autenticacao e sessao

- `/api/auth/login`
- `/api/auth/logout`
- `/api/me`
- `/api/onboarding/ensure`
- `/api/organization`

### Dashboard, auditoria e eventos

- `/api/dashboard`
- `/api/audit-logs`
- `/api/events`
- `/api/events/[id]/reprocess`
- `/api/events/process-pending`

### Billing principal

- `/api/payment-links`
- `/api/payments`
- `/api/transactions`
- `/api/subscriptions`
- `/api/subscriptions/[id]`
- `/api/subscriptions/[id]/cancel`
- `/api/plans`
- `/api/plans/[id]`

### Recebedores e KYC

- `/api/receivers`
- `/api/receivers/[id]`
- `/api/kyc-requests`
- `/api/kyc-requests/[id]`
- `/api/kyc-requests/[id]/documents`
- `/api/kyc-documents/[id]`
- `/api/kyc/upload`

### Split

- `/api/split-configs`
- `/api/split-configs/[id]`
- `/api/split-configs/validate`
- `/api/split-configs/simulate`
- `/api/split-rules`
- `/api/split-rules/[id]`

### Repasses

- `/api/payouts`
- `/api/payouts/[id]`
- `/api/payouts-internal`
- `/api/payouts-internal/[id]`
- `/api/payouts-internal/simulate`

### Antecipacao

- `/api/anticipation`
- `/api/anticipation/[id]`
- `/api/anticipation/[id]/cancel`
- `/api/anticipation/simulate`
- `/api/anticipations`
- `/api/anticipations/[id]`
- `/api/admin/anticipation`

### Conciliacao

- `/api/conciliation`
- `/api/reconciliation`
- `/api/reconciliation/[id]`
- `/api/reconciliation/[id]/items`
- `/api/reconciliation/items/[itemId]/reprocess`
- `/api/reconciliation/items/[itemId]/resolve`

### Integracoes e chaves

- `/api/provider-settings`
- `/api/integrations/api-keys`
- `/api/integrations/api-keys/[id]`
- `/api/integrations/tokens`
- `/api/integrations/tokens/[id]`

### APIs publicas

- `/api/public/customers`
- `/api/public/ledger`
- `/api/public/payment-links`
- `/api/public/payments`
- `/api/public/payouts`
- `/api/public/receivers`
- `/api/public/subscriptions`
- `/api/public/transactions`
- `/api/public/transactions/[id]`

### Webhooks

- `/api/webhooks`

## Endpoints externos consumidos

### MyGateway confirmados no codigo

- `POST /authentication/v2/auth`
- `POST /payments/v1/paymentlink`
- `GET /payments/v1/paymentlink`
- `GET /payments/v1/paymentlink/{id}`
- `POST /payments/v1/create`
- `POST /payments/v1/creditcard/generate/token`
- `POST /subscriptions/v1/create`
- `POST /subscriptions/v1/cancel`
- `POST /anticipations/v1/request`
- `POST /anticipations/v1/cancel`
- `POST /payouts`

### SendGrid

- `POST https://api.sendgrid.com/v3/mail/send`

## Tabelas

### Core

- `organizations`
- `profiles`
- `customers`
- `receivers`
- `payment_links`
- `transactions`
- `subscriptions`
- `split_rules`
- `anticipation_requests`
- `payouts`
- `ledger_entries`
- `webhook_events`
- `kyc_requests`
- `audit_logs`
- `provider_settings`
- `api_rate_limits`
- `webhook_attempts`

### Conciliacao

- `conciliation_runs`
- `conciliation_items`
- `pay_conciliation_runs`
- `pay_conciliation_items`
- `pay_conciliation_events`

### Split

- `pay_taxa_config`
- `pay_transacao`
- `pay_split`
- `pay_ledger`
- `split_configs`

### Assinaturas / recorrencia

- `pay_plano`
- `pay_pagador`
- `pay_assinatura`
- `pay_subscription_events`

### Antecipacao

- `pay_antecipacao`
- `pay_antecipacao_events`

### Complementares

- `kyc_documents`
- `payout_events`
- `email_logs`

## Politicas RLS

- RLS habilitado na camada principal multi-tenant
- Politica base por `organization_id`
- Funcao central: `current_organization_ids()`
- `FORCE ROW LEVEL SECURITY` aplicado nas tabelas principais
- Modulos adicionais com RLS versionado:
  - webhooks attempts
  - split
  - recorrencia
  - antecipacao
  - reconciliacao v2
  - KYC/documentos
  - payout events
  - split configs
- Excecao intencional:
  - `api_rate_limits` nao possui policies abertas para usuario final; o acesso ocorre via funcao `security definer`

## Cron jobs

- Ha cron versionado no repo
- `vercel.json` define cron para `/api/events/process-pending`
- As migrations nao mostram `pg_cron` nem agendamento SQL
- O worker HTTP `/api/events/process-pending` agora esta versionado para execucao automatica e protegido por `CRON_SECRET`

## Filas

- Nao ha broker dedicado como Bull, RabbitMQ, SQS ou PGMQ
- A fila atual e table-backed
  - `webhook_events`
  - `webhook_attempts`
- O processamento com retry/backoff fica em `lib/webhook-processor.ts`
- Reprocessamento manual existe em `/api/events/[id]/reprocess`

## Webhooks

### Inbound implementado

- Endpoint: `/api/webhooks`
- Validacao HMAC com segredo do provider
- Deduplicacao por `provider_event_id`
- Persistencia em `webhook_events`
- Processamento imediato e fila de retry

### Outbound nao evidenciado

- `provider_settings` possui `webhook_url`
- Nao ha evidencia de emissor outbound usando esse campo no codigo

## Permissoes

### Roles

- `owner`
- `admin`
- `financeiro`
- `operacional`
- `super_admin`

### Regras

- Matriz principal em `lib/rbac.ts`
- Sidebar e Header respeitam role
- Paginas criticas usam `requirePageAccess`
- APIs privadas usam `requireSessionOrgContext` e `assertRole`

## Middleware

- Arquivo: `middleware.ts`
- Funcao:
  - redireciona navegacao sem sessao para `/login`
  - aplica RBAC para paginas web
- Limitacao importante:
  - `/api/*` fica fora do middleware
  - a seguranca de API depende totalmente de cada handler

## Billing

### Concluido / operacional

- Payment Links com persistencia e sync para provider
- Checkout publico com redirecionamento para checkout hospedado quando `provider_url` existe
- Ledger interno
- Fluxo de transacoes e auditoria

### Parcial / sob contrato externo

- Pagamento avulso PIX/cartao
- Split externo
- Assinaturas completas no provider
- Repasses completos no provider
- Antecipacao completa no provider
- Conciliacao 100% automatica

## Painel administrativo

### Paginas

- `/admin/painel`
- `/admin/aprovacao-kyc`
- `/admin/auditoria`
- `/admin/conciliacao`
- `/admin/eventos`
- `/admin/provedor-financeiro`
- `/admin/anticipation`

### Cobertura

- Backoffice operacional amplo
- Ainda depende do provider em modulos financeiros especificos
- Nao esta centralizado apenas em `/api/admin/*`; boa parte das APIs administrativas esta em dominios proprios

## TODOs esquecidos e pendencias explicitas

### TODO encontrado

- Documento `MYGATEWAY-INTEGRATION-STATUS.md` ainda registra itens pendentes no provider:
  - `listPayouts()`
  - `submitKyc()`
  - `listTransactions()`
  - `listAnticipations()`

### Pendencias explicitas no codigo

- Endpoints e fluxos que retornam `501` em cenarios ainda nao homologados
- Webhook outbound sem implementacao
- Contratos MyGateway adicionais ainda dependem de confirmacao documental/homologacao

## Codigo morto provavel

- `services/mock-data.ts`
  - removido nesta rodada apos confirmacao de ausencia de referencias
- Pasta `backups/`
  - artefatos operacionais/diagnosticos fora do runtime
  - classificada entre `diagnostico` e `legado`, sem uso pelo app
- Arquivos `_tmp-*` remanescentes no root
  - `_tmp-login-diag.json`
  - `_tmp-login-diag-missing-users.json`
  - classificados como `diagnostico`; nao participam de build, teste ou deploy
- Risco:
  - baixo para runtime
  - medio para manutencao e ruido operacional

## Mocks ainda existentes

- Fallbacks de simulacao em telas internas
- Rotas `simulate`:
  - `/api/anticipation/simulate`
  - `/api/payouts-internal/simulate`
  - `/api/subscriptions-internal/simulate`
  - `/api/split-configs/simulate`
- Observacao:
  - `services/mock-data.ts` nao existe mais no repo; as simulacoes remanescentes sao handlers dedicados e identificados

## APIs fake / de simulacao

- As rotas `simulate` acima sao deliberadamente fake para pre-visualizacao
- Ha trechos que retornam `501` para recursos nao disponiveis
- O provider MyGateway tambem possui stubs/placeholder para parte dos metodos ainda nao suportados por contrato efetivo

## Feature flags

- `INTERNAL_RECEIVERS_FLOW_ENABLED`
- `INTERNAL_KYC_FLOW_ENABLED`
- `RECEIVER_PROVIDER_SYNC_ENABLED`
- `MYGATEWAY_KYC_ENABLED`
- `MYGATEWAY_PAYMENT_LINKS_ENABLED`
- `SPLIT_PROVIDER_ENABLED`
- `SUBSCRIPTIONS_PROVIDER_ENABLED`
- `PAYOUT_PROVIDER_ENABLED`
- `ANTICIPATION_PROVIDER_ENABLED`

### Leitura

- Flags internas habilitam fluxos locais mesmo sem provider
- Flags do provider controlam rollout modulo a modulo
- A estrategia atual e correta para deploy incremental, mas aumenta o numero de caminhos transicionais

## Confirmacao do PSP

- MyGateway e o unico PSP integrado de fato
- Evidencias:
  - `lib/acquirer/index.ts` sempre instancia `MygProvider`
  - nao ha SDKs nem adapters ativos de outros PSPs
  - referencias a outros nomes aparecem apenas em documentacao ou benchmark UX

## Principais riscos tecnicos

1. Seguranca de API depende do handler, nao do middleware
2. Mocks/simulacoes coexistem com fluxos reais e exigem cuidado operacional
3. Ha compatibilidade legada em conciliacao e outros modulos, o que aumenta complexidade
4. Parte dos dominios financeiros ainda depende de contrato externo real, apesar da base interna estar pronta
5. Ainda existem artefatos/documentos legados e alguns fallbacks silenciosos em leituras/simulacoes que precisam monitoramento continuo

## Conclusao

- A arquitetura atual esta madura para continuar evolucao modular sem refatoracao estrutural ampla
- A base interna do produto esta forte em auth, RBAC, dashboard, ledger, auditoria, recebedores e configuracoes
- O eixo que ainda define o roadmap tecnico e a profundidade da integracao MyGateway alem de Auth v2 + Payment Links, especialmente split, payouts e assinaturas externas
- Hoje o projeto esta em um estado hibrido:
  - produto interno bastante concluido
  - camadas de simulacao ainda presentes
  - integracao financeira externa avancando por modulos e feature flags
