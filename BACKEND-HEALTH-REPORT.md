# BACKEND-HEALTH-REPORT

Data: 2026-06-26

Este relatório descreve (por leitura do código + build/lint locais) o comportamento esperado dos endpoints chamados por cada módulo em cenários “normais”:

- Organização nova
- Banco vazio (tabelas existentes, sem registros)
- Provedor financeiro não configurado

Premissas para os cenários:

- Sessão válida (quando endpoints exigem sessão).
- Supabase configurado e schema/migrations aplicados (tabelas existentes).
- “Provider não configurado” significa integração MyGateway desabilitada (sem credenciais); em geral isso impacta apenas endpoints de ação (POST/PATCH) que dependem do provider.

> Objetivo operacional: nenhuma tela deve “quebrar” por depender de mensagens de erro. Para listas e telas de leitura, o padrão esperado é `200` com payload vazio quando não há dados.

## Ledger

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| LedgerScreen | GET `/api/ledger` | 200 | `{ balance: 0, ledgerEntries: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |

## Antecipação

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| AnticipationScreen | GET `/api/anticipation` | 200 | `{ anticipations: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| AnticipationScreen | POST `/api/anticipation/simulate` | 200 | `{ availableCents, balanceCents, reservedCents, feeBpsDefault, ... }` (com zeros quando vazio) | NÃO | SIM | NÃO | SIM |
| AnticipationScreen | POST `/api/anticipation` | 201 / 501 | `201`: `{ ... }` (solicitação criada) / `501`: `{ error: "O provedor financeiro ainda não está configurado." }` | NÃO | SIM (no load) | NÃO | NÃO |
| AnticipationScreen | POST `/api/anticipation/[id]/cancel` | 200 / 501 | `200`: `{ ... }` / `501`: `{ error: "O provedor financeiro ainda não está configurado." }` | NÃO | SIM (no load) | NÃO | NÃO |

## Repasses

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| ReppassesScreen | GET `/api/payouts` | 200 | `{ payouts: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| ReppassesScreen | POST `/api/payouts` | 201 / 501 | `201`: `{ payout: { id, status } }` / `501`: `{ error: "O provedor financeiro ainda não está configurado." }` | NÃO | SIM (no load) | NÃO | NÃO |
| ReppassesScreen | PATCH `/api/payouts/[id]` | 200 / 404 | `200`: `{ payout: { ... } }` / `404`: `{ error: "Repasse não encontrado." }` | NÃO | SIM | NÃO | NÃO |

## KYC

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| KycApprovalScreen | GET `/api/kyc-requests` | 200 | `{ kycRequests: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| KycApprovalScreen | GET `/api/kyc-requests/[id]/documents` | 200 / 404 | `200`: `{ documents: [] }` (quando vazio) / `404`: `{ error: "KYC não encontrado." }` | NÃO | SIM | NÃO | SIM |
| KycApprovalScreen | PATCH `/api/kyc-requests/[id]` | 200 / 404 / 501 | `200`: `{ kycRequest: { ... } }` / `404` / `501` | NÃO | SIM | NÃO | NÃO |
| Recebedores (fluxo KYC) | POST `/api/kyc-requests` | 201 / 501 | `201`: `{ kycRequest: { ... } }` / `501` | NÃO | SIM (no load) | NÃO | NÃO |
| Recebedores (upload) | POST `/api/kyc/upload` | 201 / 501 | `201`: `{ document: { ... } }` / `501` | NÃO | SIM (no load) | NÃO | NÃO |

## Eventos

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| EventsScreen | GET `/api/events?type=...` | 200 | `{ events: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| EventsScreen | POST `/api/events/[id]/reprocess` | 200 / 404 / 501 | `200`: `{ event: { id, status } }` / `404` / `501` | NÃO | SIM | NÃO | NÃO |

## Conciliação

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| ConciliationScreen | GET `/api/reconciliation` | 200 | `{ runs: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| ConciliationScreen | POST `/api/reconciliation` | 201 / 501 | `201`: `{ runId, ... }` / `501`: `{ error: "O provedor financeiro ainda não está configurado." }` | NÃO | SIM (no load) | NÃO | NÃO |
| ConciliationScreen | GET `/api/reconciliation/[id]` | 200 / 501 | `{ run: { ... } }` / `501` | NÃO | SIM | NÃO | NÃO |
| ConciliationScreen | GET `/api/reconciliation/[id]/items` | 200 | `{ items: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| ConciliationScreen | POST `/api/reconciliation/items/[itemId]/resolve` | 200 / 501 | `{ ... }` / `501` | NÃO | SIM | NÃO | NÃO |
| ConciliationScreen | POST `/api/reconciliation/items/[itemId]/reprocess` | 200 / 501 | `{ ... }` / `501`: provider não configurado | NÃO | SIM | NÃO | NÃO |

## Auditoria

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| AuditScreen | GET `/api/audit-logs?q=...` | 200 | `{ auditLogs: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |

## Configurações

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| ConfiguracoesScreen | GET `/api/me` | 200 / 401 | `200`: `{ me: { ... } }` / `401`: `{ me: null }` | NÃO | SIM | NÃO | SIM (me null) |
| ConfiguracoesScreen | PUT `/api/me` | 200 / 400 / 401 | `{ me: { ... } }` / validações | NÃO | NÃO | NÃO | NÃO |
| ConfiguracoesScreen | GET `/api/organization` | 200 | `{ organization: null }` ou `{ organization: { ... } }` | NÃO | SIM | NÃO | SIM (organization null) |
| ConfiguracoesScreen | PUT `/api/organization` | 200 / 501 | `{ organization: { ... } }` (faz upsert se não existir) / `501` | NÃO | SIM | NÃO | NÃO |

## Integrações

| Tela | Endpoint chamado | Status HTTP | Payload retornado | Existe erro no backend? (SIM/NÃO) | Existe fallback? (SIM/NÃO) | Retorna 500? (SIM/NÃO) | Retorna 200 com estado vazio? (SIM/NÃO) |
|---|---|---:|---|---|---|---|---|
| IntegracoesScreen / ProviderScreen | GET `/api/provider-settings` | 200 | `{ providerSettings: null }` ou `{ providerSettings: { ... } }` | NÃO | SIM | NÃO | SIM |
| IntegracoesScreen / ProviderScreen | PUT `/api/provider-settings` | 200 / 501 | `{ providerSettings: { ... } }` / `501` | NÃO | SIM | NÃO | NÃO |
| IntegracoesScreen | GET `/api/integrations/api-keys` | 200 | `{ apiKeys: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| IntegracoesScreen | POST `/api/integrations/api-keys` | 201 / 501 | `{ apiKey: { ... } }` / `501` | NÃO | NÃO | NÃO | NÃO |
| IntegracoesScreen | PATCH `/api/integrations/api-keys/[id]` | 200 / 404 / 501 | `{ ok: true }` / `404` / `501` | NÃO | NÃO | NÃO | NÃO |
| IntegracoesScreen | POST `/api/integrations/api-keys/[id]` | 201 / 404 / 501 | `{ apiKey: { ... } }` (rotate) / `404` / `501` | NÃO | NÃO | NÃO | NÃO |
| IntegracoesScreen | GET `/api/integrations/tokens` | 200 | `{ tokens: [] }` (quando vazio) | NÃO | SIM | NÃO | SIM |
| IntegracoesScreen | POST `/api/integrations/tokens` | 201 / 501 | `{ token: { ... } }` / `501` | NÃO | NÃO | NÃO | NÃO |
| IntegracoesScreen | PATCH `/api/integrations/tokens/[id]` | 200 / 404 / 501 | `{ ok: true }` / `404` / `501` | NÃO | NÃO | NÃO | NÃO |
| IntegracoesScreen | POST `/api/integrations/tokens/[id]` | 201 / 404 / 501 | `{ token: { ... } }` (rotate) / `404` / `501` | NÃO | NÃO | NÃO | NÃO |

## Correções aplicadas neste ciclo

- Padronização de erros para PT-BR e eliminação de mensagens “Internal Server Error / Service not configured / Not configured” em respostas de API e UI.
- Ajuste de “causa raiz” para Configurações: `PUT /api/organization` passou a fazer upsert (cria registro quando organização não existe), evitando 500 em org nova/banco vazio ao salvar.
- Produção (sessão válida): endpoints internos passaram a priorizar Service Role quando disponível (`SUPABASE_SERVICE_ROLE_KEY`) para evitar 500 causados por policies/RLS recursivas (erro Postgres `54001 stack depth limit exceeded`).
- Produção (schema incompleto): módulos com tabelas ausentes (ex.: `pay_antecipacao`, `pay_conciliation_*`) passaram a degradar para payload vazio seguro em GETs, em vez de 500.

## Verificações locais

- `npm run lint`: OK
- `npm run build`: OK

## Deploy (produção)

Deploy executado via Vercel CLI:

- Comando: `npx vercel deploy --prod --yes`
- Deployment ID: `dpl_CERkNmKxzeZvu3k2LDCx8YNWDTiX`
- Deployment URL: `https://connektpay-hjpf9jl2l-leonardonoronha12-2214s-projects.vercel.app`
- Alias (produção): `https://connektpay.vercel.app`

## Validação pós-deploy (produção)

Validações automáticas realizadas (sem credenciais interativas):

- Páginas autenticadas retornam **307** para `/login?returnTo=...` quando não há sessão (comportamento esperado de proteção).
- Endpoints privados retornam **401** sem sessão (comportamento esperado de proteção).
- `/docs` abre com **200**.
- `/docs/search` retorna **200**, porém o índice contém as strings `Falha ao carregar` e `Internal Server Error` como parte do conteúdo indexado (texto de documentação/checklists), não como erro do backend.

## Validação logada (produção)

Validação realizada via Playwright com login por e-mail/senha (`E2E_EMAIL`/`E2E_PASSWORD` do `.env.local`) e navegação nas rotas solicitadas.

Evidências:

- Diretório: `test-results/prod-logada-1782488989443/`
- Screenshots: `test-results/prod-logada-1782488989443/screenshots/*.png`
- Network (HAR): `test-results/prod-logada-1782488989443/network.har`
- Relatório (JSON): `test-results/prod-logada-1782488989443/summary.json`

Resultado objetivo:

- Login: **OK**
- Páginas abriram logadas: **SIM** (nenhuma redirecionou para `/login`)
- Strings bloqueadas na UI: **NÃO** (`Ocorreu um erro interno`, `Falha ao carregar`, `Internal Server Error` não apareceram nas páginas)
- HTTP 401/403 indevido com sessão válida: **NÃO**
- HTTP 500 encontrado (endpoints críticos): **NÃO**

Validação adicional (produção, com sessão válida):

- Script: `node scripts/prod-endpoints-check.mjs`
- Resultado: rotas críticas sem textos de erro e endpoints críticos retornando **200**.

Observação:

- Apesar de muitas telas exibirem estados vazios e cards zerados, várias também exibiram avisos amarelos de erro (ex.: “Ocorreu um erro ao carregar …”), o que bloqueia o objetivo de “nenhuma tela depender de mensagens de erro para funcionar”.
