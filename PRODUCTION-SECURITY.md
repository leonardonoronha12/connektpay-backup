# Segurança de Produção — Connekt Pay

Data: 2026-06-23

Este documento consolida as garantias de segurança do produto para deploy em produção (Vercel + Supabase), com foco em: segredos, isolamento por organização (RLS), rotas públicas, webhooks e exposição de dados.

## 1) Segredos e variáveis de ambiente

### Públicos (frontend)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Privados (apenas backend)

- `SUPABASE_SERVICE_ROLE_KEY`
- `MYGATEWAY_BASE_URL`
- `MYGATEWAY_X_API_KEY` (ou `MYGATEWAY_API_KEY`)
- `MYGATEWAY_AUTH_DATA` (ou `MYGATEWAY_CLIENT_ID` + `MYGATEWAY_CLIENT_SECRET`)
- `MYGATEWAY_WEBHOOK_SECRET`
- `CRON_SECRET` (ou `EVENTS_PROCESS_SECRET`)
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SENDGRID_FROM_NAME`

Checklist:
- Nunca usar `NEXT_PUBLIC_*` para segredos.
- Operações com service role devem rodar apenas em rotas server-side (`server-only`).

## 2) Isolamento por organização (Supabase RLS)

- RLS ativo em tabelas sensíveis do schema `public`.
- `FORCE ROW LEVEL SECURITY` habilitado nas tabelas sensíveis (defesa em profundidade).
- Policies usam `organization_id in (select * from public.current_organization_ids())`.

Observação:
- `service_role` (bypass RLS) é usado apenas no backend quando necessário.

## 3) Proteção de rotas

### Telas (UI)

- Rotas protegidas exigem sessão via `middleware.ts`.
- RBAC no middleware:
  - `/admin/*` restrito a `owner/admin/super_admin`
  - `/ledger`, `/antecipacao`, `/repasses` restrito a `owner/admin/financeiro/super_admin`

### API interna (/api/*)

- Proteção por endpoint usando `requireSessionOrgContext()`/`requireOrgContext()` e checks de role.
- Erros retornam mensagens amigáveis (sem stacktrace).

### API pública (/api/public/*)

- Exige API Key (`getOrgFromApiKey`).
- Rate limit por organização + hash da API key (`checkPublicRateLimit`).

## 4) Webhooks

- `POST /api/webhooks` exige assinatura quando `MYGATEWAY_WEBHOOK_SECRET` está configurado.
- Em produção, o padrão é fail-closed quando o segredo está ausente.
- Eventos são persistidos e reprocessados com backoff.

## 5) Exposição de dados do provedor

- `provider_payload` pode ser armazenado no banco para auditoria/debug, mas não deve ser enviado ao frontend.
- Conciliação salva `payload` sanitizado em `pay_conciliation_items.payload` via `sanitizeProviderPayload`.
- Endpoints de consulta retornam somente campos necessários para UI (sem chaves/segredos).

## 5.1) KYC (Storage)

- Documentos de KYC são enviados via backend (service role) e registrados em `kyc_documents`.
- Acesso operacional é feito por URLs assinadas (curta duração) geradas no backend.
- O bucket `kyc-documents` não é público.

## 5.2) E-mails transacionais

- Envio é best-effort: falhas não devem quebrar fluxos críticos.
- Todo envio (ou skip) registra `email_logs` para auditoria operacional.

## 6) Auditoria

- Operações financeiras críticas geram `audit_logs` (origem `internal_api`/`public_api`).
- `audit_logs` é imutável (sem update/delete para `authenticated`).

## 7) Checklist final antes do go-live

- [ ] `MYGATEWAY_WEBHOOK_SECRET` configurado e webhook validado com evento real
- [ ] `SUPABASE_SERVICE_ROLE_KEY` apenas no backend (Vercel env)
- [ ] `CRON_SECRET` configurado (se usar reprocessamento automático) e endpoint validado
- [ ] Revisar que rotas públicas têm rate limit e não expõem payload sensível
- [ ] Monitorar logs de runtime (Vercel + Supabase) após primeiro uso real

