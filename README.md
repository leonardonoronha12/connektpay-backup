# Connekt Pay

Plataforma SaaS de pagamentos white-label da Connekt Pay. Checkout próprio, links de pagamento, Pix, cartão tokenizado, assinaturas, split, ledger duplo, repasses, antecipação, KYC interno, webhooks, auditoria completa e backoffice administrativo.

Construída com **Next.js App Router**, **Supabase** (Auth + Postgres + RLS + Storage) e integração financeira orientada a múltiplos provedores (Pagar.me em migração atual, MyGateway legado como rollback explícito).

---

## Visão Geral

- **Checkout público white-label** via slug de payment link ou pagamento standalone.
- **Provedor financeiro selecionável por variável de ambiente** (`FINANCIAL_PROVIDER=pagarme|mygateway`) sem fallback silencioso.
- **Módulos internos independentes do provider**: ledger, split, assinaturas, repasses, antecipação, conciliação, receivers e KYC administrativo.
- **Multi-tenant por organização** com RLS no Supabase e RBAC server-side (owner / admin / financeiro / operacional).
- **Webhooks processados de forma idempotente** com autenticação Basic Auth (Pagar.me) e registro de tentativas.
- **Suíte E2E com Playwright** e runner fail-closed baseado em `report.json`.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Navegador (Next.js RSC + Client)                │
│  UI pública (/login, /register, /checkout, /reset-password, /docs)   │
│  UI autenticada: dashboard, transações, links, recebedores, split,   │
│  subscriptions, ledger, antecipação, repasses, KYC, admin painel     │
└─────────────────────────────────────┬────────────────────────────────┘
                                      │ fetch / rotas /api
