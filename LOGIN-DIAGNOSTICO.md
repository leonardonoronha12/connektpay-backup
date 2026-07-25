# Diagnóstico de Login — Connekt Pay v1.0.0

Data: 2026-06-24  
Atualização: 2026-06-25  
Escopo: diagnóstico + validação da correção de onboarding (Supabase/Postgres).

## Status atual (correção aplicada e validada)

- Banco alvo (Supabase Cloud): projeto `connektpay` (ref `tecnqmtzdefeacbfdyma`), conectado via `supabase db query --linked`
- Migration aplicada/validada: `supabase/migrations/20260624000015_user_onboarding.sql`
- Verificações no banco (OK):
  - `public.ensure_profile_and_org()` existe (SECURITY DEFINER)
  - Trigger `auth_users_create_profile_org` existe em `auth.users`
  - `GRANT EXECUTE` para `authenticated` existe
- Validação (OK):
  - Usuário novo confirmado passa a ter `auth.users` + `public.profiles` + `organizations` + `provider_settings` automaticamente
  - E2E `tests/signup-onboarding.spec.ts` passou (BASE_URL `http://localhost:3010`) e confirmou que `/api/dashboard`, `/api/transactions`, `/api/receivers` não retornam 401 para usuário recém-criado

## Resumo executivo

Após clicar em **Entrar**, o login no Supabase é concluído e a sessão é criada. O problema ocorre **depois do redirect para o painel**, quando as telas chamam APIs internas (`/api/*`) que exigem **contexto de organização** (via tabela `profiles`). Para usuários criados “normalmente” (com confirmação de e-mail), existem registros em `auth.users` e `user_metadata.role`, mas **não existe registro correspondente em `public.profiles`**; como consequência, as APIs internas falham com **401 Unauthorized** e o usuário “não consegue acessar a plataforma” (telas sem dados/erros).

Em outras palavras: o login autentica, mas o usuário não foi “onboardado” (não tem `profiles.organization_id`).

## Evidência (comparação com usuário E2E)

