# Login em Produção (Vercel) — Diagnóstico

Data: 2026-06-25  
URL produção: https://connektpay.vercel.app/login  
Usuário: `admin@connektpay.com`

## Resumo (causa provável)

O Supabase Auth em produção **autentica (token 200)**, porém o app **não consegue concluir a entrada no painel** porque a navegação para `/dashboard` entra em **loop de redirect (ERR_TOO_MANY_REDIRECTS)** — comportamento compatível com **sessão não sendo persistida/propagada via cookies** (middleware não enxerga usuário).

Além disso, o deploy de produção **não contém endpoints que existem no repositório atual**, indicando **deploy desatualizado ou build/publicação a partir de branch/diretório errados**:

- `POST /api/onboarding/ensure` → **404 Not Found** (deveria existir: [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/onboarding/ensure/route.ts))
- `GET /api/dashboard` → **404 Not Found** (deveria existir: [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/dashboard/route.ts))

## Evidências objetivas

### 1) Endpoint ausente em produção

Verificação direta via HTTP:

- `POST https://connektpay.vercel.app/api/onboarding/ensure` → **404**
- `GET https://connektpay.vercel.app/api/dashboard` → **404**
- `GET https://connektpay.vercel.app/api/transactions` → **401** (endpoint existe)
- `GET https://connektpay.vercel.app/api/receivers` → **401** (endpoint existe)
- `GET https://connektpay.vercel.app/api/me` → **401** (endpoint existe)

Isso mostra que **parte das rotas `/api/*` está publicada**, mas **as rotas específicas do onboarding/dashboard do código atual não estão**.

### 2) Playwright em produção (login)

Execução:

- `BASE_URL=https://connektpay.vercel.app`
- `E2E_EMAIL=admin@connektpay.com`
- Senha: usada a do ambiente de E2E local (não registrada aqui por segurança)
- Teste: `tests/qa-e2e-audit.spec.ts` (grep: `1) Login`)

Resultado:

- Supabase token (senha) retornou **200**:
  - `POST https://tecnqmtzdefeacbfdyma.supabase.co/auth/v1/token?grant_type=password` → **200**
- Mesmo assim, o app **não chegou em `/dashboard`**:
  - `GET https://connektpay.vercel.app/dashboard` → `net::ERR_TOO_MANY_REDIRECTS`
  - Console:
    - `Failed to load resource: net::ERR_TOO_MANY_REDIRECTS (…/dashboard)`
    - `Failed to fetch RSC payload for …/dashboard. Falling back to browser navigation.`

Artefatos gerados:
- `test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/attachments/notes-*.txt`
- `test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/attachments/console-errors-*.txt`
- `test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/attachments/request-failures-*.txt`
- `test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/attachments/supabase-traffic-*.txt`

### 3) Supabase alvo em produção (confirmação)

O tráfego do Playwright confirma que a Vercel **aponta para o projeto correto**:

- Supabase host visto em produção: `https://tecnqmtzdefeacbfdyma.supabase.co` (ref `tecnqmtzdefeacbfdyma`)

### 4) Usuário admin no banco do projeto tecnqmtzdefeacbfdyma

No banco linkado (`tecnqmtzdefeacbfdyma`), o usuário existe e está consistente:

- `auth.users`: existe e está confirmado
- `public.profiles`: existe
- `public.organizations`: existe e status `active`
- `public.provider_settings`: existe (count = 1)
- `profiles.role`: `owner`

Conclusão: **não é** caso de “usuário sem profile/org” para `admin@connektpay.com`.

## O que corrigir (ações exatas)

### A) Corrigir o deploy (mais provável)

1. Na Vercel, confirmar que o **Production Deployment** está saindo do **repositório/diretório correto** (raiz do projeto) e da **branch correta**.
2. Forçar um redeploy do último commit que contém:
   - Login com chamada de ensure (client): [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)
   - Layout autenticado com self-heal: [layout.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/(app)/layout.tsx)
   - Endpoint: [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/onboarding/ensure/route.ts)
3. Após redeploy, validar rapidamente:
   - `POST /api/onboarding/ensure` deve retornar **401** (sem sessão) ou **200** (com sessão), mas **não 404**.
   - `GET /api/dashboard` deve existir (provável **401** sem sessão), mas **não 404**.

### B) Conferir variáveis de ambiente na Vercel (produção)

Garantir que estão configuradas no **Environment = Production** (não só Preview):

- `NEXT_PUBLIC_SUPABASE_URL` = `https://tecnqmtzdefeacbfdyma.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key do projeto `tecnqmtzdefeacbfdyma`
- `SUPABASE_SERVICE_ROLE_KEY` = service role key do mesmo projeto

Observação: o login UI usa principalmente URL + ANON. O `SERVICE_ROLE_KEY` impacta rotas/server-side específicas e testes/admin.

### C) Se, após A/B, ainda falhar

O sintoma atual aponta para “token 200 mas sem sessão reconhecida pelo servidor”. Se persistir mesmo com deploy atualizado e env ok, o próximo passo é validar:

- Se cookies `sb-*` estão sendo setados no navegador em produção após login
- Se há headers/caching interferindo em Set-Cookie (quando aplicável)
- Se existe diferença de implementação do client/server Supabase no build publicado

## Conclusão

- Produção autentica no Supabase (token 200), mas falha ao concluir sessão/entrada no painel por loop de redirects ao acessar `/dashboard`.
- Deploy em produção está **inconsistente** com o repositório atual (endpoints críticos retornando 404), indicando **deploy desatualizado** ou **configuração errada de build/branch/diretório** na Vercel.
