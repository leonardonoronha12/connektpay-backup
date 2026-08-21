# HANDOFF — Connekt Pay

> Documento oficial de entrega do projeto. Objetivo: permitir que outro desenvolvedor sênior assuma, execute, depure e continue o trabalho **sem depender do desenvolvedor anterior**.
>
> - Data do handoff: `2026-08-21`
> - Branch base de entrega: `preview-3628a49-rc` (ver também branch `handoff/final-delivery`)
> - HEAD do handoff: registrado no momento do commit final (vide relatório no fim deste documento)

---

## 1. Estado da Entrega

Projeto **não foi para produção**. A Connekt Pay decidiu encerrar o desenvolvimento neste ponto. Não existe deploy de Production com a Pagar.me, não houve go-live, não existem transações reais processadas.

O que existe:

- **Produto funcional completo em código** para RC (Release Candidate): autenticação, onboarding, backoffice, checkout, links, split, ledger, assinaturas, repasses, antecipação, KYC interno, conciliação, auditoria, admin, webhooks, eventos.
- **653 specs E2E verdes** em `test:full` (SHA `7fe74bb`, 2026-08-06).
- **41 falhas restantes no harness/test runner** (não no runtime da aplicação).
- **Integração Pagar.me implementada em código, mas NÃO HOMOLOGADA ponta-a-ponta** com Sandbox real (sem transações reais executadas e sem credenciais de produção).
- **MyGateway legado permanece no código** como rollback explícito (`FINANCIAL_PROVIDER=mygateway`). Não foi removido.
- **Não existe configuração de Production** (Production Pagar.me, Vercel Production final, smoke de Production, go-live).

Transparência é regra número um do handoff. Tudo que está pendente está listado na **Seção 17 (Pendências Conhecidas)** e **19 (Riscos Conhecidos)**.

---

## 2. Arquitetura Resumida (em 1 minuto)

```
Cliente (Browser)
   │
   ├─ Next.js App Router (RSC + Client Components)
   │   ├─ UI pública:  /login  /register  /reset-password  /checkout  /docs
   │   └─ UI privada:  /dashboard + todo o backoffice em app/(app)/
   │
   ├─ Route Handlers em app/api/*  (REST)
   │   ├─ Internos autenticados:  transactions, payments, split-rules, subscriptions,
   │   │                           receivers, kyc-requests, dashboard, org, notifications,
   │   │                           ledger, reconciliation, audit-logs, anticipation, admin
   │   ├─ Públicos tokenizados:    /api/public/*  (checkout, payment links, subscriptions,
   │   │                           receivers, payouts, transactions, ledger, customers)
   │   ├─ Auth:                    /api/auth/login, /api/auth/logout, /api/auth/callback
   │   ├─ Webhooks:                POST /api/webhooks  (Basic Auth · Pagar.me)
   │   └─ Eventos/Cron:            /api/events/* , /api/events/process-pending
   │                                (protegidos por x-cron-secret header)
   │
   └─ Camada lib/
        ├─ lib/env.ts                  → guards estritos de provider + ambiente
        ├─ lib/acquirer/*              → PagarMeProvider, MyGateway legado, interfaces
        ├─ lib/*-core.ts               → regras puras (sem side-effects)
        ├─ lib/*-service.ts            → orquestração: banco + provider + ledger
        ├─ lib/supabase-admin.ts       → service role (apenas server)
        ├─ lib/rbac-server.ts          → autorização 4 roles: owner|admin|financeiro|operacional
        ├─ lib/webhook-processor.ts    → processamento idempotente de eventos
        ├─ lib/audit-log.ts            → trilha append-only
        └─ lib/ledger-admin.ts         → movimento de carteiras (ledger duplo)
           lib/split-core.ts
           lib/subscription-core.ts
           lib/payout-core.ts
           lib/anticipation-core.ts
           lib/kyc-core.ts

Supabase  (Postgres · Auth · Storage · RLS estrito)
   ├─ 13 migrations versionadas em supabase/migrations/*
   ├─ RLS por organization_id em 100% das tabelas de domínio
   ├─ Storage: bucket de documentos KYC
   └─ Filas: events, webhook_attempts
```

---

## 3. Serviços Externos

### 3.1 Supabase

Uso: banco transacional relacional (Postgres), autenticação (GoTrue), storage de documentos KYC, políticas RLS multi-tenant.

