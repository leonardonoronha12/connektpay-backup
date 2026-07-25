# QA E2E Final — Connekt Pay (17 fluxos)

Data de geração: 2026-06-24T20:35:30.000Z
BASE_URL: http://localhost:3001
Fonte:
- Execução completa (17 fluxos): `test-results/final-20260624-171239/`
- Revalidação (apenas fluxo 5 — Checkout público, com `E2E_CHECKOUT_SLUG` configurado): `test-results/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/`

## Status geral

- Total: 17
- SUCESSO: 17
- FALHOU: 0
- IGNORADO: 0
- NÃO EXECUTADO (sem artefatos): 0
- Tempo total (soma das etapas): 1m 33s

## Validação adicional — Signup/Onboarding (novo usuário)

- Teste: `tests/signup-onboarding.spec.ts`
- BASE_URL: http://localhost:3010
- Status: SUCESSO
- Evidências:
  - `test-results/signup-onboarding-Cadastro-37cc8-ite-abrir-Dashboard-sem-401/test-finished-1.png`
  - `test-results/signup-onboarding-Cadastro-37cc8-ite-abrir-Dashboard-sem-401/video.webm`
- Critérios validados:
  - Usuário novo (email confirmado) consegue fazer login
  - Dashboard abre
  - `/api/dashboard`, `/api/transactions`, `/api/receivers` não retornam 401

## Matriz (17 fluxos)

| # | Fluxo | Status | Tempo (soma etapas) | Evidências |
|---:|---|---:|---:|---|
| 1 | Login | SUCESSO | 2.5 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/video.webm` |
| 2 | Logout | SUCESSO | 2.3 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm` |
| 3 | Dashboard | SUCESSO | 6.2 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/test-finished-2.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/video.webm` |
| 4 | Payment Links | SUCESSO | 8.5 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6a5f9-torageState-4-Payment-Links/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6a5f9-torageState-4-Payment-Links/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6a5f9-torageState-4-Payment-Links/video.webm` |
| 5 | Checkout público | SUCESSO | 1.1 s | `test-results/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/test-finished-1.png`<br/>`test-results/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/test-finished-2.png`<br/>`test-results/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/video.webm` |
| 6 | Transações | SUCESSO | 57.5 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/test-finished-2.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/video.webm` |
| 7 | Assinaturas | SUCESSO | 1.7 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-fb7a4--storageState-7-Assinaturas/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-fb7a4--storageState-7-Assinaturas/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-fb7a4--storageState-7-Assinaturas/video.webm` |
| 8 | Planos | SUCESSO | 1.4 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-45ca0-s-com-storageState-8-Planos/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-45ca0-s-com-storageState-8-Planos/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-45ca0-s-com-storageState-8-Planos/video.webm` |
| 9 | Recebedores | SUCESSO | 2.7 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-5bfd3--storageState-9-Recebedores/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-5bfd3--storageState-9-Recebedores/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-5bfd3--storageState-9-Recebedores/video.webm` |
| 10 | KYC (admin) | SUCESSO | 1.3 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-1f0d0--storageState-10-KYC-admin-/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-1f0d0--storageState-10-KYC-admin-/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-1f0d0--storageState-10-KYC-admin-/video.webm` |
| 11 | Ledger | SUCESSO | 968 ms | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c5ea8--com-storageState-11-Ledger/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c5ea8--com-storageState-11-Ledger/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c5ea8--com-storageState-11-Ledger/video.webm` |
| 12 | Antecipação | SUCESSO | 954 ms | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c8cf7-storageState-12-Antecipação/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c8cf7-storageState-12-Antecipação/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c8cf7-storageState-12-Antecipação/video.webm` |
| 13 | Repasses | SUCESSO | 1.1 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8909d-om-storageState-13-Repasses/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8909d-om-storageState-13-Repasses/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8909d-om-storageState-13-Repasses/video.webm` |
| 14 | Conciliação | SUCESSO | 1.0 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-494f4-storageState-14-Conciliação/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-494f4-storageState-14-Conciliação/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-494f4-storageState-14-Conciliação/video.webm` |
| 15 | Auditoria | SUCESSO | 1.1 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8aeb5-m-storageState-15-Auditoria/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8aeb5-m-storageState-15-Auditoria/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8aeb5-m-storageState-15-Auditoria/video.webm` |
| 16 | Configurações | SUCESSO | 937 ms | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6d3e3-orageState-16-Configurações/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6d3e3-orageState-16-Configurações/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6d3e3-orageState-16-Configurações/video.webm` |
| 17 | Navegação mobile | SUCESSO | 2.3 s | `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-ac07e--mobile-17-Navegação-mobile/test-finished-1.png`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-ac07e--mobile-17-Navegação-mobile/trace.zip`<br/>`test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-ac07e--mobile-17-Navegação-mobile/video.webm` |

