# RBAC - Validação (QA)

Matriz gerada a partir de validação automatizada no ambiente (`https://connektpay.vercel.app`) com os usuários:

- qa.owner@connektpay.com
- qa.admin@connektpay.com
- qa.financeiro@connektpay.com

## Credenciais QA (produção)

Usuário | Senha | Role | Login testado | Dashboard abriu
---|---|---|---|---
qa.owner@connektpay.com | QaOwner@2026! | owner | SIM | SIM
qa.admin@connektpay.com | QaAdmin@2026! | admin | SIM | SIM
qa.financeiro@connektpay.com | QaFin@2026! | financeiro | SIM | SIM

## Matriz de Telas

Tela | Owner | Admin | Financeiro | Resultado
---|---|---|---|---
Dashboard (/dashboard) | SIM | SIM | SIM | OK
Transações (/transacoes) | SIM | SIM | SIM | OK
Links de Pagamento (/links-pagamento) | SIM | SIM | NÃO | OK
Novo Link de Pagamento (/links-pagamento/novo) | SIM | SIM | NÃO | OK
Recebedores (/recebedores) | SIM | SIM | NÃO | OK
Assinaturas (Resumo) (/assinaturas) | SIM | SIM | SIM | OK
Assinaturas (/subscriptions) | SIM | SIM | SIM | OK
Planos (/subscriptions/plans) | SIM | SIM | NÃO | OK
Novo Plano (/subscriptions/new) | SIM | SIM | NÃO | OK
Ledger (/ledger) | SIM | NÃO | SIM | OK
Antecipação (/antecipacao) | SIM | NÃO | SIM | OK
Repasses (/repasses) | SIM | NÃO | SIM | OK
Configurações (/configuracoes) | SIM | NÃO | NÃO | OK
Configurações · Integrações (/configuracoes/integracoes) | SIM | NÃO | NÃO | OK
Configurações · Provedor (/configuracoes/provedor) | SIM | NÃO | NÃO | OK
Admin · Painel (/admin/painel) | SIM | SIM | NÃO | OK
Admin · Aprovação KYC (/admin/aprovacao-kyc) | SIM | SIM | NÃO | OK
Admin · Eventos (/admin/eventos) | SIM | SIM | NÃO | OK
Admin · Antecipações (/admin/anticipation) | SIM | SIM | NÃO | OK
Admin · Conciliação (/admin/conciliacao) | SIM | SIM | SIM | OK
Admin · Auditoria (/admin/auditoria) | SIM | SIM | NÃO | OK
Admin · Provedor Financeiro (/admin/provedor-financeiro) | SIM | NÃO | NÃO | OK

## Sidebar

- Sidebar muda conforme o perfil: SIM
- Owner items: Dashboard, Transações, Links de Pagamento, Assinaturas, Recebedores, Ledger, Antecipação, Repasses, Painel, Aprovação KYC, Eventos, Antecipações, Conciliação, Auditoria, Provedor Financeiro, Configurações, Integrações
- Admin items: Dashboard, Transações, Links de Pagamento, Assinaturas, Recebedores, Painel, Aprovação KYC, Eventos, Antecipações, Conciliação, Auditoria
- Financeiro items: Dashboard, Transações, Assinaturas, Ledger, Antecipação, Repasses, Conciliação

## APIs (RBAC)

API | Owner | Admin | Financeiro | Resultado
---|---|---|---|---
/api/provider-settings | 200 | 403 | 403 | OK
/api/integrations/api-keys | 200 | 403 | 403 | OK
/api/integrations/tokens | 200 | 403 | 403 | OK
/api/audit-logs | 200 | 200 | 403 | OK
/api/events | 200 | 200 | 403 | OK
/api/kyc-requests | 200 | 200 | 403 | OK
/api/anticipation | 200 | 403 | 200 | OK
/api/anticipation/simulate | 200 | 403 | 200 | OK
/api/ledger | 200 | 403 | 200 | OK
/api/reconciliation | 200 | 200 | 200 | OK
/api/receivers | 200 | 200 | 403 | OK
/api/payment-links | 200 | 200 | 403 | OK
/api/payouts | 200 | 403 | 200 | OK