- **URL / Anon Key / Service Role Key**: veja `.env.example`, blocos `[2] SUPABASE`.
- **Migrations**: `supabase/migrations/*.sql` — 13 arquivos. Ordem numérica.
- **Storage**: bucket `kyc` (configurar no painel).
- **RLS**: migrações `07_force_rls` e triggers nas tabelas. Nunca desligar RLS em produção.
- **Cuidado**: `SUPABASE_SERVICE_ROLE_KEY` passa por cima do RLS — usar apenas em rotas server-side qualificadas (admin, webhooks, provisionamento). Nunca alcançar o navegador.

Referências:
- [`docs/SUPABASE-MIGRATIONS.md`](./SUPABASE-MIGRATIONS.md)
- [`Connekt Pay - Apresentação v1.0.0/07 - Deploy/SUPABASE-MIGRATIONS.md`](../Connekt%20Pay%20-%20Apresentação%20v1.0.0/07%20-%20Deploy/SUPABASE-MIGRATIONS.md)

### 3.2 Vercel

Plataforma de deploy recomendada (Next.js nativo).

- Middleware, Edge functions: suporte nativo.
- Cron da Vercel: recomendado para acionar `POST /api/events/process-pending` a cada 1–5 min.
- Variáveis de ambiente: mesmo checklist de `.env.example`, em Settings → Environment Variables.
- Não existe deploy de Production finalizado neste encerramento. Existe o histórico em [`VERCEL-DEPLOY-DIAGNOSTICO.md`](../VERCEL-DEPLOY-DIAGNOSTICO.md).

Referência: [`docs/DEPLOY.md`](./DEPLOY.md)

### 3.3 Pagar.me (Provider Atual / Em Migração)

Status: **IMPLEMENTADO NO CÓDIGO · NÃO HOMOLOGADO PONTA-A-PONTA**.

- Provider padrão no `.env.example`: `FINANCIAL_PROVIDER=pagarme`.
- Core API V5. Ambientes:
  - Sandbox → `https://sdx-api.pagar.me/core/v5`
  - Production → `https://api.pagar.me/core/v5`
- Autenticação: HTTP Basic via `PAGARME_SECRET_KEY` (server-side apenas).
- Arquivos principais:
  - [`lib/acquirer/pagarme-provider.ts`](../lib/acquirer/pagarme-provider.ts) — orders, charges, pix, cartão, customers, recipients, refunds
  - [`lib/acquirer/pagarme-payment-links.ts`](../lib/acquirer/pagarme-payment-links.ts) — payment links
  - [`lib/pagarme-browser-tokenize.ts`](../lib/pagarme-browser-tokenize.ts) — tokenização client-side de cartão
  - [`lib/pagarme-recurring.ts`](../lib/pagarme-recurring.ts) — planos/assinaturas
  - [`lib/webhook-basic-auth.ts`](../lib/webhook-basic-auth.ts) — Basic Auth do webhook

Itens **implementados no código**:
- Orders / Charges (Pix + cartão)
- Tokenização client-side de cartão via `encryption_key`/App ID
- Payment links (criar, consultar, listar)
- Customers / Recipients (criar, atualizar, consultar)
- Refunds
- Webhooks recebidos com Basic Auth
- Split de recebíveis (definições internas → mapeamento para o provider)
- Receiver automático (mapeamento interno para recipient)
- KYC + sincronização (definição interna, síncrona flag `RECEIVER_PROVIDER_SYNC_ENABLED`)
- Assinaturas / recorrência (definição interna + mapeamento API Pagar.me)
- Ledger duplo interno: todo evento financeiro tem lançamento antes do provider.
- Idempotência: `idempotency_key` em chamadas relevantes.
- Isolamento Sandbox vs Production: nenhum fallback automático. guard estrito em `lib/env.ts`.

Itens **validados E2E** em ambiente local-regression com provider mockado / dados demo:
- Provider registry neutro; guard contra config faltante; `ProviderError` sanitizado
- Payment links em modo interno demo (sem credencial real do provider)
- Checkout público em modo interno demo
- Ledger, split, assinaturas, repasses, antecipação, conciliação **internos** (100% no banco)
- Auth, onboarding, dashboard, transações, receivers, KYC interno, auditoria

