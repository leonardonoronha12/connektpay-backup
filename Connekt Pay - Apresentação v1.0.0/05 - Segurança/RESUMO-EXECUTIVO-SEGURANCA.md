# Resumo Executivo — Segurança (v1.0.0)

Este resumo traduz as garantias de segurança do Connekt Pay para uma leitura executiva.

Referências:
- [PRODUCTION-SECURITY.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-SECURITY.md)
- [PRODUCTION-AUDIT.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-AUDIT.md)

## Como a plataforma protege dados

### 1) Isolamento por organização (RLS)

- O banco (Supabase Postgres) opera com Row Level Security (RLS) para garantir que usuários acessem somente dados da sua organização.
- As policies usam o contexto do usuário autenticado e filtram por `organization_id`.
- Há reforço com `FORCE ROW LEVEL SECURITY` em tabelas sensíveis (defesa em profundidade).

### 2) Service Role (apenas backend)

- O `SUPABASE_SERVICE_ROLE_KEY` existe somente no backend e é usado quando necessário (operações administrativas, uploads controlados etc.).
- Segredos nunca devem ser expostos em `NEXT_PUBLIC_*`.

### 3) Proteção de rotas (UI + API)

- UI: rotas protegidas exigem sessão e seguem RBAC (papéis como admin/financeiro).
- API interna (`/api/*`): proteção por endpoint via sessão e checagem de papel.
- API pública (`/api/public/*`): exige API key por organização e aplica rate limiting.

### 4) Webhooks

- Endpoint `/api/webhooks` exige assinatura com `MYGATEWAY_WEBHOOK_SECRET`.
- Em produção, o comportamento recomendado é fail-closed (não aceita webhook sem secret configurado).
- Eventos são persistidos e podem ser reprocessados para reduzir risco operacional.

### 5) Rate limiting

- Endpoints públicos aplicam rate limit por organização + hash da API key.
- Protege contra abuso e reduz risco de exploração por volume.

### 6) Auditoria

- Operações críticas escrevem em `audit_logs` com origem (`internal_api`/`public_api`).
- O objetivo é rastreabilidade e governança: “quem fez, quando, de onde e o quê”.

