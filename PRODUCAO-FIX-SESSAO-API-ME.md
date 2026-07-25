# PRODUÇÃO — Fix sessão + /api/me

Ambiente: https://connektpay.vercel.app  
Data: 2026-06-28  

## Sintomas (bloqueadores reportados)

- GET /api/me retornava 500 em produção.
- Após login (cookies/sessão presentes), endpoints internos essenciais retornavam 401:
  - GET /api/dashboard?days=30
  - GET /api/transactions
  - GET /api/receivers
- GET /favicon.ico retornava 404 em produção.

## Causa raiz (sessão em rotas server-side)

O Supabase server client dependia do store de cookies do Next (`cookies()`), incluindo escrita de cookies (`cookieStore.set(...)`) dentro do callback `setAll`. Em produção, isso pode falhar/ser inconsistente dependendo do contexto de execução (ex.: rotas API, server components, refresh do token), causando comportamento de “sessão ausente”/inconsistente e erros nos handlers que dependem de `supabase.auth.getUser()` e leitura de `profiles`.

## Correção aplicada (código)

### 1) Supabase server client lê cookies a partir do header HTTP

- Ajuste para obter a sessão a partir do header `cookie` (via `headers()`), reduzindo inconsistências de leitura em rotas server-side.
- A escrita de cookies em `setAll` passou a ser protegida (não derruba a request caso o ambiente não permita setar cookie naquele contexto).

Arquivo: lib/supabase-server.ts  

### 2) Favicon em produção

- Foi adicionado suporte para /favicon.ico (200/204) para eliminar 404 em produção.

Arquivo gerado: public/favicon.ico  
Arquivo existente: app/favicon.ico/route.ts (retorna 204)

### 3) Redução de prefetch ruidoso (para evitar “Failed to fetch RSC payload”)

- Links críticos passaram a `prefetch={false}` para reduzir prefetch agressivo que gera erros em console em alguns browsers.

Arquivos:
- components/screens.tsx
- components/docs/DocsSidebar.tsx
- components/docs/DocsBreadcrumb.tsx
- components/docs/DocsShell.tsx

### 4) Bundle: remoção de dynamic import do gráfico no Dashboard

- Removido `next/dynamic` do DashboardChart para evitar chunk isolado (mitiga falhas de carregamento em cenários de navegação/recursos).

Arquivo: components/screens.tsx

### 5) WebKit: evitar “due to access control checks” em fetch interno

- Em WebKit (Safari/iPhone), alguns requests internos eram cancelados durante navegação/reload e isso gerava pageerror do tipo “due to access control checks”.
- Foi aplicado `keepalive: true` para GETs internos críticos e um patch global de `fetch` (somente para GET /api/*) para tornar o comportamento consistente em Safari/iPhone.

Arquivos:
- hooks/me.ts
- components/screens.tsx
- components/layout/AppShell.tsx

## Validação automatizada (produção)

O teste `tests/producao-final-check.spec.ts` valida diretamente (via request no mesmo contexto logado):

- /api/me → 200
- /api/dashboard?days=30 → 200
- /api/transactions → 200
- /api/receivers → 200
- /favicon.ico → 200 ou 204

Evidências geradas em `test-results/` (dump técnico, trace, vídeo).

## Status

- Suite de produção passou em Chrome/Edge/Firefox/WebKit/Android/iPhone.