Itens **pendentes (não homologados)** — lista transparente:
1. **Credenciais Sandbox reais** da Pagar.me aplicadas e rota testada com transação real (Pix paga, cartão aprovado).
2. **Receiver / KYC real** via Pagar.me Sandbox (`RECEIVER_PROVIDER_SYNC_ENABLED=true`, depois homologar).
3. **Split E2E real**: provider faz split correto, ledger interno concilia com retorno do webhook.
4. **Webhook E2E real**: pagarme dispara `charge.paid`, `pix.paid`, `charge.refunded`; endpoint processa idempotentemente; atualiza transação/assinatura/ledger corretamente.
5. **Assinatura/recorrência E2E real**: ciclo real (criação, primeira cobrança, webhook, renovação).
6. **Suíte test:full verde** (41 falhas em harness → 0 falhas).
7. **Production Pagar.me**: chaves sk_live, APP ID production, webhook production configurados.
8. **Smoke de Production**: specs `test:production-smoke` passando.
9. **Go-Live**: checklist preenchido, rollback documentado.

Referências adicionais:
- [`PAGARME-MIGRATION.md`](../PAGARME-MIGRATION.md)
- [`CHECKLIST-HOMOLOGACAO.md`](../CHECKLIST-HOMOLOGACAO.md)
- [`MYGATEWAY-INTEGRATION-STATUS.md`](../MYGATEWAY-INTEGRATION-STATUS.md)
- [`Connekt Pay - Apresentação v1.0.0/06 - Integração Financeira/`](../Connekt%20Pay%20-%20Apresentação%20v1.0.0/06%20-%20Integração%20Financeira/)

### 3.4 MyGateway Legado

Status: **Implementado e configurável como rollback explícito. NÃO É O PROVIDER PADRÃO no encerramento. Não foi removido.**

Quando usar:
- Situação extrema de rollback, **explicitamente** setando `FINANCIAL_PROVIDER=mygateway`.
- Nada faz rollback sozinho. É preciso alterar a env.

Arquivos:
- [`lib/acquirer/myg-provider.ts`](../lib/acquirer/myg-provider.ts)
- [`lib/acquirer/pagarme-payment-links.ts`](../lib/acquirer/pagarme-payment-links.ts) (payment links)

Variáveis: `.env.example` bloco `[4] MYGATEWAY`.

Referências:
- [`MYGATEWAY-INTEGRATION-STATUS.md`](../MYGATEWAY-INTEGRATION-STATUS.md)
- [`MYGATEWAY-MAPA-DE-CONEXAO-FINAL.md`](../MYGATEWAY-MAPA-DE-CONEXAO-FINAL.md)
- [`ROADMAP-V1.1-MYGATEWAY.md`](../ROADMAP-V1.1-MYGATEWAY.md)

### 3.5 Outros Existentes

- **SendGrid (e-mail transacional)**: opcional (`.env`, bloco `[7]`). Nada quebra sem ele; login usa Supabase Email.
- **Vercel Cron / pg_cron / Scheduler externo**: obrigatório apenas quando quiser processamento assíncrono de eventos (`process-pending`).
- **Documentação navegável**: rotas `/docs/*` servem Markdown estático em `docs-web/*`.

---

## 4. Como Rodar Localmente

### Pré-requisitos mínimos

1. Node.js 22+ (22.20 testado)
2. npm 10+ (ou pnpm)
3. Supabase: projeto com todas as 13 migrations aplicadas
4. (Opcional) Pagar.me Sandbox: sk_test + APP ID para além do modo demo

### Passo a passo

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
copy .env.example .env.local
#   → preencha ao menos: Supabase URL, Anon Key, Service Role
#   → se quiser modo demo (padrão): FINANCIAL_PROVIDER=pagarme, PAGARME_SECRET_KEY vazio ou sk_test fake
#     (isso é o suficiente para rodar UI, módulos internos e testes de contratos)

# 3. Banco
supabase link  (se for usar Supabase CLI)
supabase db push
# Ou: aplique os 13 arquivos SQL em supabase/migrations/* manualmente na ordem.

# 4. (Opcional) Dados demo / primeiro usuário
node scripts/provision.mjs
# Ou se cadastre em http://localhost:3000/register

# 5. Servidor local
npm run dev
# → http://localhost:3000 (padrão)
# Se for rodar Playwright, o runner sube automaticamente em http://localhost:3001
```

---

## 5. Como Executar Testes

### Especificidade do Runner

Não use `npx playwright test` diretamente para suítes completas — ele não seta `BASE_URL` corretamente para todos os guards de homologação. Use sempre `scripts/run-playwright-layer.mjs` via package scripts:

```bash
npm run test:changed           # rápido, apenas specs afetados
npm run test:critical          # camada crítica
npm run test:full              # completa, 717 testes, 20min+
npm run test:homologation      # (requer credenciais reais do provider)
npm run test:production-smoke  # smoke contra URL de Production (guarda)
```

O runner:

1. Resolve `FINANCIAL_PROVIDER` e `provider_environment` SEM fallbacks.
2. Sobe Next dev na porta 3001, injeta `BASE_URL=http://localhost:3001`.
3. Roda Playwright com `--workers=1 --retries=0` em full.
4. **Valida `report.json`**: `failed==timedOut==interrupted==0` → exit 0, senão exit !=0.
5. Derruba o servidor e limpa subprocessos.

