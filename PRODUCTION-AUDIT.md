# Auditoria Final de Produção — Connekt Pay

Data: 2026-06-23  
Ambiente auditado: https://connektpay.vercel.app  
Escopo: rotas do PRD (UI + API), autenticação, proteção de telas, RLS/policies do Supabase, exposição de variáveis, proteções por rota, build/Vercel, headers e trilha de auditoria.

Documentos complementares:
- Segurança: [PRODUCTION-SECURITY.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/PRODUCTION-SECURITY.md)
- MyGateway: [MYGATEWAY-INTEGRATION-STATUS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/MYGATEWAY-INTEGRATION-STATUS.md)
- Migrations: [SUPABASE-MIGRATIONS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/SUPABASE-MIGRATIONS.md)

## Resumo Executivo

- Status geral: **Pronto para homologação com cliente**, com pendências pontuais de auditoria (logs) e padronização de respostas de autenticação.
- Segurança de dados (Supabase): **RLS ativo em todas as tabelas do schema `public`**; políticas existentes para as tabelas sensíveis; tabela interna de rate-limit bloqueada por privilégios.
- Segurança de app (Next/Vercel): **telas protegidas exigem autenticação**, headers de segurança ativos, endpoints públicos com **API Key + rate limit**, webhook com **assinatura obrigatória**.
- Split: **implementado e persistido** (tabelas `pay_taxa_config`, `pay_transacao`, `pay_split`, `pay_ledger`), com cálculo em centavos (sem float) e ledger atualizado após `payment.paid`.
- Recorrência: **implementada** (tabelas `pay_plano`, `pay_pagador`, `pay_assinatura`, `pay_subscription_events`), com tokenização de cartão no backend e processamento de webhooks para cobranças recorrentes.
- Antecipação: **implementada** (tabelas `pay_antecipacao`, `pay_antecipacao_events`), com simulação em bps e execução via webhook gerando lançamentos de ledger idempotentes.
- KYC: **implementado** (tabelas `receivers` + `kyc_requests` + `kyc_documents`), com upload de documentos em Supabase Storage e trilha de decisão (admin).
- Repasses: **implementado** (tabelas `payouts` + `payout_events`), com timeline/status e lançamentos idempotentes no ledger no `paid`.
- Notificações: **implementadas** (tabela `email_logs`), com envio best-effort e fallback sem quebrar fluxos.
- Conciliação: **implementada** (tabelas `pay_conciliation_runs`, `pay_conciliation_items`, `pay_conciliation_events`), comparando status/valores internos vs provider via `AcquirerProvider`, com payload sanitizado.

## 1) Rotas do PRD em produção

### UI (telas)

- **OK (verificado por smoke test sem sessão)**: rotas protegidas redirecionam para `/login` (HTTP 307), ex.:
  - `GET /dashboard` → `/login?returnTo=%2Fdashboard`
  - `GET /admin/painel` → `/login?returnTo=%2Fadmin%2Fpainel`
- **OK (rotas públicas)**: `GET /login` responde 200.

Observação: sem credenciais de um usuário real, não é possível validar no ambiente de produção o fluxo completo (carregamento de dados, CRUD e ações) em cada tela. O que foi validado aqui é:
- rota existe;
- proteção/redirect funciona;
- API responde com erros esperados quando sem sessão/credenciais.

### API (endpoints)

- **OK (inventário existe)**: endpoints listados no build e no diretório [app/api](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api) estão presentes.
- **OK (erro esperado sem sessão)**: endpoints internos que dependem de sessão respondem erro quando chamados sem cookies de autenticação.

## 2) Login, cadastro, sessão e logout

### Implementação

- Login/cadastro/logout usam `@supabase/supabase-js` via [auth.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/services/auth.ts) e cliente browser [supabase.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/supabase.ts).
- Proteção de sessão em páginas é feita no [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) via `@supabase/ssr` (`supabase.auth.getUser()`).

### Smoke test em produção (sem usuário)

- **OK**: páginas protegidas redirecionam para login (e preservam `returnTo`).

### Ponto de atenção