## Resultados por fluxo

### 1) Login
- Status: SUCESSO
- Tempo (soma das etapas): 2.5 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-1-Login/video.webm`
- Notas:
  - EXECUTANDO: fluxo Login.
  - Credencial usada no login (E2E_EMAIL): admin@connektpay.com
  - Diagnóstico (login): e-mail preenchido no input: admin@connektpay.com
  - Diagnóstico (login): tamanho da senha no input: 14
  - Diagnóstico (login): Supabase respondeu 200 no endpoint de token (senha).
  - Diagnóstico (login): cookies sb-* no contexto: sb-tecnqmtzdefeacbfdyma-auth-token (domínio=localhost, httpOnly=false, sameSite=Lax)
  - Login via UI (Supabase) concluído e redirecionou para /dashboard.
- Navegações:
  - http://localhost:3001/login
  - http://localhost:3001/login
  - http://localhost:3001/dashboard
  - http://localhost:3001/dashboard

### 2) Logout
- Status: SUCESSO
- Tempo (soma das etapas): 2.3 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm`
- Notas:
  - EXECUTANDO: fluxo Logout.
  - Credencial usada no login (E2E_EMAIL): admin@connektpay.com
  - Diagnóstico (login): e-mail preenchido no input: admin@connektpay.com
  - Diagnóstico (login): tamanho da senha no input: 14
  - Diagnóstico (login): Supabase respondeu 200 no endpoint de token (senha).
  - Diagnóstico (login): cookies sb-* no contexto: sb-tecnqmtzdefeacbfdyma-auth-token (domínio=localhost, httpOnly=false, sameSite=Lax)
  - Login via UI (Supabase) concluído e redirecionou para /dashboard.
  - Logout via menu do usuário executado e voltou para /login.
- Navegações:
  - http://localhost:3001/login
  - http://localhost:3001/login
  - http://localhost:3001/dashboard
  - http://localhost:3001/dashboard
  - http://localhost:3001/login
- Falhas de requisição:
  - Externas (1):
    - POST https://tecnqmtzdefeacbfdyma.supabase.co/auth/v1/logout?scope=global :: net::ERR_ABORTED

### 3) Dashboard
- Status: SUCESSO
- Tempo (soma das etapas): 6.2 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/test-finished-2.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-e5372-om-storageState-3-Dashboard/video.webm`
- Notas:
  - EXECUTANDO: fluxo Dashboard.
  - Credencial usada no login (E2E_EMAIL): admin@connektpay.com
  - Diagnóstico (login): e-mail preenchido no input: admin@connektpay.com
  - Diagnóstico (login): tamanho da senha no input: 14
  - Diagnóstico (login): Supabase respondeu 200 no endpoint de token (senha).
  - Diagnóstico (login): cookies sb-* no contexto: sb-tecnqmtzdefeacbfdyma-auth-token (domínio=localhost, httpOnly=false, sameSite=Lax)
  - Login via UI (Supabase) concluído e redirecionou para /dashboard.
- Navegações:
  - http://localhost:3001/login
  - http://localhost:3001/login
  - http://localhost:3001/dashboard
  - http://localhost:3001/dashboard

### 4) Payment Links
- Status: SUCESSO
- Tempo (soma das etapas): 8.5 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6a5f9-torageState-4-Payment-Links/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6a5f9-torageState-4-Payment-Links/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6a5f9-torageState-4-Payment-Links/video.webm`
- Notas:
  - EXECUTANDO: fluxo Payment Links.
  - Credencial usada no login (E2E_EMAIL): admin@connektpay.com
  - Diagnóstico (login): e-mail preenchido no input: admin@connektpay.com
  - Diagnóstico (login): tamanho da senha no input: 14
  - Diagnóstico (login): Supabase respondeu 200 no endpoint de token (senha).
  - Diagnóstico (login): cookies sb-* no contexto: sb-tecnqmtzdefeacbfdyma-auth-token (domínio=localhost, httpOnly=false, sameSite=Lax)
  - Login via UI (Supabase) concluído e redirecionou para /dashboard.
  - Link criado e redirecionou para checkout público (slug gerado).