### Playwright specs avulsos (confiáveis, sem necessidade de BASE_URL externa)

```bash
npm run test:smoke
npm run test:dashboard
npm run test:split
npm run test:recurrence
npm run test:anticipation
npm run test:reconciliation
npm run test:kyc
npm run test:payouts
npm run test:notifications
npm run test:mygateway
```

### Estado REAL da suíte (última execução válida)

- SHA: `7fe74bb`
- Data: `2026-08-06`
- Comando: `npm run test:full`
- Resultado: **653 passed, 23 skipped, 41 failed** em `20m 32s`
- Exit code: `1` (correto, fail-closed do runner — report.json tinha 41 unexpected)
- Cluster das 41 falhas:
  - **~32 timeouts do harness**: `isAppLoginReady` em `tests/helpers/e2e-auth.ts:188` → deadline de readiness expira em worker serial.
  - **9 falhas do spec do runner**: `tests/run-playwright-layer.spec.ts` aninha subprocesso do próprio runner dentro do Playwright → conflito de isolamento de processo/ambiente.
- **Nenhuma falha de runtime do produto nos 653 testes verdes.**

---

## 6. Como Fazer Deploy

### Plataforma: Vercel (recomendado)

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Logar e associar projeto
vercel
vercel link

# 3. Subir envs (use .env.example como checklist; NÃO suba .env.local em lote com secrets reais acidentalmente)
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# (...) repetir para todas as variáveis.

# 4. Deploy preview
vercel

# 5. Deploy production
vercel --prod
```

### Manual (ECS / EC2 / VM / Docker)

```bash
npm install
npm run build
# Se NEXT_PUBLIC_* foram injetadas no build:
npm run start
# Colocar atrás de reverse proxy (Nginx / ALB), configurar HTTPS, apontar webhook da Pagar.me.
```

**Cron obrigatório em produção** (qualquer plataforma):
- A cada 1–5 minutos: `POST https://SEU-DOMINIO/api/events/process-pending` com header:
  ```
  x-cron-secret: <VALOR_DO_CRON_SECRET>
  ```

Referência completa: [`docs/DEPLOY.md`](./DEPLOY.md)

---

## 7. Como Funciona Sandbox

Sandbox é o padrão da Pagar.me em `.env.example`:

- `PAGARME_BASE_URL=https://sdx-api.pagar.me/core/v5`
- `PAGARME_SECRET_KEY=sk_test_...`
- `PAGARME_PAYMENT_LINKS_ENABLED=false` (segurança: só ligar após homologar Sandbox de links)

No **modo demo** (sem credenciais preenchidas), todo o sistema funciona com persistência interna pura — checkout, split, ledger, assinaturas, etc, são gravados em banco, porém não chegam a ligar para a Pagar.me. Ideal para testar UI, regras internas e fluxos.

Para **homologação Sandbox real**: preencher `PAGARME_SECRET_KEY` sk_test, `NEXT_PUBLIC_PAGARME_APP_ID`, `PAGARME_WEBHOOK_USERNAME` / `PASSWORD`, ligar `PAGARME_PAYMENT_LINKS_ENABLED=true` se quiser links externos, e configurar o webhook no painel para apontar ao seu domínio temporário.

---

## 8. Como Funciona Production

Production **não foi configurada ainda**. Checklist para o futuro:

1. Nova Supabase project de produção.
2. Migrations aplicadas na ordem.
3. Vercel Production com todas as envs (Production values: `PAGARME_BASE_URL=https://api.pagar.me/core/v5`, `PAGARME_SECRET_KEY=sk_live_...`).
4. Webhook Production na Pagar.me com Basic Auth separado.
5. Smoke de Production executado e verde.
6. 1 transação real de teste (Pix mínimo) aprovada ponta-a-ponta.
7. Rollback documentado para `FINANCIAL_PROVIDER=mygateway` em caso de problema.
8. Cron para `process-pending` configurado.

---

## 9. Banco e Migrations

Tudo em Postgres no Supabase. 13 migrações:

