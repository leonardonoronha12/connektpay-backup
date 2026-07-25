# SUPABASE-AUTH-EMAIL-FIX

Data: 2026-06-26  
BASE_URL: https://connektpay.vercel.app  
Deploy (produção): `dpl_6jeYeQRnTY6RnkjDVhRstj7CPYqC`

## Problema

Usuários criados via `/register` não recebiam e-mail de confirmação do Supabase em produção, bloqueando o fluxo: cadastrar → confirmar → acessar.

## Diagnóstico (confirmado)

### 1) Supabase Auth: rate limit de e-mail

Foi reproduzido retorno de erro do Supabase no `signUp`:

- `email rate limit exceeded`

Isso indica que o provedor de e-mail atual (padrão do Supabase ou SMTP limitado) atingiu limite/antispam e o Supabase está bloqueando o disparo de e-mails de confirmação.

Observação adicional:

- Foi observado comportamento onde alguns domínios (ex.: `example.com`) retornaram “e-mail inválido” via API de signup, enquanto `@connektpay.com` avançou até o rate limit.
- Isso é compatível com configuração de **allowlist de domínios de e-mail** no Auth.

Script usado para diagnosticar:

- `node scripts/prod-auth-email-diagnostics.mjs`

### 2) Callback de confirmação não estava acessível publicamente

O path `/auth/callback`:

- não existia como rota no app, e
- não estava na allowlist do middleware (era tratado como rota protegida), então era redirecionado para `/login`.

Mesmo quando o usuário confirma o e-mail, a experiência de “confirmar e já entrar” dependia desse callback para trocar o `code` por sessão e finalizar onboarding.

## Correções aplicadas no código

### 1) Garantir redirect correto no signUp

Atualizado o `signUp` para sempre usar:

- `emailRedirectTo = https://connektpay.vercel.app/auth/callback`

Arquivo: [auth.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/services/auth.ts)

### 2) Implementar `/auth/callback` e permitir acesso público

- Adicionada rota [page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/auth/callback/page.tsx) para:
  - trocar `code` por sessão (`exchangeCodeForSession`)
  - chamar `/api/onboarding/ensure`
  - redirecionar para `/dashboard`
- Atualizado [middleware.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/middleware.ts) para tratar `/auth/callback` como rota pública.

## Configuração obrigatória no Supabase (produção)

### 0) Permitir cadastro para e-mails externos (se aplicável)

Verificar em **Auth** se existe configuração do tipo:

- Allowed email domains / Email domain allow list / Restringir domínios

Se existir e o produto for “self-serve”, garantir que:

- a restrição esteja desabilitada, ou
- contenha os domínios esperados para cadastro.

### 1) URLs

Configurar em **Auth → URL Configuration**:

- Site URL: `https://connektpay.vercel.app`
- Redirect URLs (permitir):
  - `https://connektpay.vercel.app`
  - `https://connektpay.vercel.app/login`
  - `https://connektpay.vercel.app/dashboard`
  - `https://connektpay.vercel.app/reset-password`
  - `https://connektpay.vercel.app/auth/callback`

### 2) SMTP (recomendado e necessário)

Como o erro foi `email rate limit exceeded`, a correção durável é configurar **SMTP customizado** em **Auth → SMTP settings** (ou equivalente no painel Supabase):

- Host/Port/User/Pass do seu provedor (SendGrid / AWS SES / Resend / Mailgun etc.)
- “From email” com domínio válido (idealmente `@connektpay.com`)
- Verificar DKIM/SPF do domínio no provedor

Após configurar, reexecutar:

- `node scripts/prod-auth-email-diagnostics.mjs`

Objetivo do diagnóstico pós-SMTP:

- `signUp.ok = true` (sem `email rate limit exceeded`)
- `generateLink.redirect_to = https://connektpay.vercel.app/auth/callback`

## Cadastro (garantias de dados)

### 1) Usuário em `auth.users`

- Ao cadastrar: `email_confirmed_at` deve ficar `null` até confirmar.

### 2) Profile / Organization / provider_settings

O banco está preparado para criar automaticamente:

- `organizations`
- `profiles` (com `organization_id`)
- `provider_settings` (para a organização)

via trigger `auth_users_create_profile_org`:

- Migração: [20260624000015_user_onboarding.sql](file:///c:/Users/Leonardo/Desktop/ConnektPay/supabase/migrations/20260624000015_user_onboarding.sql)

## Workaround seguro para QA (enquanto SMTP não estiver pronto)

Usuários QA confirmados podem ser criados/rotacionados via Admin API (Service Role), sem depender de e-mail:

- Script: `node scripts/create-qa-users-prod.mjs`
- O script:
  - cria/atualiza usuários com `email_confirm: true`
  - garante perfil/organização
  - valida login e acesso por role (owner/admin/financeiro) via UI

Observação de segurança:

- As senhas temporárias são geradas e impressas apenas no stdout no momento da execução.
- Rotacionar/alterar as senhas após QA.

## Status final

- Causa raiz: **rate limit de e-mail do Supabase (SMTP padrão/limitado)** + ausência do callback público no app.
- Correção de e-mail normal: **depende de configurar SMTP customizado no Supabase** (código já preparado com redirect correto e callback funcional).
- Workaround QA: **disponível via criação de usuários confirmados por Admin API**.