- Padronização aplicada: ausência de sessão agora retorna **401** de forma consistente (inclui mapeamento de `"Auth session missing!"`).

## 3) Telas protegidas exigem autenticação

- **OK**: o [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) bloqueia tudo que não está em allowlist (ex.: `/login`, `/register`, `/reset-password`, `/checkout`, assets).
- **OK**: além de autenticação, há controle de acesso por papel (RBAC) no middleware:
  - `/admin/*` só para `owner/admin/super_admin` (com exceções específicas).
  - `/ledger`, `/antecipacao`, `/repasses` só para `owner/admin/financeiro/super_admin`.

Risco residual: rotas `/api/*` são explicitamente tratadas como “públicas” no middleware (não passam pelo redirect). Portanto, **a proteção é por endpoint** (correto, mas precisa estar consistente em todos).

## 4) RLS do Supabase ativo em tabelas sensíveis

### RLS

- **OK**: RLS ativo para todas as tabelas no schema `public` (inclui `profiles`, `organizations`, `transactions`, `payouts`, `subscriptions`, `ledger_entries`, `webhook_events`, etc.).
- **OK (caso especial)**: `api_rate_limits` está com RLS ativo e sem policies (0) porque o acesso é feito via RPC `security definer` e privilégios revogados (tabela “interna”).

### Policies

- **OK**: há policies em todas as tabelas relevantes (ex.: `profiles`/`organizations` têm múltiplas policies).

### Ponto de atenção (hardening adicional)

- Hardening aplicado: `FORCE ROW LEVEL SECURITY` habilitado nas tabelas sensíveis (sem quebrar `service_role`/`bypassrls`).

## 5) Variáveis sensíveis expostas no frontend