| # | Arquivo | Objetivo |
|---|---|---|
| 01 | `20260622000001_init.sql` | Schema inicial (auth, users, org, transactions, payment links, plans, subscriptions, receivers) |
| 02 | `…conciliation.sql` | Conciliação (reconciliation, reconciliation_items) |
| 03 | `…ledger_append.sql` | Ledger duplo (ledger_entries, pay_ledger, triggers) |
| 04 | `…rate_limit.sql` | Rate limit por IP e endpoint |
| 05 | `…webhooks_attempts.sql` | Tabela webhook_attempts + status de entrega |
| 06 | `…audit_logs_origin.sql` | Origem do ator nos audit logs |
| 07 | `…force_rls.sql` | Obriga RLS em tabelas críticas |
| 08 | `…settings_receivers.sql` | Configurações internas de receiver default por org |
| 09 | `…transactions_public_token.sql` | Token público de transação para API pública |
| 10 | `…payment_links_provider.sql` | Colunas provider + provider_environment em payment_links |
| 11 | `…split_module.sql` | Split: split_configs, split_rules, mapeamento transação |
| 12 | `…recurrence_module.sql` | Recorrência: planos, assinaturas, faturas |
| 13 | `…anticipation_module.sql` | Antecipação: pedidos, aprovação, liquidação, auditoria |

Mudanças de schema **somente via migration**. Não executar `ALTER TABLE` manualmente em produção sem migration correspondente.

---

## 10. Webhooks

- **Rota**: `POST /api/webhooks`
- **Autenticação**: HTTP Basic (`Authorization: Basic base64(user:pass)`)
  - Compara com `PAGARME_WEBHOOK_USERNAME` / `PAGARME_WEBHOOK_PASSWORD` via `lib/webhook-basic-auth.ts`.
  - Falha de credencial → **401 antes de processar corpo**.
- **Idempotência**:
  - `provider_event_id` único. Evento duplicado → 200 OK silencioso (não reprocessa).
- **Tentativas**:
  - `webhook_attempts` registra entrada/saída, código HTTP e corpo de erro sanitizado.
- **Processamento**: `lib/webhook-processor.ts` despacha para os módulos:
  - Cobrança paga / Pix paga → transação, ledger, recebedores, split, assinatura (se houver).
  - Estorno → transação, ledger, refund.
  - Assinatura renovada → fatura, próxima cobrança, status.
  - Receiver criado/KYC atualizado → sync inverso se habilitado.

Para testar o webhook localmente: use `ngrok` ou `localtunnel` para expor a porta e configurar o endpoint no painel da Pagar.me.

---

## 11. Workers / Cron

Não existem workers Node.js de longa duração. O modelo é:

1. APIs assíncronas gravam "eventos pendentes" em `events`.
2. Um scheduler externo (Vercel Cron, pg_cron, CloudWatch Scheduler, GitHub Actions cron) bate em `POST /api/events/process-pending`.
3. A rota consome a fila e despacha para módulos (webhook atrasado, split, recorrência).
4. Exige header `x-cron-secret` igual a `CRON_SECRET` ou `EVENTS_PROCESS_SECRET`.

Sem o cron, tudo que depende de processamento assíncrono envelhece na fila (webhooks já recebidos sempre foram processados inline primeiro; o cron é segurança e garantia de entrega atrasada).

---

## 12. Receiver / KYC

Dois mundos coexistem (independentes do provider externo):

### 12.1 Interno (sem provider) — SEMPRE LIGADO

- `INTERNAL_RECEIVERS_FLOW_ENABLED=true` — receivers no Supabase.
- `INTERNAL_KYC_FLOW_ENABLED=true` — upload de documentos em Storage, aprovação administrativa via `/admin/aprovacao-kyc`.
- **100% funcional e validado**. Não precisa de Pagar.me.

### 12.2 No Provider (Pagar.me recipients + KYC) — DESLIGADO POR ENQUANTO

- `RECEIVER_PROVIDER_SYNC_ENABLED=false` (padrão no `.env.example`).
- Quando for ligar: criar receiver interno → dispara `createRecipient` na Pagar.me; atualiza KYC status via webhook.
- **Não homologado ainda.** Primeiro passo: ligar em Sandbox e rodar casos de teste de `qa-admin` + `kyc`.

---

## 13. Split

- **Interno puro** (sem provider): `split_configs` + `split_rules` mapeiam transações em parcelas para receivers. Ledger reflete na hora.
- **Mapeamento para Pagar.me**: `split-configs/validate` e `split-configs/simulate` usam regras do provider.
- Pendências:
  - Split E2E real via Pagar.me (ver Seção 3.3).
  - Conciliação 3-vias: ledger interno × provider × retorno webhook.

---

## 14. Ledger

