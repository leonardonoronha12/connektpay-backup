# RBAC — Mapa do Estado Atual

Data: 2026-06-27  
Projeto: ConnektPay (Next.js App Router + Supabase)

## 1) Visão geral (como o RBAC funciona hoje)

- **Fonte de regras de acesso (UI/rotas)**: [rbac.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac.ts) define `AppRole` e a matriz de acesso por path (`PAGE_RULES`). O [middleware](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) consulta essas regras via `canAccessPath(role, pathname)`.
- **Fonte de regras de acesso (APIs internas)**: a maior parte das rotas em `app/api/**` usa [requireSessionOrgContext](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/session-org-context.ts) + `assertRole(allowed)` dentro do handler e devolve 401/403 via `classifyInternalApiError`.
- **Proteção de páginas**:
  - Parte das páginas em `app/(app)` aplica `requirePageAccess(allowed)` no server-side ([rbac-server.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac-server.ts)).
  - Algumas páginas ainda não aplicam esse guard e dependem só do middleware e/ou do layout autenticado.
- **Menus/Sidebar**: [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx) filtra itens por `roles` (client-side) a partir do `role` obtido do `/api/me`, com fallback (dev cookie e metadata).
- **Importante**: o middleware **não protege** rotas `'/api/*'` (todas entram como “públicas” em `isPublicPath`), então a proteção das APIs depende 100% de validação no servidor dentro dos route handlers.

## 2) Onde as roles são definidas (escritas)

### 2.1 Banco (profiles.role)

- A role existe no registro do usuário em `profiles.role` (consultada em vários pontos):
  - [auth-context.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/auth-context.ts) seleciona `profiles.role` junto do perfil.
  - [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) consulta `profiles.role` no edge.

Evidência de escrita explícita:
- Script operacional: [create-qa-users-prod.mjs](file:///c:/Users/Leonardo/Desktop/ConnektPay/scripts/create-qa-users-prod.mjs) faz `upsert/update` em `profiles.role` para `owner/admin/financeiro`.

### 2.2 Supabase Auth metadata (user_metadata / app_metadata)

- Em vários lugares existe fallback para role em:
  - `user.user_metadata.role`
  - `user.app_metadata.role`

Evidência de escrita explícita:
- Script operacional: [create-qa-users-prod.mjs](file:///c:/Users/Leonardo/Desktop/ConnektPay/scripts/create-qa-users-prod.mjs) atualiza `user_metadata.role` via Admin API (`updateUserById`).
- Cadastro no frontend: [auth.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/services/auth.ts) passa `options.data.role` no `supabase.auth.signUp(...)` quando fornecido.

### 2.3 Override de desenvolvimento (cookie cp_dev_role)

- Cookie `cp_dev_role` pode “forçar” uma role **apenas em development**:
  - [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) lê `?as=<role>` e seta `cp_dev_role`.
  - [rbac-server.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac-server.ts) aplica esse cookie como override server-side.
  - [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx) também considera esse cookie no client.

## 3) Onde as roles são lidas (interpretação de role atual)

### 3.1 Normalização central

- `normalizeRole(role)` define a canonicalização e o conjunto permitido de roles: [rbac.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac.ts)
- Roles reconhecidas hoje:
  - `owner`, `admin`, `financeiro`, `operacional`, `super_admin`

### 3.2 Leitura no middleware (gate de páginas)

- [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) define `role` nesta ordem:
  1) `cp_dev_role` (dev)
  2) `profiles.role`
  3) `user_metadata.role` / `app_metadata.role`

### 3.3 Leitura no server-side das páginas

- [requirePageAccess](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac-server.ts) usa `getAuthedProfile()` e resolve role por:
  1) `cp_dev_role` (dev)
  2) `profiles.role`
  3) `user_metadata.role` / `app_metadata.role`

### 3.4 Leitura no client (Sidebar)

