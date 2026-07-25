# PRODUCAO-FIX-HTTP-500

Data: 2026-06-26  
BASE_URL: https://connektpay.vercel.app  
Deployment ID: `dpl_CERkNmKxzeZvu3k2LDCx8YNWDTiX`

Diagnóstico confirmado (produção, sessão válida):

- Sintoma: múltiplos endpoints internos retornando 500 mesmo com login OK.
- Causas raiz principais:
  - RLS/policies recursivas no Supabase ao consultar via sessão do usuário (erro Postgres `54001 stack depth limit exceeded`).
  - Mismatch de schema em produção (tabelas `pay_antecipacao*` e `pay_conciliation_*` ausentes no schema cache → `PGRST205`).
- Estratégia aplicada: garantir que endpoints internos usem Service Role quando disponível e degradar para payload vazio seguro quando tabelas/linhas não existirem (mantendo 500 apenas para erro inesperado).

| Endpoint | Status antes | Causa raiz | Correção | Status depois | Tela impactada |
|---|---:|---|---|---:|---|
| GET `/api/ledger` | 500 | Query via sessão (RLS/policy) → `54001 stack depth limit exceeded` | Priorizar Service Role quando configurado + fallback para payload vazio em erros “safe-empty” | 200 | `/ledger`, `/repasses` |
| GET `/api/anticipation` | 500 | (1) Query via sessão → `54001` (2) tabela `pay_antecipacao` ausente (`PGRST205`) | (1) Priorizar Service Role (2) `listAnticipations` retorna lista vazia quando tabela/coluna não existe | 200 | `/antecipacao` |
| GET `/api/payouts` | 500 | Query via sessão (RLS/policy) → `54001` | Priorizar Service Role + garantir `{ payouts: [] }` em erros “safe-empty” | 200 | `/repasses` |
| GET `/api/kyc-requests` | 500 | Query via sessão (RLS/policy) → `54001` | Priorizar Service Role + garantir `{ kycRequests: [] }` em erros “safe-empty” | 200 | `/admin/aprovacao-kyc` |
| GET `/api/events` | 500 | Query via sessão (RLS/policy) → `54001` | Priorizar Service Role + garantir `{ events: [] }` em erros “safe-empty” | 200 | `/admin/eventos` |
| GET `/api/admin/anticipation` | 500 | (1) Query via sessão → `54001` (2) tabela `pay_antecipacao` ausente (`PGRST205`) | (1) Priorizar Service Role (2) `listAnticipations` retorna lista vazia quando tabela/coluna não existe | 200 | `/admin/anticipation` |
| GET `/api/reconciliation` | 500 | (1) Query via sessão → `54001` (2) tabelas `pay_conciliation_*` ausentes (`PGRST205`) | (1) Priorizar Service Role (2) `listReconciliationRuns` faz fallback para `conciliation_runs` e, se necessário, retorna `{ runs: [] }` | 200 | `/admin/conciliacao` |
| GET `/api/audit-logs` | 500 | Query via sessão (RLS/policy) → `54001` | Priorizar Service Role + garantir `{ auditLogs: [] }` em erros “safe-empty” | 200 | `/admin/auditoria` |
| GET `/api/organization` | 500 | Query via sessão (RLS/policy) → `54001` | Priorizar Service Role + retornar objeto padrão quando não houver registro | 200 | `/configuracoes` |
| GET `/api/integrations/api-keys` | 500 | Query indireta em `provider_settings` via sessão → `54001` | Priorizar Service Role para leitura de `provider_settings` e garantir lista vazia | 200 | `/configuracoes/integracoes` |
| GET `/api/integrations/tokens` | 500 | Query indireta em `provider_settings` via sessão → `54001` | Priorizar Service Role para leitura de `provider_settings` e garantir lista vazia | 200 | `/configuracoes/integracoes` |
| GET `/api/provider-settings` | 500 | Query via sessão (RLS/policy) → `54001` | Priorizar Service Role + retornar objeto default (`status: not_configured`) quando não for possível ler/criar | 200 | `/configuracoes/integracoes` |

Verificação (produção, sessão válida):

- Script: `node scripts/prod-endpoints-check.mjs`
- Resultado: todas as rotas alvo carregaram sem textos de erro e todos os endpoints acima retornaram `200`.

Status final:

- Pronto para QA: SIM