Ledger duplo: toda movimentação financeira registra entrada e saída em carteiras contábeis.

- Lançamentos ocorrem **antes** de chamar o provider — se a chamada falhar, rollback transacional mantém consistência.
- Tudo auditável por `audit_logs`.
- Consultas em `/api/ledger` (interno autenticado) e `/api/public/ledger` (público via token).

Pendências:
- Nenhuma pendência funcional no código. Apenas precisa de conciliação real E2E para validar em homologação Sandbox.

---

## 15. Assinaturas / Recorrência

- **Interno puro**: planos, assinaturas, faturas, renovações agendadas.
- **Mapeado para Pagar.me**: `lib/pagarme-recurring.ts` sincroniza planos/subscriptions quando a env estiver preenchida.
- Pendências:
  - Ciclo E2E real: criar assinatura, 1a cobrança, webhook, renovação automática próxima.

---

## 16. Principais Endpoints (Superfície da API)

Autenticação:

| Método | Rota | Descrição | Autenticação |
|---|---|---|---|
| POST | `/api/auth/login` | Login por e-mail/senha, emite cookies + sessão | Pública |
| POST | `/api/auth/logout` | Limpa sessão | Autenticado |
| GET  | `/api/me` | Perfil + org do usuário logado | Autenticado |
| POST | `/api/onboarding/ensure` | Garante organização e perfil | Autenticado |

Auth + Org + Admin:

| Método | Rota | Descrição |
|---|---|---|
| GET/PATCH | `/api/organization` | Configuração da org |
| GET/PATCH | `/api/provider-settings` | Provider ativo + ambiente |
| GET | `/api/dashboard?days=30` | KPIs consolidados |
| GET/PATCH/DELETE | `/api/integrations/api-keys`, `/api/integrations/tokens` | Integrações (RBAC admin+) |
| GET | `/api/audit-logs` | Trilha de auditoria |
| GET/POST | `/api/admin/*` | Admin: antecipação, aprovacao-kyc, auditoria, conciliação, eventos, painel, provedor-financeiro |

Financeiro (autenticado, RBAC):

| Grupo | Rotas |
|---|---|
| Transações | `/api/transactions`, `/api/payments` |
| Pagamentos públicos | `/api/public/transactions/:id`, `/api/public/payments`, `/api/public/customers`, `/api/public/payouts`, `/api/public/receivers`, `/api/public/subscriptions`, `/api/public/payment-links`, `/api/public/ledger` |
| Links de pagamento | `/api/payment-links` |
| Recebedores | `/api/receivers`, `/api/receivers/:id` |
| KYC | `/api/kyc-requests`, `/api/kyc-requests/:id/documents`, `/api/kyc-documents/:id`, `/api/kyc/upload` |
| Split | `/api/split-configs`, `/api/split-configs/:id`, `/api/split-configs/simulate`, `/api/split-configs/validate`, `/api/split-rules`, `/api/split-rules/:id` |
| Assinaturas | `/api/subscriptions`, `/api/subscriptions/:id`, `/api/subscriptions/:id/cancel`, `/api/plans`, `/api/plans/:id` |
| Assinaturas internas | `/api/subscriptions-internal/*` (planos, simulate, subscriptions) |
| Repasses | `/api/payouts`, `/api/payouts/:id`, `/api/payouts-internal`, `/api/payouts-internal/simulate`, `/api/payouts-internal/:id` |
| Antecipação | `/api/anticipation`, `/api/anticipation/simulate`, `/api/anticipation/:id`, `/api/anticipation/:id/cancel`, `/api/anticipations`, `/api/anticipations/:id` |
| Conciliação | `/api/conciliation`, `/api/reconciliation`, `/api/reconciliation/:id`, `/api/reconciliation/:id/items`, `/api/reconciliation/items/:itemId/{reprocess,resolve}` |
| Ledger | `/api/ledger` |
| Notificações | `/api/notifications` |
| Clientes | `/api/customers` |
| Eventos | `/api/events`, `/api/events/:id/reprocess`, `/api/events/process-pending` (protegido por cron-secret) |
| Webhook | `POST /api/webhooks` (Basic Auth, pública para a Pagar.me) |

Referências oficiais para inventário completo:
- [`INVENTARIO-DE-ENDPOINTS.md`](../INVENTARIO-DE-ENDPOINTS.md)
- [`docs-web/`](../docs-web/) (documentação navegável por módulo)
- Rotas `/docs/*` servem essa mesma base navegável.

---

## 17. Pendências Conhecidas

