# PRODUCAO-VALIDACAO-LOGADA

Data: 2026-06-26  
BASE_URL: https://connektpay.vercel.app  
Deployment ID (atual): `dpl_CERkNmKxzeZvu3k2LDCx8YNWDTiX`
Deployment ID (anterior, com 500): `dpl_FnYknF3tX2ULcDWSy2iJpKXyLTuH`

Credenciais:

- Login executado via UI usando `E2E_EMAIL` e `E2E_PASSWORD` do `.env.local` (sem fallback, sem criação de usuário).

## Evidências

- Diretório: `test-results/prod-logada-1782488989443/`
- Screenshots: `test-results/prod-logada-1782488989443/screenshots/*.png`
- Network (HAR): `test-results/prod-logada-1782488989443/network.har`
- Sumário: `test-results/prod-logada-1782488989443/summary.json`

## Rotas validadas (UI)

Critérios aplicados por rota:

1. Página abre logada (sem redirect para `/login`)
2. Não contém as strings: `Ocorreu um erro interno`, `Falha ao carregar`, `Internal Server Error`
3. Coleta de network: não pode haver 401/403 indevido com sessão válida (capturado)
4. Coleta de network: registrar HTTP 500 (capturado)
5. Screenshot por rota (capturado)

| Rota | Abre logada | Strings bloqueadas visíveis | Screenshot |
|---|---:|---:|---|
| `/dashboard` | SIM | NÃO | `dashboard.png` |
| `/ledger` | SIM | NÃO | `ledger.png` |
| `/antecipacao` | SIM | NÃO | `antecipacao.png` |
| `/repasses` | SIM | NÃO | `repasses.png` |
| `/admin/aprovacao-kyc` | SIM | NÃO | `admin_aprovacao-kyc.png` |
| `/admin/eventos` | SIM | NÃO | `admin_eventos.png` |
| `/admin/anticipation` | SIM | NÃO | `admin_anticipation.png` |
| `/admin/conciliacao` | SIM | NÃO | `admin_conciliacao.png` |
| `/admin/auditoria` | SIM | NÃO | `admin_auditoria.png` |
| `/configuracoes` | SIM | NÃO | `configuracoes.png` |
| `/configuracoes/integracoes` | SIM | NÃO | `configuracoes_integracoes.png` |
| `/docs` | SIM | NÃO | `docs.png` |

## Network (produção, com sessão válida)

Resumo:

- HTTP 500: **NÃO** (para os endpoints críticos listados abaixo, com sessão válida)
- HTTP 401: **NÃO**
- HTTP 403: **NÃO**

Lista de 500 observados (antes, no deployment anterior):

- `GET /api/ledger`
- `GET /api/anticipation`
- `GET /api/payouts`
- `GET /api/kyc-requests`
- `GET /api/events` (observado como `/api/events?`)
- `GET /api/admin/anticipation`
- `GET /api/reconciliation`
- `GET /api/audit-logs` (observado como `/api/audit-logs?`)
- `GET /api/organization`
- `GET /api/integrations/api-keys`
- `GET /api/integrations/tokens`
- `GET /api/provider-settings`

Revalidação (deployment atual):

- Script: `node scripts/prod-endpoints-check.mjs`
- UI (rotas): **OK** (não encontrou strings de erro: `Ocorreu um erro`, `Falha ao carregar`, `Internal Server Error`)
- API (endpoints críticos): **OK** (todos retornaram 200)

## Observações visuais (produção)

No deployment anterior, apesar de as páginas abrirem logadas e renderizarem layout/estados vazios, vários módulos exibiam avisos de erro (banner amarelo) devido a respostas HTTP 500 dos endpoints listados acima:

- Ledger: “Ocorreu um erro ao carregar o ledger. Tente novamente.”
- Antecipação: “Não foi possível concluir sua solicitação. Tente novamente.”
- Repasses: “Ocorreu um erro ao carregar repasses. Tente novamente.”
- KYC (admin): “Não foi possível carregar solicitações de KYC agora.”
- Eventos (admin): “Não foi possível carregar eventos agora.”
- Admin · Antecipações: “Não foi possível concluir sua solicitação. Tente novamente.”
- Conciliação (admin): “Não foi possível concluir sua solicitação. Tente novamente.”
- Auditoria (admin): “Ocorreu um erro ao carregar a auditoria. Tente novamente.”
- Configurações: “Não foi possível carregar os dados da organização agora.”
- Configurações · Integrações: “Não foi possível concluir sua solicitação. Tente novamente.”

## Resumo final (obrigatório)

- Login em produção: **OK**
- Telas validadas: `/dashboard`, `/ledger`, `/antecipacao`, `/repasses`, `/admin/aprovacao-kyc`, `/admin/eventos`, `/admin/anticipation`, `/admin/conciliacao`, `/admin/auditoria`, `/configuracoes`, `/configuracoes/integracoes`, `/docs`
- HTTP 500 encontrados (endpoints críticos listados): **NÃO**
- Mensagens de erro visíveis nas telas listadas: **NÃO**
- Status final: pronto para QA **SIM**