- Navegações:
  - http://localhost:3001/login
  - http://localhost:3001/login
  - http://localhost:3001/dashboard
  - http://localhost:3001/dashboard
  - http://localhost:3001/links-pagamento
  - http://localhost:3001/links-pagamento
  - http://localhost:3001/checkout?slug=5g4rfqqoy8zdn4
  - http://localhost:3001/links-pagamento
  - http://localhost:3001/links-pagamento
  - http://localhost:3001/links-pagamento/novo
  - http://localhost:3001/checkout?slug=apshxjuyax48fl
- Falhas de requisição:
  - Aplicação (4):
    - GET http://localhost:3001/api/receivers :: net::ERR_ABORTED
    - GET http://localhost:3001/api/transactions :: net::ERR_ABORTED
    - GET http://localhost:3001/api/dashboard?days=30 :: net::ERR_ABORTED
    - GET http://localhost:3001/links-pagamento/novo?_rsc=4YEilqbuVbcrfFRU :: net::ERR_ABORTED

### 5) Checkout público
- Status: SUCESSO
- Tempo (soma das etapas): 1.1 s
- Revalidado com slug configurado:
  - `E2E_CHECKOUT_SLUG=e2e-demo-613703` (definido em `.env.local`)
- Evidências (revalidação):
  - `test-results/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/test-finished-1.png`
  - `test-results/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/test-finished-2.png`
  - `test-results/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/video.webm`
- Observações:
  - Checkout público revalidado com slug configurado e página carregou sem erros HTTP/console.
- Histórico (evidências preservadas da execução completa anterior, quando faltava `E2E_CHECKOUT_SLUG`):
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/error-context.md`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/test-failed-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-776db-ageState-5-Checkout-público/video.webm`

### 6) Transações
- Status: SUCESSO
- Tempo (soma das etapas): 57.5 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/test-finished-2.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-d652f-m-storageState-6-Transações/video.webm`
- Notas:
  - EXECUTANDO: fluxo Transações.
  - Credencial usada no login (E2E_EMAIL): admin@connektpay.com
  - Diagnóstico (login): e-mail preenchido no input: admin@connektpay.com
  - Diagnóstico (login): tamanho da senha no input: 14
  - Diagnóstico (login): Supabase respondeu 200 no endpoint de token (senha).
  - Diagnóstico (login): cookies sb-* no contexto: sb-tecnqmtzdefeacbfdyma-auth-token (domínio=localhost, httpOnly=false, sameSite=Lax)
  - Login via UI (Supabase) concluído e redirecionou para /dashboard.
  - Export CSV acionou download: transactions.csv
- Navegações:
  - http://localhost:3001/login
  - http://localhost:3001/login
  - http://localhost:3001/dashboard
  - http://localhost:3001/dashboard
  - http://localhost:3001/transacoes
  - http://localhost:3001/transacoes
- Falhas de requisição:
  - Aplicação (2):
    - GET http://localhost:3001/api/dashboard?days=30 :: net::ERR_ABORTED
    - GET http://localhost:3001/api/receivers :: net::ERR_ABORTED

### 7) Assinaturas
- Status: SUCESSO
- Tempo (soma das etapas): 1.7 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-fb7a4--storageState-7-Assinaturas/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-fb7a4--storageState-7-Assinaturas/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-fb7a4--storageState-7-Assinaturas/video.webm`
- Notas:
  - EXECUTANDO: fluxo Assinaturas.
  - Nenhuma assinatura disponível para abrir detalhe.
- Navegações:
  - http://localhost:3001/subscriptions
  - http://localhost:3001/subscriptions

### 8) Planos
- Status: SUCESSO
- Tempo (soma das etapas): 1.4 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-45ca0-s-com-storageState-8-Planos/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-45ca0-s-com-storageState-8-Planos/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-45ca0-s-com-storageState-8-Planos/video.webm`
- Notas:
  - EXECUTANDO: fluxo Planos.
  - Criação de plano bloqueada (sem recebedor com KYC aprovado).
- Navegações:
  - http://localhost:3001/subscriptions/plans
  - http://localhost:3001/subscriptions/plans

### 9) Recebedores
- Status: SUCESSO
- Tempo (soma das etapas): 2.7 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-5bfd3--storageState-9-Recebedores/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-5bfd3--storageState-9-Recebedores/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-5bfd3--storageState-9-Recebedores/video.webm`
- Notas:
  - EXECUTANDO: fluxo Recebedores.
- Navegações:
  - http://localhost:3001/recebedores
  - http://localhost:3001/recebedores