Não mascaradas. Todas as pendências abaixo são trabalho ainda não feito, em ordem de prioridade estimada para retomada futura.

### 17.1 Críticas para retomar

1. **Credenciais reais da Pagar.me (Sandbox) aplicadas e homologação ponta-a-ponta**: sem isso, toda a integração permanece em modo demo interno. Urgência máxima.
2. **Runner test:full verde** (41 → 0 falhas):
   - ~32 timeouts do harness: aumentar deadline de `isAppLoginReady` em `tests/helpers/e2e-auth.ts` ou introduzir retry curto; alternativamente habilitar `--retries=1` apenas nos QA specs.
   - 9 falhas do spec do runner aninhado: mover `tests/run-playwright-layer.spec.ts` para um executor Node.js standalone (`node --test` ou `vitest`) fora do Playwright; rodar em `project` separado sem servidor Next compartilhado.
3. **Split E2E real na Pagar.me Sandbox**: transação Pix com split de 2 receivers, ledger e conciliação batendo 100%.
4. **Webhook E2E real**: registrar endpoint público de homologação na Pagar.me; disparar `charge.paid` / `pix.paid` / `charge.refunded`; confirmar processamento idempotente.
5. **KYC / Receiver no provider**: ativar `RECEIVER_PROVIDER_SYNC_ENABLED=true` em Sandbox; rodar criação de receiver, envio docs, ciclo de aprovação/rejeição.

### 17.2 Importantes

6. **Production Pagar.me**: credenciais sk_live, APP ID production, webhook production, URL de production definida.
7. **Smoke de Production verde**.
8. **Cron para process-pending configurado** em preview/production.
9. **Envio transacional SendGrid**: template + API key para comunicações de cobrança e KYC (hoje usa Supabase Emails).

### 17.3 Menores

10. Assinatura real E2E (criação, cobrança, renovação, cancelamento).
11. Documentação de API pública estilo Stripe (estrutura `/docs/api/*` base já existe via `docs-web`).
12. Playwright multi-worker: hoje full roda em `--workers=1` por estabilidade. Validar `--workers=2` após correção do harness.
13. KYC upload: storage policies públicas/privadas finas e auditoria de download.
14. Refunds / estornos parciais fluxo administrativo.
15. Exportações em massa (CSV grandes) → fila de eventos.

---

## 18. Bugs Conhecidos

1. **Menu do usuário (Firefox Desktop + Mobile Android)**: ocasionalmente falha em regressão se o cron/schedule de login do harness demorar. Causa: timeout de readiness do harness, não regressão do menu. Ajuste: corrigir harness (item 17.1.2).
2. **`ui-modal-stay-open` em Mobile Android**: comportamento idêntico; mesma causa raiz do provisionamento lento do usuário temporário.
3. **Webpack cache corrompido**: em `.next`, primeiro build pode mostrar `[webpack.cache.PackFileCacheStrategy] unexpected end of file`. Corrige sozinho na próxima compilação; caso queira zerar: apagar `.next` e rebuildar. Não é bug de código.
4. **SyntaxError acidental em investigações**: já removido do HEAD (últimos commits). Worktree final limpa.

Outros detalhes: [`KNOWN-ISSUES.md`](../KNOWN-ISSUES.md)

---

## 19. Riscos Conhecidos

| Risco | Severidade | Mitigação / Condição |
|---|---|---|
| Nenhuma transação real Pagar.me foi executada ainda | Alta | Não colocar em produção sem homologação Sandbox ponta-a-ponta e checklist go-live preenchido. |
| `RECEIVER_PROVIDER_SYNC_ENABLED` desligado | Alta | Se ligar sem homologar, recebedores não chegam ao provider e split externo falha. |
| 41 falhas no test:full (harness) | Média | Pode mascarar regressão real em qa-* se todo mundo ignorar o vermelho. Corrigir antes de nova sprint. |
| Secrets em envs de deploy esquecidas | Alta | Usar `.env.example` como checklist em TODOS os ambientes. Nunca `scp .env.local`. |
| Cron de process-pending desligado | Média | Webhooks e eventos atrasados não são reprocessados automaticamente. Sempre configurar no deploy. |
| RLS em tabelas de domínio desligado acidentalmente | Alta | Migration `07_force_rls` e auditoria sempre antes de promover ambiente. |
| Rollback de provider demorado | Média | Documentado e preservado (`FINANCIAL_PROVIDER=mygateway`), porém requer chaves MyGateway em mãos. |
| Corrupção de cache .next | Baixa | Apenas local; remover `.next` resolve. |

---