- [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx) resolve role por:
  1) `GET /api/me` (campo `me.role`)
  2) `cp_dev_role` (dev)
  3) `session.user.app_metadata.role` / `session.user.user_metadata.role` (hook [useSession](file:///c:/Users/Leonardo/Desktop/ConnektPay/hooks/useSession.ts))

### 3.5 Leitura no backend para APIs (org + role)

- [requireSessionOrgContext](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/session-org-context.ts):
  - exige sessão (`getAuthedProfile()`)
  - exige role válida (`normalizeRole(...)`), senão `Forbidden`
  - retorna `{ organizationId, actorProfileId, role }`

## 4) Onde o middleware aplica permissões (UI)

- O middleware só roda para paths não-públicos (`isPublicPath`).
- `isPublicPath` trata como público:
  - `/_next`, assets, `/docs`, `/api/*`, `/auth/callback`, `/login`, `/register`, `/reset-password`, `/checkout`
- Para páginas “logadas”:
  - se não há usuário: redireciona para `/login?returnTo=<pathname>`
  - se há usuário mas `canAccessPath(role, pathname)` falha: redireciona para `/dashboard`

Regra de decisão:
- [rbac.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac.ts):
  - `allowedRolesForPath(pathname)` usa `PAGE_RULES` por `exact` e `prefix`
  - se o path **não está** em `PAGE_RULES`, `canAccessPath(...)` permite somente `owner` ou `super_admin`

## 5) Onde a sidebar filtra menus (UI)

- [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx)
  - `NAV_GROUPS` define itens, e alguns itens têm `roles: [...]`
  - renderização filtra:
    - item sem `roles` aparece para todos
    - item com `roles` aparece apenas se `role` do usuário existir e estiver no allowlist
  - grupos vazios não aparecem

Observação:
- A sidebar é uma proteção de UX/navegação, mas não substitui RBAC server-side (APIs e páginas).

## 6) Quais APIs usam requireRole/requireSession (validação server-side)

### 6.1 Padrão “Sessão + Role” (requireSessionOrgContext + assertRole)

Arquivos em `app/api/**` que usam `requireSessionOrgContext()` e/ou `assertRole(...)` (amostra consolidada por módulo):

- **Antecipação (usuário)**:
  - [anticipation/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/anticipation/route.ts)
  - [anticipation/simulate/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/anticipation/simulate/route.ts)
  - [anticipation/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/anticipation/%5Bid%5D/route.ts)
  - [anticipation/[id]/cancel/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/anticipation/%5Bid%5D/cancel/route.ts)
  - [anticipations/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/anticipations/route.ts)
- **Repasses (payouts)**:
  - [payouts/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payouts/route.ts)
  - [payouts/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payouts/%5Bid%5D/route.ts)
- **Ledger**:
  - [ledger/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/ledger/route.ts)
- **Integrações**:
  - [integrations/api-keys/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/integrations/api-keys/route.ts)
  - [integrations/api-keys/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/integrations/api-keys/%5Bid%5D/route.ts)
  - [integrations/tokens/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/integrations/tokens/route.ts)
  - [integrations/tokens/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/integrations/tokens/%5Bid%5D/route.ts)
- **KYC (admin)**:
  - [kyc-requests/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/kyc-requests/route.ts)
  - [kyc-requests/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/kyc-requests/%5Bid%5D/route.ts)
  - [kyc-requests/[id]/documents/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/kyc-requests/%5Bid%5D/documents/route.ts)
  - [kyc/upload/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/kyc/upload/route.ts)
- **Recebedores**:
  - [receivers/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/route.ts)
  - [receivers/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/%5Bid%5D/route.ts)
- **Links de pagamento**:
  - [payment-links/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payment-links/route.ts)
- **Assinaturas/Planos**:
  - [subscriptions/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/subscriptions/route.ts)
  - [subscriptions/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/subscriptions/%5Bid%5D/route.ts)
  - [subscriptions/[id]/cancel/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/subscriptions/%5Bid%5D/cancel/route.ts)
  - [plans/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/plans/route.ts)
  - [plans/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/plans/%5Bid%5D/route.ts)
- **Auditoria / Eventos / Conciliação**:
  - [audit-logs/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/audit-logs/route.ts)
  - [events/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/events/route.ts)
  - [events/[id]/reprocess/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/events/%5Bid%5D/reprocess/route.ts)
  - [events/process-pending/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/events/process-pending/route.ts)
  - [conciliation/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/conciliation/route.ts)
  - [reconciliation/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/reconciliation/route.ts)
  - [reconciliation/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/reconciliation/%5Bid%5D/route.ts)
  - [reconciliation/[id]/items/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/reconciliation/%5Bid%5D/items/route.ts)
  - [reconciliation/items/[itemId]/resolve/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/reconciliation/items/%5BitemId%5D/resolve/route.ts)
  - [reconciliation/items/[itemId]/reprocess/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/reconciliation/items/%5BitemId%5D/reprocess/route.ts)
- **Split rules**:
  - [split-rules/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/split-rules/route.ts) (GET usa `requireOrgContext`, POST usa `requireSessionOrgContext` + `assertRole`)
  - [split-rules/[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/split-rules/%5Bid%5D/route.ts)
- **Org/config do provider**:
  - [organization/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/organization/route.ts)
  - [provider-settings/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/provider-settings/route.ts)

### 6.2 Padrão “Org apenas” (requireOrgContext) — potencial lacuna de RBAC

Rotas que usam [requireOrgContext](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/org-context.ts) (sessão OU API key), sem enforcement explícito de role por perfil:

- [dashboard/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/dashboard/route.ts)
- [transactions/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/transactions/route.ts)
- [payments/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payments/route.ts)
- [customers/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/customers/route.ts)
- [split-rules/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/split-rules/route.ts) (apenas no GET)

## 7) Quais telas não têm proteção (server-side guard)

Páginas em `app/(app)` (rotas “logadas”) que **não** chamam `requirePageAccess(...)` no server-side:

- [dashboard/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/dashboard/page.tsx)
- [transacoes/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/transacoes/page.tsx)
- [assinaturas/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/assinaturas/page.tsx)
- [subscriptions/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/subscriptions/page.tsx)

Observação:
- Essas telas ainda ficam “por trás” do middleware (ou seja, não são públicas), mas não têm um guard explícito server-side no componente da página.

## 8) Problemas encontrados (estado atual)

- O sistema reconhece mais roles do que o escopo atual de QA (inclui `operacional` e `super_admin`): [rbac.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac.ts).
- Middleware não protege `/api/*`, então qualquer falha de RBAC nas APIs vira acesso indevido; a proteção precisa ser consistente em `app/api/**`.
- Existem rotas internas relevantes que usam `requireOrgContext` sem `assertRole` (dashboard/transactions/payments/customers e o GET de split-rules), o que hoje significa “membro da org” (ou API key) sem gate por perfil.
- Há telas logadas sem guard server-side explícito (4 páginas listadas acima); se as regras do middleware mudarem, essas telas não têm uma segunda barreira.
- A role pode vir de múltiplas fontes (profiles.role vs user_metadata/app_metadata); se houver divergência ou `profiles.role` nulo, os componentes podem apresentar comportamento diferente dependendo da ordem de fallback.

## 9) Arquivos que provavelmente precisam ser alterados (na etapa de correção)

Sem alterar nada agora, os pontos de alteração mais prováveis para “fechar” o RBAC por perfil são:

- **Definição de regras / matriz central**
  - [rbac.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac.ts) (ajuste de PAGE_RULES e/ou definição de perfis suportados)
- **Proteção de páginas (server-side)**
  - [rbac-server.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac-server.ts)
  - Páginas sem guard: [dashboard/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/dashboard/page.tsx), [transacoes/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/transacoes/page.tsx), [assinaturas/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/assinaturas/page.tsx), [subscriptions/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/subscriptions/page.tsx)
- **Proteção de APIs**
  - [org-context.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/org-context.ts) (se decidir endurecer para “sessão + role” nas APIs internas)
  - APIs com `requireOrgContext` sem role gate: [dashboard/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/dashboard/route.ts), [transactions/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/transactions/route.ts), [payments/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payments/route.ts), [customers/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/customers/route.ts), [split-rules/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/split-rules/route.ts)
- **Sidebar**
  - [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx) (alinhar itens/roles com a matriz final)
- **Origem de role (cadastro/onboarding)**
  - [auth.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/services/auth.ts) (como/quando `role` é enviada no cadastro)
  - Fluxos de criação/garantia de profile: [auth-context.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/auth-context.ts) (onde o app depende de `profiles.role` existir)

## 10) Ordem sugerida de correção (etapas pequenas)

1) **Definir fonte única de role (perfil) e garantir consistência**: decidir se `profiles.role` é obrigatório e sempre sincronizado com `user_metadata.role`.
2) **Fechar RBAC nas APIs internas que hoje usam `requireOrgContext`**: introduzir `requireSessionOrgContext + assertRole` onde fizer sentido e manter rotas públicas realmente públicas apenas em `/api/public/**`.
3) **Adicionar guard server-side nas páginas que ainda não chamam `requirePageAccess`**: reduzir dependência exclusiva do middleware.
4) **Consolidar matriz de acesso em um único lugar**: garantir que Sidebar e `PAGE_RULES` estejam alinhados (mesma semântica e mesmos perfis).
5) **Só depois**: automatizar validações completas (matriz de telas + APIs + menus) e travar regressões.