### 10) KYC (admin)
- Status: SUCESSO
- Tempo (soma das etapas): 1.3 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-1f0d0--storageState-10-KYC-admin-/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-1f0d0--storageState-10-KYC-admin-/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-1f0d0--storageState-10-KYC-admin-/video.webm`
- Notas:
  - EXECUTANDO: fluxo KYC (admin).
  - Nenhum item KYC disponível para abrir Docs.
- Navegações:
  - http://localhost:3001/admin/aprovacao-kyc
  - http://localhost:3001/admin/aprovacao-kyc

### 11) Ledger
- Status: SUCESSO
- Tempo (soma das etapas): 968 ms
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c5ea8--com-storageState-11-Ledger/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c5ea8--com-storageState-11-Ledger/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c5ea8--com-storageState-11-Ledger/video.webm`
- Notas:
  - EXECUTANDO: fluxo Ledger.
- Navegações:
  - http://localhost:3001/ledger
  - http://localhost:3001/ledger

### 12) Antecipação
- Status: SUCESSO
- Tempo (soma das etapas): 954 ms
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c8cf7-storageState-12-Antecipação/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c8cf7-storageState-12-Antecipação/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-c8cf7-storageState-12-Antecipação/video.webm`
- Notas:
  - EXECUTANDO: fluxo Antecipação.
- Navegações:
  - http://localhost:3001/antecipacao
  - http://localhost:3001/antecipacao

### 13) Repasses
- Status: SUCESSO
- Tempo (soma das etapas): 1.1 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8909d-om-storageState-13-Repasses/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8909d-om-storageState-13-Repasses/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8909d-om-storageState-13-Repasses/video.webm`
- Notas:
  - EXECUTANDO: fluxo Repasses.
- Navegações:
  - http://localhost:3001/repasses
  - http://localhost:3001/repasses

### 14) Conciliação
- Status: SUCESSO
- Tempo (soma das etapas): 1.0 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-494f4-storageState-14-Conciliação/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-494f4-storageState-14-Conciliação/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-494f4-storageState-14-Conciliação/video.webm`
- Notas:
  - EXECUTANDO: fluxo Conciliação.
- Navegações:
  - http://localhost:3001/admin/conciliacao
  - http://localhost:3001/admin/conciliacao

### 15) Auditoria
- Status: SUCESSO
- Tempo (soma das etapas): 1.1 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8aeb5-m-storageState-15-Auditoria/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8aeb5-m-storageState-15-Auditoria/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-8aeb5-m-storageState-15-Auditoria/video.webm`
- Notas:
  - EXECUTANDO: fluxo Auditoria.
- Navegações:
  - http://localhost:3001/admin/auditoria
  - http://localhost:3001/admin/auditoria

### 16) Configurações
- Status: SUCESSO
- Tempo (soma das etapas): 937 ms
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6d3e3-orageState-16-Configurações/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6d3e3-orageState-16-Configurações/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-6d3e3-orageState-16-Configurações/video.webm`
- Notas:
  - EXECUTANDO: fluxo Configurações.
- Navegações:
  - http://localhost:3001/configuracoes
  - http://localhost:3001/configuracoes

### 17) Navegação mobile
- Status: SUCESSO
- Tempo (soma das etapas): 2.3 s
- Evidências:
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-ac07e--mobile-17-Navegação-mobile/test-finished-1.png`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-ac07e--mobile-17-Navegação-mobile/trace.zip`
  - `test-results/final-20260624-171239/qa-e2e-audit-QA-E2E-—-Conn-ac07e--mobile-17-Navegação-mobile/video.webm`
- Notas:
  - EXECUTANDO: fluxo Navegação mobile.
  - Menu mobile abriu e permitiu navegar no painel.
- Navegações:
  - http://localhost:3001/dashboard
  - http://localhost:3001/dashboard
  - http://localhost:3001/transacoes

## Falhas (resumo)

- Nenhuma falha registrada após revalidação do fluxo 5 (Checkout público).

## Observações

- Critério de seleção de artefatos: para cada fluxo 1–17, foi escolhido o diretório `qa-e2e-audit-*` com maior `mtime` no `test-results/` que corresponde ao índice do fluxo.
- “EXTERNO” indica falhas atribuíveis a recursos fora do BASE_URL (ex.: provider/serviços externos), quando não há evidência de erro HTTP/console/page na aplicação.
- “NÃO EXECUTADO” significa ausência de artefatos correspondentes no `test-results/` para o fluxo.
