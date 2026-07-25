# Cadastro Automático de Usuários — Connekt Pay

Data: 2026-06-24  
Versão: v1.0.0+

Este documento descreve o fluxo definitivo implementado para garantir que qualquer usuário recém-cadastrado tenha, automaticamente, todos os registros necessários para acessar o painel (incluindo `profiles`, `organizations` e `provider_settings`), mesmo quando a confirmação de e-mail é obrigatória.

## Problema resolvido

No fluxo anterior, quando a confirmação de e-mail era exigida, `signUp()` retornava `session = null`, e o cadastro não criava a organização/perfil. O usuário confirmava o e-mail, conseguia autenticar, mas falhava ao acessar o painel porque as APIs internas dependem de `profiles.organization_id`.

Sintoma típico:
- Login concluído (sessão ok)
- Painel abre, mas as chamadas `/api/*` retornam 401 por ausência de `organization_id` (profile inexistente)

## Novo desenho (causa raiz)

A provisão de onboarding foi movida para o banco (Supabase/Postgres), com um mecanismo adicional de auto-heal no backend.

### 1) Trigger em `auth.users` (fonte de verdade)

Ao inserir um usuário em `auth.users`, é executado um trigger que:
- Cria uma organização padrão
- Cria o `public.profiles` com `role = owner`
- Vincula o profile à organização (`profiles.organization_id`)
- Garante `provider_settings` para a organização

Arquivo (migration):
- [20260624000015_user_onboarding.sql](file:///c:/Users/Leonardo/Desktop/ConnektPay/supabase/migrations/20260624000015_user_onboarding.sql)

Esse trigger executa independente de existir sessão no frontend. Portanto, funciona igualmente em cenários com:
- e-mail confirmado automaticamente (session imediata)
- e-mail com confirmação obrigatória (session apenas após confirmar + login)

### 2) Função `ensure_profile_and_org()` (idempotência e auto-heal)

Além do trigger, existe a função:
- `public.ensure_profile_and_org()`

Comportamento:
- Se o profile já existir, retorna o `organization_id` existente
- Se não existir, cria `organizations` + `profiles` + `provider_settings` e retorna o `organization_id`

Essa função é usada para corrigir automaticamente qualquer inconsistência remanescente (por exemplo, usuários antigos sem profile).

### 3) Endpoint interno de onboarding

Existe um endpoint interno chamado após login:
- `POST /api/onboarding/ensure`

Implementação:
- chama `supabase.rpc('ensure_profile_and_org')` usando a sessão atual (cookies)
- retorna `{ ok: true, organizationId }` quando concluído

Arquivo:
- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/onboarding/ensure/route.ts)

### 4) Integração com o fluxo normal do app

O app garante o onboarding de duas formas:

- Pós-login (client):
  - O login chama `POST /api/onboarding/ensure` antes de redirecionar para o painel
  - Arquivo: [LoginScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L133-L217)

- Layout autenticado (server):
  - Ao renderizar rotas do grupo autenticado, o layout executa `ensure_profile_and_org`
  - Arquivo: [layout.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/(app)/layout.tsx#L6-L21)

O objetivo é garantir que, mesmo que algum usuário “escape” do trigger (ou seja um usuário antigo), o acesso ao Dashboard seja recuperado automaticamente e de forma idempotente.

## Idempotência (garantias)

Foram aplicadas duas garantias principais:
- `pg_advisory_xact_lock(hashtext(uid::text))`: impede condições de corrida para o mesmo usuário
- Checagem de existência do profile antes de criar: se já existe, não cria novamente

Como resultado:
- Se `profiles` já existir, nada é recriado.
- Se faltar `profiles`, ele é criado automaticamente.
- O fluxo não depende de scripts manuais ou inserts ad-hoc.

## Role inicial (owner)

O provisionamento inicial define:
- `profiles.role = owner`

O RBAC do middleware e das APIs internas assume `profiles.role` como fonte principal.

## Teste automatizado (Playwright)

Teste criado:
- [signup-onboarding.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/signup-onboarding.spec.ts)

O teste:
- Cria um usuário via Admin API com `email_confirm: true`
- Aguarda `profiles` existir e valida `organization_id`
- Faz login no UI
- Verifica que o Dashboard abre e que endpoints críticos não retornam 401 (`/api/dashboard`, `/api/transactions`, `/api/receivers`)

Pré-requisitos do teste:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Aplicação e validação (ambiente)

Execução de validação: 2026-06-25

- Banco alvo (Supabase Cloud): projeto `connektpay` (ref `tecnqmtzdefeacbfdyma`)
- Migration `20260624000015_user_onboarding.sql`: aplicada/validada pelo banco (função + trigger + grants presentes)
- E2E: `tests/signup-onboarding.spec.ts` passou com `BASE_URL=http://localhost:3010`