┌─────────────────────────────────────▼────────────────────────────────┐
│                     Next.js App Router (Node runtime)                │
│                                                                      │
│  lib/env.ts              → guards de provider e ambiente             │
│  lib/acquirer/provider.ts → AcquirerProvider (PagarMe / MyGateway)   │
│  lib/*-core.ts           → regras de negócio puras                   │
│  lib/*-service.ts        → orquestração + banco + provider           │
│  lib/supabase-admin.ts   → cliente service role (server-side only)   │
│  lib/rbac-server.ts      → autorização por role + org                │
│  lib/webhook-*.ts        → recepção, assinatura, processamento      │
│  lib/audit-log.ts        │ trilha de auditoria append-only           │
│  lib/ledger-admin.ts     ├─ movimentações de carteira                │
│  lib/kyc-core.ts         ├─ KYC interno                              │
│  lib/split-core.ts       ├─ split de recebíveis                      │
│  lib/subscription-core.ts├─ plano/assinatura interno                 │
│  lib/payout-core.ts      ├─ repasses                                 │
│  lib/anticipation-core.ts└─ antecipação interna                      │
└─────────────────────────────────────┬────────────────────────────────┘
                                      │ SQL + RLS + Storage
┌─────────────────────────────────────▼────────────────────────────────┐
│                           Supabase                                    │
│  Postgres (13 migrations) · Auth GoTrue · Storage (docs KYC)         │
│  Políticas RLS por organization_id. Row Level Security estrito.      │
│  Filas: events, webhook_attempts. Auditoria: audit_logs.             │
└──────────────────────────────────────────────────────────────────────┘
```

### Isolamento de Ambiente

O runtime decide `provider_environment` (sandbox vs production) e **não permite fallback** se `FINANCIAL_PROVIDER` estiver ausente ou inválido. Isso é garantido em `lib/env.ts`, validado por specs e reforçado pelo runner Playwright.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework Web | Next.js 15.5 (App Router, Server Components + Route Handlers) |
| UI | React 18, TypeScript, Tailwind v4, Radix UI, MUI Ícones, Lucide |
| Gráficos | Recharts |
| Auth / Banco / Storage / RLS | Supabase (Postgres, GoTrue, Storage) |
| Adquirência | Pagar.me Core API v5 · MyGateway legado |
| Testes E2E | Playwright 1.61 + runner fail-closed em Node |
| Deploy | Vercel (recomendado, compatível) |
| Qualidade | ESLint `next/core-web-vitals`, TypeScript strict implícito |

---

## Estrutura do Projeto

```
app/
  (app)/           Rotas autenticadas / backoffice administrativo
  api/             Route Handlers (REST interno + público + webhooks)
  checkout/        Checkout público white-label (slug)
  docs/            Documentação navegável embutida (Markdown)
  login|register|reset-password  Autenticação pública
components/        Componentes de UI, telas agregadas, docs shell
hooks/            Client-side useSession, useMe
lib/              Regras de negócio, integrações, clients, guards
  acquirer/       Camada de adquirência (PagarMe + MyGateway legado)
services/         Fachadas server-side para Auth/KYC/Webhooks/Pagamentos
scripts/          Runner Playwright, provisionamento, validação RBAC
tests/            Playwright E2E + helpers de harness (qa-suite, e2e-auth)
supabase/
  migrations/     SQL incremental versionado
  config.toml     Config Supabase CLI
docs/             Documentação técnica do handoff e deploy
docs-web/         Documentação navegável dos módulos do produto
release/          Manifestos de release
branding/         Logotipos e marca
Connekt Pay - Apresentação v1.0.0/  Pacote executivo + evidências
```

---

## Pré-requisitos

- Node.js 22+ (recomendado 22.20 LTS)
- npm 10+ (ou pnpm 9+; `pnpm-workspace.yaml` existe para workspace)
- Conta Supabase com projeto criado
- Conta na Pagar.me (Sandbox obrigatório, Production opcional)
  **ou** credenciais MyGateway para rollback legado.
- (Opcional) Vercel CLI para deploy.

---

## Instalação

```bash
npm install
```

Se for usar Supabase CLI local: instale o binário e rode `supabase link` com o `project-ref` do seu projeto.

---

## Variáveis de Ambiente

Copie o template e preencha **apenas os valores do seu ambiente local**:

```bash
copy .env.example .env.local
```

Todas as variáveis, separadas por categoria (Geral, Supabase, Pagar.me, MyGateway, Webhooks, E-mail), estão documentadas em [`.env.example`](./.env.example). Regras de segurança:

- `SUPABASE_SERVICE_ROLE_KEY`, `PAGARME_SECRET_KEY`, senhas, tokens de webhook e `CRON_SECRET` são **server-side APENAS**.
- Variáveis `NEXT_PUBLIC_*` podem chegar ao navegador — **nunca** incluir secrets nesse prefixo.
- `.env`, `.env.local` e `.env.*.local` estão no `.gitignore` e **nunca** devem ser commitados.

---

## Banco de Dados

A base está em Supabase com 13 migrations versionadas em [`supabase/migrations/`](./supabase/migrations). Aplicar na ordem:

```bash
# Via Supabase CLI (após supabase link)
supabase db push
```

Ou rodar cada `.sql` diretamente no SQL Editor. Ordem recomendada: `01_init` → `02_conciliation` → `03_ledger_append` → `04_rate_limit` → `05_webhooks_attempts` → `06_audit_logs_origin` → `07_force_rls` → `08_settings_receivers` → `09_transactions_public_token` → `10_payment_links_provider` → `11_split_module` → `12_recurrence_module` → `13_anticipation_module`.

### Dados Demo / Primeiro Usuário

Após as migrations: use [`scripts/provision.mjs`](./scripts/provision.mjs) para criar organização demo e usuário root, ou registre-se diretamente em `/register`.

---

## Execução Local

### 1. Servidor Next.js

```bash
npm run dev
# padrão → http://localhost:3000
```

### 2. Runner Playwright Local-Regression (recomendado para suítes)

O runner injeta `BASE_URL` correta em `http://localhost:3001`, sube e derruba o servidor automaticamente e valida fail-closed via `report.json`:

```bash
npm run test:full          # suíte completa (717 testes, 20+min)
npm run test:changed       # apenas specs afetados por diff HEAD
npm run test:critical      # camada crítica
npm run test:homologation  # suíte de homologação (requer credenciais reais)
npm run test:production-smoke # smoke em produção (guarda de URL)
```

### 3. Playwright specs por módulo (rápidos)

```bash
npm run test:smoke
npm run test:mygateway
npm run test:split
npm run test:recurrence
npm run test:anticipation
npm run test:reconciliation
npm run test:kyc
npm run test:payouts
npm run test:notifications
npm run test:dashboard
```

---

## Testes

### Runner e Fail-Closed

O script [`scripts/run-playwright-layer.mjs`](./scripts/run-playwright-layer.mjs) orquestra:

1. Resolve ambiente (`BASE_URL`, `FINANCIAL_PROVIDER`, provider_environment) sem fallbacks silenciosos.
2. Sube servidor Next dev local com porta dedicada (3001) para `local-regression`.
3. Executa Playwright (`--workers=1`, `--retries=0` em full).
4. **Valida `report.json`** ao final — não basta exit code 0 do Playwright:
   - `failed == 0 && timedOut == 0 && interrupted == 0` → exit 0.
   - Qualquer outra situação ou report ausente → exit **diferente de 0**.

### Harness QA

- [`tests/helpers/qa-suite.ts`](./tests/helpers/qa-suite.ts): sessão temporária, org temporária, asserções de ruído controlado para checkout e gates de ruído de provider (`allowCheckoutProviderNoise`, `allowCheckoutProviderInvalidCredentials401`).
- [`tests/helpers/e2e-auth.ts`](./tests/helpers/e2e-auth.ts): provisiona usuário E2E temporário e **aguarda readiness real de login** do app (`POST /api/auth/login`) antes de entregar a sessão ao teste.

### Estado atual da suíte (SHA 7fe74bb, 2026-08-06)

- **TypeScript**: sem erros de sintaxe em HEAD.
- **Build**: passa em HEAD limpo com `.next` fresco.
- **test:full**: 717 testes → **653 passed, 23 skipped, 41 failed** (20m 32s, exit 1).
- 41 falhas restantes estão **confinadas ao harness** (readiness timeout do provisionamento E2E) e ao spec do runner rodando em modo nested dentro do Playwright. **Não há regressão funcional da aplicação nos 653 testes verdes**.

Mais detalhes no [docs/HANDOFF.md](./docs/HANDOFF.md).

---

## Providers Financeiros

### Pagar.me (atual / em migração)

- **Ativo quando**: `FINANCIAL_PROVIDER=pagarme`.
- **Camada**: [`lib/acquirer/pagarme-provider.ts`](./lib/acquirer/pagarme-provider.ts) e [`lib/acquirer/pagarme-payment-links.ts`](./lib/acquirer/pagarme-payment-links.ts).
- **Autenticação**: HTTP Basic com `PAGARME_SECRET_KEY` (sk_test_ / sk_live_).
- **Tokenização client-side de cartão**: `lib/pagarme-browser-tokenize.ts` + `NEXT_PUBLIC_PAGARME_APP_ID`.
- **Webhooks**: `POST /api/webhooks` com HTTP Basic Auth (usuário/senha exclusivos do webhook, não a secret key).
- **Ambientes**:
  - Sandbox → `https://sdx-api.pagar.me/core/v5`
  - Production → `https://api.pagar.me/core/v5`

### MyGateway (legado / rollback explícito)

- **Ativo quando**: `FINANCIAL_PROVIDER=mygateway`.
- **Camada**: [`lib/acquirer/myg-provider.ts`](./lib/acquirer/myg-provider.ts).
- **Não removido**: permanece no código como rollback explícito enquanto a migração Pagar.me não estiver 100% homologada em Production.
- Autenticação por `MYGATEWAY_X_API_KEY` + payload opcional `MYGATEWAY_AUTH_DATA`.

### Isolamento Sandbox vs Production

Nenhuma troca de ambiente ocorre automaticamente. Validação em `lib/env.ts` + [`tests/env.spec.ts`](./tests/env.spec.ts) + [`tests/financial-environment-isolation.spec.ts`](./tests/financial-environment-isolation.spec.ts).

---

## Webhooks

- **Endpoint**: `POST /api/webhooks`
- **Autenticação Pagar.me**: HTTP Basic (`Authorization: Basic <base64(usuario:senha)>`). Validação em [`lib/webhook-basic-auth.ts`](./lib/webhook-basic-auth.ts).
- **Idempotência**: eventos duplicados são detectados por `provider_event_id`.
- **Tentativas**: `webhook_attempts` registra cada entrega ao webhook; `events.process-pending` reprocessa.
- **Processamento**: [`lib/webhook-processor.ts`](./lib/webhook-processor.ts) orquestra ledger, transações, assinaturas, split, receivers e status com erros sanitizados.

---

## Workers / Cron / Eventos

A aplicação não usa workers dedicados de longa duração em runtime. A operação assíncrona se baseia em rotas protegidas por segredo:

- `POST /api/events/process-pending` — consome eventos pendentes e entrega aos módulos. Deve ser chamado periodicamente por Cron Job (Vercel Cron, GitHub Actions, Supabase pg_cron etc).
- `POST /api/events/:id/reprocess` — admin reprocessa um evento único.
- Proteção: ambas exigem header `x-cron-secret` com `CRON_SECRET` ou `EVENTS_PROCESS_SECRET`.

---

## Deploy

**Plataforma recomendada**: Vercel (Next.js nativo, Edge/Middleware, Cron).

1. Conecte o repositório GitHub.
2. Configure todas as variáveis de ambiente em **Settings → Environment Variables** (usar `.env.example` como checklist).
3. Para o primeiro deploy: aplicar migrations no Supabase alvo.
4. Registrar `https://SEU-DOMINIO/api/webhooks` como webhook na Pagar.me (Basic Auth).
5. Configurar Cron para `POST /api/events/process-pending` a cada 1–5 min.

Guia completo em [`docs/DEPLOY.md`](./docs/DEPLOY.md) e [`docs/HANDOFF.md`](./docs/HANDOFF.md).

---

## Segurança

### Controles ativos

- RLS (Row Level Security) no Supabase em **100%** das tabelas de domínio, escopadas por `organization_id`.
- `SUPABASE_SERVICE_ROLE_KEY` usado apenas em rotas server-side qualificadas (admin, webhooks, provisionamento); **nunca** atinge o cliente.
- Autenticação HTTP Basic em webhooks; credenciais nunca em logs.
- `ProviderError` sanitiza payload antes de chegar ao usuário final.
- Rate limit por IP e por recurso em rotas públicas (`lib/public-rate-limit.ts`).
- Trilha de auditoria append-only em `audit_logs` (quem, o que, quando, origem).
- Guards de ambiente proíbem executar sem `FINANCIAL_PROVIDER` explícito ou com `provider_environment` incompatível.

### Auditorias existentes

- [`PRODUCTION-SECURITY.md`](./docs/PRODUCTION-SECURITY.md)
- [`PRODUCTION-AUDIT.md`](./docs/PRODUCTION-AUDIT.md)
- [`SECURITY-AUDIT.md`](./SECURITY-AUDIT.md)

### Checklist antes de colocar em produção

Consulte [`GO-LIVE-CHECKLIST.md`](./GO-LIVE-CHECKLIST.md).

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Erro `BASE_URL deve ser definida explicitamente` ao rodar spec avulso | Guarda de ambiente do spec de homologação | Use `npm run test:full` ou defina `BASE_URL=http://localhost:3001` explicitamente |
| Supabase `JWT expired` ou `invalid claims` | Sessão antiga ou clocks drift | Limpar cookies / relogar |
| Checkout retorna "provedor indisponível" (503) | `FINANCIAL_PROVIDER` ausente ou provider não tem credenciais | Verificar `.env.local` com `FINANCIAL_PROVIDER`, `PAGARME_SECRET_KEY` etc |
| Runner falha "encerrado prematuramente com código 0" em máquina lenta | Next dev demorou mais que `LOCAL_REGRESSION_SERVER_READY_TIMEOUT_MS` | Aumentar timeout em `scripts/run-playwright-layer.mjs` ou usar SSD |
| 41 falhas repetidas em qa-* no test:full | Readiness do harness E2E estoura deadline em worker serial | Aumentar deadline de `isAppLoginReady` em `tests/helpers/e2e-auth.ts` ou mover `run-playwright-layer.spec.ts` para spec Node.js standalone (fora do Playwright) |

---

## Estado Atual do Projeto

### Funcionalidades implementadas no código

Autenticação, cadastro, onboarding idempotente, dashboard, transações (filtros/busca/detalhes/export), payment links, checkout público, Pix, cartão com tokenização client-side, orders/charges internas, transação interna antes do provider, idempotência, provider + provider_environment isolados, receiver automático interno, KYC administrativo interno, split interno, ledger duplo, conciliação, assinaturas e planos internos, repasses, antecipação, auditoria, notificações, RBAC 4 papéis, webhooks com Basic Auth e idempotência, eventos assíncronos protegidos por segredo, API pública de pagamento.

### Funcionalidades validadas por testes verdes

653 specs E2E verdes na última rodada (SHA `7fe74bb`) cobrindo: dashboard core, CSV, checkout validação de campos, env contracts, hosted checkout allowlist, KYC CPF/CNPJ, receivers internos, KYC interno, feature flags Fase 2A, antecipação interna (fee, net, saldo, duplicidade, aprova/reprova/cancela, auditoria, rbac), reconciliation, ledger, splits, recorrência interna, plans, payouts internos, antecipação simulada, billing lifecycle webhook normalização, docs assets guard, integration tokens, providers guard, menu do usuário regressão Desktop Chrome, signup idempotente + dashboard 401, notifications, menu drawer mobile, payment links, QA checkout ruído controlado.

### Funcionalidades não homologadas / pendentes (transparentes)

Homologação Sandbox final da Pagar.me com dados reais de receiver / KYC, split E2E real via Pagar.me, webhook E2E real (cobrança/PIX paga/estorno) com ambiente Pagar.me, suíte test:full 100% verde (41 falhas restantes em harness e spec do runner), **Production Pagar.me não configurada**, smoke real de Production, Go Live.

---

## Pendências Conhecidas

Lista detalhada em [`docs/HANDOFF.md`](./docs/HANDOFF.md) e [`KNOWN-ISSUES.md`](./KNOWN-ISSUES.md). Resumo:

1. **Harness QA**: deadline de `isAppLoginReady` em `tests/helpers/e2e-auth.ts` causa ~32 timeouts em modo worker serial.
2. **Spec do runner**: `tests/run-playwright-layer.spec.ts` faz spawn nested do próprio runner dentro de Playwright, gerando 9 falhas de isolamento de processo.
3. **Credenciais Pagar.me**: pendentes para Sandbox real e Production; sem elas, `PAGARME_PAYMENT_LINKS_ENABLED=false` (modo demo).
4. **KYC / Receiver no provider**: `RECEIVER_PROVIDER_SYNC_ENABLED=false` no exemplo — desligado até homologação.
5. **Cron de eventos**: responsabilidade do deploy (Vercel Cron, Supabase pg_cron etc); não existe sem configuração.
6. **Envio de e-mails transacionais**: SendGrid API key opcional; desligado até configuração.

---

## Referências Rápidas

- Handoff completo para novo desenvolvedor → [`docs/HANDOFF.md`](./docs/HANDOFF.md)
- Deploy + migrations → [`docs/DEPLOY.md`](./docs/DEPLOY.md)
- Migrations Supabase → [`docs/SUPABASE-MIGRATIONS.md`](./docs/SUPABASE-MIGRATIONS.md)
- Estado MyGateway → [`MYGATEWAY-INTEGRATION-STATUS.md`](./MYGATEWAY-INTEGRATION-STATUS.md)
- Migração Pagar.me → [`PAGARME-MIGRATION.md`](./PAGARME-MIGRATION.md)
- Inventário de funcionalidades → [`INVENTARIO-DE-FUNCIONALIDADES.md`](./INVENTARIO-DE-FUNCIONALIDADES.md)
- Inventário de endpoints → [`INVENTARIO-DE-ENDPOINTS.md`](./INVENTARIO-DE-ENDPOINTS.md)
- Checklist de Go-Live → [`GO-LIVE-CHECKLIST.md`](./GO-LIVE-CHECKLIST.md)
