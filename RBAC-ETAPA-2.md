# RBAC — Etapa 2 (UI: middleware + páginas + sidebar)

Data: 2026-06-27  
Escopo desta etapa: middleware, proteção server-side das páginas, sidebar/menu.  
Fora de escopo: APIs (`app/api/**`), banco/migrations, MyGateway, regras financeiras.

## 1) Arquivos alterados

- [rbac.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac.ts)
- [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) (sem mudança de lógica nesta etapa; passa a refletir as regras novas via `canAccessPath`)
- [dashboard/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/dashboard/page.tsx)
- [transacoes/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/transacoes/page.tsx)
- [assinaturas/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/assinaturas/page.tsx)
- [subscriptions/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/subscriptions/page.tsx)
- [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx)

## 2) Regras implementadas (desejadas)

Papéis considerados nesta etapa:
- `owner` (e `super_admin` com comportamento equivalente ao owner no RBAC atual)
- `admin`
- `financeiro`

### OWNER (e super_admin)

- Acesso total às rotas internas (inclui rotas não mapeadas em `PAGE_RULES`).

### ADMIN

Pode acessar:
- Dashboard, Transações, Links de Pagamento, Recebedores
- Assinaturas + Planos (Subscriptions)
- Admin: KYC, Eventos, Antecipações (admin), Conciliação, Auditoria

Não pode acessar:
- Configurações críticas / Integrações / áreas exclusivas do owner (ex.: provider financeiro)
- Módulos financeiros “puros” (Ledger, Antecipação, Repasses)

### FINANCEIRO

Pode acessar:
- Dashboard, Transações
- Ledger, Antecipação, Repasses
- Assinaturas (Subscriptions)
- Admin: Conciliação

Não pode acessar:
- KYC, Eventos, Integrações, Configurações administrativas, áreas de owner
- Recebedores e Links de Pagamento

## 3) Rotas protegidas por role (middleware)

As regras por path são definidas em `PAGE_RULES` e aplicadas pelo middleware com `canAccessPath(role, pathname)`:
- [rbac.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/rbac.ts)
- [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts)

### Matriz de acesso (rotas UI)

**Acessíveis para ADMIN e FINANCEIRO**
- `/` e `/dashboard`
- `/transacoes`
- `/assinaturas` e `/subscriptions/*`

**Somente ADMIN (além do owner/super_admin)**
- `/links-pagamento/*`
- `/recebedores/*`
- `/admin/painel`
- `/admin/aprovacao-kyc`
- `/admin/eventos`
- `/admin/anticipation`
- `/admin/auditoria`

**Somente FINANCEIRO (além do owner/super_admin)**
- `/ledger`
- `/antecipacao`
- `/repasses`

**ADMIN e FINANCEIRO (além do owner/super_admin)**
- `/admin/conciliacao`

**Somente OWNER (e super_admin)**
- `/configuracoes/*`
- `/admin/provedor-financeiro`

### Comportamento ao acessar rota proibida diretamente

- Sem sessão: redireciona para `/login?returnTo=<pathname>` (middleware).
- Com sessão e role sem permissão: redireciona para `/dashboard` (middleware).
- Nas páginas com guard server-side (`requirePageAccess`): redireciona para `/dashboard` quando a role não está no allowlist.

## 4) Proteção server-side das páginas (requirePageAccess)

Páginas que estavam sem guard server-side (mapeadas no RBAC-MAPA-ATUAL.md) e agora passam a exigir:
- `dashboard` → `['owner','admin','financeiro','super_admin']`: [dashboard/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/dashboard/page.tsx)
- `transacoes` → `['owner','admin','financeiro','super_admin']`: [transacoes/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/transacoes/page.tsx)
- `assinaturas` → `['owner','admin','financeiro','super_admin']`: [assinaturas/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/assinaturas/page.tsx)
- `subscriptions` → `['owner','admin','financeiro','super_admin']`: [subscriptions/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/%28app%29/subscriptions/page.tsx)

Observação:
- Outras páginas já possuíam guard com allowlists compatíveis com as regras desta etapa (ex.: `links-pagamento`, `recebedores`, rotas `admin/*`, `ledger/antecipacao/repasses`, `configuracoes/*`).

## 5) Matriz de menus (Sidebar) por role

Fonte: [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx)

### OWNER / super_admin

- Dashboard
- Transações
- Links de Pagamento
- Assinaturas
- Recebedores
- Ledger
- Antecipação
- Repasses
- Painel
- Aprovação KYC
- Eventos
- Antecipações
- Conciliação
- Auditoria
- Provedor Financeiro
- Configurações
- Integrações

### ADMIN

- Dashboard
- Transações
- Links de Pagamento
- Assinaturas
- Recebedores
- Painel
- Aprovação KYC
- Eventos
- Antecipações
- Conciliação
- Auditoria

### FINANCEIRO

- Dashboard
- Transações
- Assinaturas
- Ledger
- Antecipação
- Repasses
- Conciliação

## 6) Resultado do lint/build

### Lint

- `npm run lint`: OK (sem erros ESLint)

### Build

- `npm run build`: OK
- Warnings observados no build:
  - Supabase no Edge Runtime (`process.version`) em `@supabase/supabase-js` (warning do Next).

## 7) Pendências para a Etapa 3 (APIs)

Sem alterar as APIs nesta etapa, ficam pendentes para a etapa 3:

- Consolidar RBAC nas rotas internas que usam apenas `requireOrgContext` (sessão ou API key) sem gate por role, conforme o mapa atual:
  - [dashboard/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/dashboard/route.ts)
  - [transactions/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/transactions/route.ts)
  - [payments/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payments/route.ts)
  - [customers/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/customers/route.ts)
  - GET de [split-rules/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/split-rules/route.ts)
- Decidir se o middleware deve continuar tratando `/api/*` como público (hoje sim) e garantir que todas as APIs internas tenham guard consistente.

