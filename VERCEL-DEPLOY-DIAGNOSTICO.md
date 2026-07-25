# Vercel — Deploy de Produção (Correção) — Connekt Pay

Data: 2026-06-25  
Produção: https://connektpay.vercel.app

## Objetivo

Publicar corretamente a versão atual do repositório na Vercel (produção), corrigindo o cenário em que rotas do código atual estavam ausentes em produção:

- `POST /api/onboarding/ensure` → 404
- `GET /api/dashboard` → 404

Sem alterar módulos financeiros e sem mexer no banco.

## Status final

- Deploy de produção atualizado com sucesso.
- Rotas críticas agora existem em produção (não retornam mais 404).
- Login redireciona para `/dashboard` sem loop de redirects.
- Fluxos de Dashboard/Transações/Recebedores passaram em produção com Playwright (sem HTTP >= 400 do app e sem erros de console).

## 1) Projeto / conexão / diretório raiz

O workspace local está linkado ao projeto Vercel:

- `projectName`: `connektpay`
- `Root Directory`: `.`
- `Framework Preset`: Next.js
- `Build Command`: `npm run build` / `next build`

Fonte: [project.json](file:///c:/Users/Leonardo/Desktop/ConnektPay/.vercel/project.json)

Observação: o `vercel inspect` do deployment não exibiu metadados de Git/branch; isso é consistente com deploy via CLI (não necessariamente via integração Git). Se a intenção é auto-deploy via Git, a configuração precisa ser garantida no Dashboard da Vercel (repositório e production branch).

## 2) Variáveis de ambiente (Production)

As variáveis exigidas existem no ambiente Production do projeto Vercel (valores não exibidos por segurança):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- (também presentes: `CRON_SECRET`, `MYGATEWAY_WEBHOOK_SECRET`)

## 3) Redeploy de produção

Comando executado (no diretório raiz do projeto):

- `vercel deploy --prod --yes`

Resultado:

- Deployment (prod): `https://connektpay-ixwnx7y38-leonardonoronha12-2214s-projects.vercel.app`
- Alias atualizado: `https://connektpay.vercel.app`
- Deployment id: `dpl_PDKnRERPv61uH9Gk5Swp8ofDYwDq`

## 4) Validação pós-deploy (rotas críticas)

Sem sessão (esperado retornar 401, mas não 404):

- `POST https://connektpay.vercel.app/api/onboarding/ensure` → **401 Unauthorized**
- `GET https://connektpay.vercel.app/api/dashboard` → **401 Unauthorized**

Critério atendido: **não retorna 404**.

## 5) Validação pós-deploy (login e loop de redirect)

Teste Playwright executado contra produção:

- `BASE_URL=https://connektpay.vercel.app`
- `E2E_EMAIL=admin@connektpay.com`

Resultado:

- Login via UI concluiu e redirecionou para `https://connektpay.vercel.app/dashboard` (sem `ERR_TOO_MANY_REDIRECTS`).

## 6) Validação pós-deploy (APIs com sessão)

Foram executados fluxos Playwright em produção:

- `3) Dashboard` → SUCESSO (sem HTTP >= 400 do app)
- `6) Transações` → SUCESSO (sem HTTP >= 400 do app)
- `9) Recebedores` → SUCESSO

Isso valida indiretamente (com sessão válida) que:

- `/api/dashboard` não retornou 401
- `/api/transactions` não retornou 401
- `/api/receivers` não retornou 401

## Conclusão

A causa do incidente era deploy de produção desatualizado/incompleto (rotas do código atual ausentes, resultando em login que autentica mas não mantém sessão/navegação correta).

Após o redeploy correto para produção, as rotas existem e o login volta a funcionar normalmente.

---

## Redeploy final (estado atual do projeto)

Data/hora: 2026-06-25 21:34:35  
Produção (alias): https://connektpay.vercel.app

### Comandos e resultados

- `npm run lint` → **OK**
- `npm run build` → **OK**
- `npx vercel deploy --prod --yes` → **OK**

### Deployment

- Deployment (prod): `https://connektpay-q6gvz2nsf-leonardonoronha12-2214s-projects.vercel.app`
- Alias atualizado: `https://connektpay.vercel.app`
- Deployment id: `dpl_HHYuHzp2Ha3DkTU4yeak2WRm3dwX`

### Validações pós-deploy (rápidas)

- `/login` → **200**
- `/dashboard` (sem sessão) → **307** para `/login?returnTo=%2Fdashboard`
- `/ledger` (sem sessão) → **307** para `/login?returnTo=%2Fledger`
- `/antecipacao` (sem sessão) → **307** para `/login?returnTo=%2Fantecipacao`
- `/api/onboarding/ensure` (GET) → **405** (critério atendido: não é 404)
- `/api/dashboard` (sem sessão) → **401** (critério atendido: não é 404)

Observações:
- “Login funciona”, “/dashboard abre logado”, “/ledger sem Internal Server Error cru” e “menu hambúrguer não aparece no desktop” exigem validação com sessão/UI (não foram automatizadas aqui).

---

## Redeploy final (correções backend/fallback/UX)

Data/hora: 2026-06-26  
Produção (alias): https://connektpay.vercel.app

### Comandos e resultados

- `npm run lint` → **OK**
- `npm run build` → **OK**
- `npx vercel deploy --prod --yes` → **OK**

### Deployment

- Inspect: `https://vercel.com/leonardonoronha12-2214s-projects/connektpay/FnYknF3tX2ULcDWSy2iJpKXyLTuH`
- Deployment (prod): `https://connektpay-ijmi2qpgy-leonardonoronha12-2214s-projects.vercel.app`
- Alias atualizado: `https://connektpay.vercel.app`
- Deployment id: `dpl_FnYknF3tX2ULcDWSy2iJpKXyLTuH`

### Validações pós-deploy (rápidas)

Sem sessão (esperado redirecionar para login):

- `/dashboard` → **307** para `/login?returnTo=%2Fdashboard`
- `/ledger` → **307** para `/login?returnTo=%2Fledger`
- `/antecipacao` → **307** para `/login?returnTo=%2Fantecipacao`
- `/repasses` → **307** para `/login?returnTo=%2Frepasses`
- `/admin/*` → **307** para `/login?returnTo=...`

APIs sem sessão (esperado 401, não 500):

- `/api/dashboard?days=30` → **401**
- `/api/ledger` → **401**
- `/api/organization` → **401**
- `/api/me` → **401**
- `/api/kyc-requests` → **401**
- `/api/events` → **401**
- `/api/reconciliation` → **401**
- `/api/audit-logs` → **401**
- `/api/provider-settings` → **401**

Docs:

- `/docs` → **200**
- `/docs/search` → **200** (observação: o índice contém as strings `Falha ao carregar` e `Internal Server Error` como parte de conteúdo de documentação/checklists, não como erro do backend)

### Observações

- Validação “logado” (com usuário autenticado) não foi automatizada aqui por ausência de credenciais interativas no ambiente. O arquivo `tests/.auth/e2e-owner.json` não foi aceito como sessão válida em produção (requests continuaram retornando 307/401), sugerindo cookie/token expirado ou inválido.