Fonte (consulta somente leitura via Service Role): [_tmp-login-diag.json](file:///c:/Users/Leonardo/Desktop/ConnektPay/_tmp-login-diag.json) e [_tmp-login-diag-missing-users.json](file:///c:/Users/Leonardo/Desktop/ConnektPay/_tmp-login-diag-missing-users.json)

### Usuário que consegue logar (E2E)

- `admin@connektpay.com`
- Existe em `auth.users` (email confirmado)
- Existe em `public.profiles` com:
  - `role=owner`
  - `organization_id` preenchido e organização `active`

### Usuários confirmados que falham (amostra encontrada)

Foram encontrados **usuários com email confirmado** que possuem `user_metadata.role=owner`, porém **não possuem linha em `public.profiles`** (logo, não têm `organization_id`).

## Investigação passo a passo (1–10)

### 1) Verificar se o usuário existe em auth.users

- Resultado esperado: o usuário aparece no `auth.users` (via Admin API `listUsers`) com `email_confirmed_at` preenchido.
- Achado: os usuários afetados existem em `auth.users` e estão confirmados (ver `_tmp-login-diag-missing-users.json`).

### 2) Verificar se o usuário existe em profiles

- Resultado esperado: existir `public.profiles.id = auth.users.id`.
- Achado: para usuários afetados, **não existe linha em `public.profiles`**.
- Impacto técnico:
  - `getAuthedProfile()` retorna `null` quando não encontra profile ([auth-context.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/auth-context.ts#L7-L41)).
  - `requireOrgContext()` e `requireSessionOrgContext()` passam a falhar com `Error('Unauthorized')` ([org-context.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/org-context.ts#L1-L14), [session-org-context.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/session-org-context.ts#L11-L19)).

### 3) Verificar se existe organization vinculada

- Resultado esperado: `profiles.organization_id` aponta para `public.organizations.id`.
- Achado: como não existe `profiles`, não existe vínculo de organização para o usuário.
- Observação: na modelagem atual, `profiles.organization_id` é **NOT NULL** ([20260622000001_init.sql](file:///c:/Users/Leonardo/Desktop/ConnektPay/supabase/migrations/20260622000001_init.sql#L58-L67)).

### 4) Verificar se existe role atribuída

- No app existem duas fontes de role:
  1) `profiles.role` (fonte preferencial)
  2) fallback para `user_metadata.role` / `app_metadata.role` no middleware

- Achado: usuários afetados têm `user_metadata.role=owner`, mas não têm `profiles.role` (porque não existe profile).

### 5) Verificar se o middleware permite acesso para esse role

- O middleware tenta buscar `profiles.role`; se não encontrar, usa `user_metadata.role` como fallback ([middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts#L66-L78)).
- Para `role=owner`, o middleware permite navegar normalmente (inclusive `/admin/*`).
- Conclusão: **o bloqueio não está no middleware**, e sim no **contexto de organização usado nas APIs**.

### 6) Verificar se existe erro de redirect após login

- Após o submit do login:
  - chama `signInWithPassword(email,password)`
  - espera até 1s por sessão via `getSession()`
  - faz `window.location.assign(returnTo)` ([screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L194-L217))
- Conclusão: o redirect em si tende a funcionar; o problema aparece logo em seguida, quando o painel tenta carregar dados via APIs internas.

### 7) Verificar logs do login

- Na auditoria E2E do usuário admin, o Supabase retorna 200 no endpoint de token (senha) e a navegação chega em `/dashboard` (ver notas e evidências em [QA-E2E-FINAL.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/QA-E2E-FINAL.md)).
- Para usuários afetados, o login pode concluir (sem erro de senha), mas as requisições subsequentes para `/api/*` retornam 401 devido à falta de profile/org.

### 8) Verificar se existe erro no console

- O dashboard faz múltiplos `fetch('/api/...')` e, em caso de resposta não-OK, seta erro e esvazia dados ([DashboardScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L545-L575)).
- Sintoma esperado no navegador:
  - telas com listas vazias + mensagem de erro (“Unauthorized”/“Falha ao carregar…”), dependendo do endpoint.

### 9) Verificar se existe erro na API do Supabase

- As APIs internas classificam `Unauthorized` como 401 ([api-error.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/api-error.ts#L11-L28)).
- A raiz do 401 é: `requireOrgContext()` → `getAuthedProfile()` → profile inexistente.

### 10) Comparar com o usuário E2E que consegue logar

Diferença determinante:
- `admin@connektpay.com`: `auth.users` + `profiles` + `organizations` OK
- Usuário “normal” confirmado: `auth.users` OK, mas **sem `profiles`** (logo sem `organization_id`)

## Onde exatamente falha (o que acontece após clicar em “Entrar”)

1) Login autentica no Supabase e cria sessão (cookies/token).  
2) Browser navega para `/dashboard`.  
3) O dashboard dispara chamadas para `/api/transactions`, `/api/dashboard`, `/api/receivers` etc.  
4) Essas APIs exigem `organizationId` obtido do profile; como não existe `profiles` para o usuário, retornam **401**.  
5) A UI fica sem dados e mostra erro (ou parece “sem acesso”).

## Tabela inconsistente / campo faltando

- Tabela inconsistente: `public.profiles`
- Campo faltando: linha `profiles` para o `auth.users.id` do usuário (e, por consequência, `profiles.organization_id` e `profiles.role`)

## Causa provável (por desenho atual do cadastro)

O cadastro executa a criação da organização/profile **somente quando `signUp()` retorna sessão**:

- Se `signUp()` retorna `data.session = null`, a UI mostra “Verifique seu e-mail…” e **não executa** `rpc('create_organization_with_owner', ...)` ([screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L342-L363)).

Em ambientes onde a confirmação de e-mail é obrigatória, isso cria o cenário:
- usuário confirma e-mail,
- consegue logar,
- mas nunca foi criada a organização + profile,
- então o painel não consegue carregar dados (401).

## Correção necessária (proposta, sem executar)

Uma correção precisa garantir que, após a confirmação de e-mail, o usuário tenha:
- `public.profiles.id = auth.users.id`
- `public.profiles.organization_id` válido
- `public.profiles.role` (ex.: `owner`)

Opções típicas (para avaliação):
- Criar um fluxo de onboarding pós-login: se não existir `profiles`, executar a criação da organização/profile (RPC) e só então liberar o painel.
- Ajustar o cadastro para garantir sessão (ou executar a criação assim que a sessão existir).
- Criar mecanismo server-side (trigger/job) para provisionar `profiles` e organização quando necessário (requer cuidado com modelo multi-tenant).