- **OK**: não há uso de `SUPABASE_SERVICE_ROLE_KEY`, `MYGATEWAY_API_KEY`, `MYGATEWAY_WEBHOOK_SECRET`, `CRON_SECRET`, `EVENTS_PROCESS_SECRET` em módulos client.
- **OK**: `SUPABASE_SERVICE_ROLE_KEY` só aparece em módulos `server-only` (ex.: [supabase-admin.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/supabase-admin.ts)).
- **OK**: apenas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` são públicos (esperado no modelo Supabase).

## 6) Proteções nas rotas de API (auth / API key / rate limit / assinatura)

### Padrões implementados

- **Sessão (cookies Supabase SSR)**: rotas internas usam `requireSessionOrgContext()`/`getAuthedProfile()` e `getSupabaseServerClient()`.
- **API Key (público)**: rotas em `/api/public/*` usam `getOrgFromApiKey()` e exigem `x-organization-id` + `x-api-key` (ou `Authorization: Bearer ...`).
- **Rate limit (público)**: rotas públicas usam `checkPublicRateLimit()` (RPC `rate_limit_check`) por org + hash da API key.
- **Webhook signature**: `/api/webhooks` exige assinatura quando `MYGATEWAY_WEBHOOK_SECRET` está configurado e, em produção, falha fechado se o segredo estiver ausente.
- **Cron secret**: `/api/events/process-pending` exige segredo em produção (fail-closed); aceita querystring apenas fora de produção.

### Smoke test em produção

- **OK**: sem credenciais MyGateway, `/api/payments` e `/api/subscriptions` retornam 501 `"MyGateway not configured"` (não quebra app).
- **OK**: `/api/webhooks` sem assinatura retorna 401 `"Missing signature"`.

### Ponto de atenção

- Várias rotas internas retornam **400** quando a sessão está ausente (mensagem do Supabase), em vez de **401**.

## 7) Build na Vercel sem warnings críticos

- **OK**: `next build` local conclui sem erros e sem warnings de types/lint.
- **OK**: deploy em produção concluiu com sucesso (Vercel “Ready”).

Limitação: warnings específicos de runtime em produção (ex.: logs do Vercel) não foram inspecionados aqui com profundidade; recomenda-se verificar “Runtime Logs” e “Functions Logs” após uso real.

## 8) Headers de segurança ativos

Verificado em `HEAD /login` (produção):

- **OK**: `X-Frame-Options: DENY`
- **OK**: `X-Content-Type-Options: nosniff`
- **OK**: `Referrer-Policy: strict-origin-when-cross-origin`
- **OK**: `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **OK**: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

Configuração: [next.config.mjs](file:///c:/Users/Leonardo/Desktop/ConnektPay/next.config.mjs)

## 9) App não quebra sem credenciais da MyGateway

- **OK**: endpoints dependentes retornam 501 com mensagem clara (`MyGateway not configured`), e não 500.
- **OK**: telas protegidas continuam funcionando (login/dashboard) independentemente de MyGateway.

Risco residual: em telas que tentem efetuar operações “reais” (pagamentos/assinaturas/repasses) sem credenciais, a UX depende do tratamento do erro no frontend. Recomenda-se garantir mensagens de erro amigáveis em todas as ações.

## 10) Ações sensíveis geram audit_logs

### OK (já auditado via `insertAuditLog`)

- Provider settings (update)
- Organization (update)
- Receivers (create)
- KYC documents (upload)
- Payouts (create/update)
- Anticipations (create/update)
- Split rules (create/update/deactivate)
- Integrações: API Keys e Tokens (create/update/revoke)
- Algumas rotas públicas sensíveis (`/api/public/receivers`, `/api/public/payouts`) também escrevem audit log

### Ainda falta (gap)

Pendências corrigidas:

- `POST /api/payment-links`
- `POST /api/kyc-requests`
- `POST /api/conciliation`
- `POST /api/payments`
- `POST /api/public/payments`
- `POST /api/subscriptions`
- `POST /api/public/subscriptions`

Todos agora geram `audit_logs` com `origin` (`internal_api`/`public_api`) e `actor_user_id` quando aplicável.

## Riscos

- **Rotas mistas**: `POST /api/payments` e `POST /api/subscriptions` suportam cenários de checkout (sem sessão) e cenários internos (com sessão). Isso é intencional, mas exige atenção em monitoramento e rate limit na borda.
- **Observabilidade**: erros 500 retornam mensagem genérica por segurança; logs de runtime (Vercel/Supabase) precisam estar acompanhados.

## Recomendações

- Manter o padrão de erro: 401 (sem sessão), 403 (sem permissão), 400 (payload inválido), 500 (erro inesperado).
- Manter `audit_logs` como “fonte de verdade” e revisar periodicamente a cobertura em novas rotas.
- Manter `FORCE ROW LEVEL SECURITY` habilitado nas tabelas sensíveis.
- Adicionar “smoke tests” automatizados (Playwright) para:
  - redirect de telas protegidas;
  - rotas públicas com API key + rate limit;
  - webhook com assinatura inválida;
  - rotas MyGateway sem credenciais retornando 501/503 corretamente.
- Em Vercel, habilitar/ajustar proteções de borda (WAF/rate limiting) para `/api/*` se houver tráfego público alto.

## Checklist antes de enviar para cliente

- [ ] Confirmar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` corretos em Production e Preview.
- [ ] Confirmar `SUPABASE_SERVICE_ROLE_KEY` setado apenas no backend (Vercel env), nunca em `NEXT_PUBLIC_*`.
- [ ] Configurar `MYGATEWAY_WEBHOOK_SECRET` em Production e validar recebimento de webhook real.
- [ ] (Se usar cron) Confirmar `CRON_SECRET`/`EVENTS_PROCESS_SECRET` setado em Production e testar `/api/events/process-pending` com header.
- [ ] Rodar smoke tests automatizados (Playwright) conforme [SMOKE-TESTS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/SMOKE-TESTS.md).
- [ ] Rodar teste manual completo:
  - login → dashboard → logout;
  - criar payment link → efetuar pagamento (PIX e cartão) com MyGateway;
  - criar recebedor → enviar KYC → aprovar/rejeitar;
  - criar split rules → pagar com split → conferir ledger;
  - criar payout → marcar paid → conferir ledger;
  - conciliação → revisar divergências.
- [ ] Verificar `audit_logs` populando para todas as ações críticas (após aplicar os gaps).

