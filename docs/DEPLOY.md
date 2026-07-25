## Deploy (Supabase + Vercel)

Este projeto é um Next.js (App Router) com Supabase (Postgres + Auth). O backend do produto roda nas rotas `/app/api/*` e grava tudo no banco Supabase via RLS (sessão) e Service Role (operações server-side).

### 1) Criar o projeto no Supabase

1. Crie um novo projeto no Supabase.
2. Vá em **Project Settings → API** e copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

### Provisionamento automático (opcional)

Se você tiver tokens de API, dá para provisionar Supabase + Vercel + Auth URLs automaticamente:

1. Crie `.env.deploy.local` baseado em `.env.deploy.example`.
2. Rode:

```bash
npm run provision
```

### 2) Aplicar migrations (schema completo)

No Supabase, vá em **SQL Editor** e aplique, em ordem, os arquivos de `supabase/migrations/` (ordem lexicográfica pelo prefixo timestamp).

Alternativa (quando você quiser aplicar tudo de uma vez): use o arquivo gerado [supabase/setup.sql](file:///c:/Users/Leonardo/Desktop/ConnektPay/supabase/setup.sql) como referência do schema completo (ele é regenerado pelo projeto).

### 3) Configurar Supabase Auth (URLs)

O app usa Supabase Auth para login/cadastro e reset de senha.

Em **Authentication → URL Configuration**:
- `Site URL`: `https://SEU-DOMINIO` (ou a URL da Vercel quando você tiver)
- `Redirect URLs`:
  - `https://SEU-DOMINIO/reset-password`
  - `http://localhost:3000/reset-password` (para desenvolvimento)

### 4) Deploy na Vercel

1. Suba o projeto para um repositório Git (GitHub/GitLab/Bitbucket).
2. Na Vercel: **New Project** → importe o repositório.
3. Em **Environment Variables**, configure:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

Opcional (para o fluxo financeiro real):
   - `MYGATEWAY_BASE_URL`
   - `MYGATEWAY_X_API_KEY` (ou `MYGATEWAY_API_KEY`)
   - `MYGATEWAY_AUTH_DATA` (ou `MYGATEWAY_CLIENT_ID` + `MYGATEWAY_CLIENT_SECRET`)
   - `MYGATEWAY_WEBHOOK_SECRET` (recomendado em produção)

Opcional (para reprocessamento de eventos pendentes):
   - `CRON_SECRET` (ou `EVENTS_PROCESS_SECRET`)

### 5) Rodar o reprocessamento de eventos (opcional)

O endpoint `POST /api/events/process-pending` pode ser protegido por segredo.

Se você setar `CRON_SECRET` (ou `EVENTS_PROCESS_SECRET`), chame assim:

```bash
curl -X POST "https://SEU-DOMINIO/api/events/process-pending?cron_secret=SEU_SEGREDO"
```

Ou envie header:

```bash
curl -X POST "https://SEU-DOMINIO/api/events/process-pending" -H "x-cron-secret: SEU_SEGREDO"
```

### 6) Sanity check após deploy

- Acesse `/login` e crie uma conta.
- Verifique se `profiles` e `organizations` foram criados.
- Crie um link em `/links-pagamento/novo` e abra o `/checkout?slug=...`.