## 20. Próximos Passos Recomendados (Prioridade Decrescente)

Se o projeto for retomado no futuro:

1. **Obter credenciais reais Sandbox da Pagar.me** (sk_test, APP ID, Basic Auth do webhook) e aplicar em preview de homologação.
2. **Corrigir harness (41 falhas)** para chegar em `test:full` 0 falhas antes de qualquer nova feature.
3. **Homologar Ponta-a-Ponta em Sandbox**:
   a. Login/onboarding/dashboard (já verde)
   b. Receiver + KYC real
   c. Split real em transação Pix
   d. Webhook real de Pix paga / cartão paga / estorno
   e. Assinatura ciclo real
4. **Configurar cron production de `process-pending`**.
5. **Smoke real em environment de homologação**: `npm run test:homologation`.
6. **Preparar Production**:
   a. Novo projeto Supabase Production, migrations, Storage bucket KYC
   b. Vercel Production com todas as envs
   c. sk_live + APP ID production + webhook production
   d. 1 transação real mínima (R$1,00) aprovada ponta-a-ponta
   e. Smoke de Production (`npm run test:production-smoke`)
   f. Preencher `GO-LIVE-CHECKLIST.md`
   g. Rollback documentado para `FINANCIAL_PROVIDER=mygateway` com chaves em mãos.
7. **Apenas após tudo isso**: novas features, refinamento de UX, APIs públicas, SDK etc.

---

## 21. Índice de Documentação de Apoio

| Documento | Caminho | Assunto |
|---|---|---|
| Deploy passo a passo | [`docs/DEPLOY.md`](./DEPLOY.md) | Deploy Vercel + Supabase |
| Migrations referência | [`docs/SUPABASE-MIGRATIONS.md`](./SUPABASE-MIGRATIONS.md) | SQL de banco, ordem |
| Inventário de funcionalidades | [`INVENTARIO-DE-FUNCIONALIDADES.md`](../INVENTARIO-DE-FUNCIONALIDADES.md) | Módulos e status |
| Inventário de endpoints | [`INVENTARIO-DE-ENDPOINTS.md`](../INVENTARIO-DE-ENDPOINTS.md) | Lista completa de rotas |
| Segurança / Production | [`docs/PRODUCTION-SECURITY.md`](./PRODUCTION-SECURITY.md) | Controles e recomendações |
| Auditoria / Production | [`docs/PRODUCTION-AUDIT.md`](./PRODUCTION-AUDIT.md) | Checklist de production audit |
| Pagar.me Migration | [`PAGARME-MIGRATION.md`](../PAGARME-MIGRATION.md) | Arquitetura multi-provider |
| MyGateway Status | [`MYGATEWAY-INTEGRATION-STATUS.md`](../MYGATEWAY-INTEGRATION-STATUS.md) | Legado e rollback |
| Checklist homologação | [`CHECKLIST-HOMOLOGACAO.md`](../CHECKLIST-HOMOLOGACAO.md) | Passos de homologação |
| Go-Live Checklist | [`GO-LIVE-CHECKLIST.md`](../GO-LIVE-CHECKLIST.md) | Pré produção |
| Relatórios executivos | [`Connekt Pay - Apresentação v1.0.0/`](../Connekt%20Pay%20-%20Apresentação%20v1.0.0/) | Pacote de entrega executiva |
| QA E2E Final | [`QA-E2E-FINAL.md`](../QA-E2E-FINAL.md) | Evidências da suíte v1.0.0 |
| Docs navegáveis (UI) | [`docs-web/README.md`](../docs-web/README.md) | Por módulo, servem em /docs |
| Release v1.0.0 | [`release/v1.0.0/README.md`](../release/v1.0.0/README.md) | Manifesto de release |
| Troubleshooting | README seção Troubleshooting | Erros comuns de setup |

---

## 22. Controles de Qualidade Aplicados no Handoff

- Typecheck executado: ver relatório final.
- Build executado: ver relatório final.
- Secrets auditados no código atual e no histórico recente: NENHUM segredo real versionado. Apenas placeholders `sk_test_123` em fixtures de teste.
- `.env` NÃO versionados. Apenas `.env.example` e `.env.deploy.example` trackeados.
- Endpoints de debug/rotas temporárias: nenhuma remanescente no HEAD.
- Nenhum console.log temporário ou comentários TODO de investigação no código de runtime (apenas TODOs documentados em arquivos de escopo de homologação).
- Worktree: limpo (exceto o untracked de `debug-p0-login-runner-summary.md` que foi removido no handoff).

---

**Fim do HANDOFF.md.**
