# FASE 2D - Repasses Internos - Implementacao

Data: 2026-07-14

## Escopo entregue

- Camada interna de Repasses implementada sem integracao com MyGateway.
- Nenhuma chamada externa ao provider foi adicionada.
- Nenhuma movimentacao financeira real foi executada.
- Recebedores/KYC, Split, Assinaturas e o fluxo legado de repasses foram preservados fora do necessario para isolamento.

## Entregas principais

### Banco

- Migration `supabase/migrations/20260713000004_phase2d_payouts_internal.sql`
  - adiciona `is_internal`;
  - adiciona `bank_account_snapshot`;
  - adiciona `approved_at`, `rejected_at`, `rejection_reason`, `internal_notes`;
  - cria indices de segregacao interna.
- Migration `supabase/migrations/20260714000005_phase2d_payouts_requested_at.sql`
  - adiciona `requested_at` no remoto para suportar data real da solicitacao.
- Migration `supabase/migrations/20260714000006_phase2d_payouts_lifecycle_dates.sql`
  - adiciona `paid_at`, `failed_at` e `canceled_at` no remoto.
- Migration `supabase/migrations/20260714000007_phase2d_payout_events.sql`
  - cria `payout_events` no remoto para historico interno obrigatorio.

### Backend

- `lib/env.ts`
  - adicionada a flag `PAYOUT_PROVIDER_ENABLED=false`.
- `lib/payouts-internal-core.ts`
  - status internos padronizados;
  - normalizacao de drafts;
  - simulacao de valor liquido;
  - validacoes de saldo, recebedor, KYC, duplicidade, conflito e estado final;
  - bloqueio de `provider_pending`, `provider_processing`, `paid` e `failed` sem provider real.
- `lib/payouts-internal-service.ts`
  - bootstrap interno;
  - criacao, edicao, detalhe e exclusao de solicitacoes internas;
  - historico em `payout_events`;
  - auditoria obrigatoria em `audit_logs`;
  - mascaramento bancario;
  - remocao da dependencia interna de `provider_status`, evitando acoplamento a coluna legado ausente no remoto.

### APIs internas

- `app/api/payouts-internal/route.ts`
- `app/api/payouts-internal/[id]/route.ts`
- `app/api/payouts-internal/simulate/route.ts`

Fluxos entregues:

- criar solicitacao;
- revisar;
- aprovar;
- reprovar;
- agendar;
- cancelar;
- excluir `draft`, `rejected` e `cancelled`;
- consultar historico;
- filtrar;
- exportar;
- simular valor liquido.

### Frontend

- `app/(app)/repasses-internos/page.tsx`
- `components/payouts/PayoutsInternalScreen.tsx`
- integracao em navegacao, metadata, RBAC e prefetch.

### Ajustes de isolamento

- Filtros `is_internal=false` mantidos no legado para nao misturar repasses internos com repasses externos ou historicos antigos.
- Dashboard, API publica e conciliacao continuam ignorando repasses internos.

### Auditoria

- Acoes registradas:
  - `CREATE`
  - `REQUEST`
  - `APPROVE`
  - `REJECT`
  - `SCHEDULE`
  - `CANCEL`
  - `UPDATE`
  - `DELETE`

## Bloqueadores encontrados e corrigidos

- O remoto nao tinha colunas legadas assumidas pela camada interna:
  - `requested_at`
  - `paid_at`
  - `failed_at`
  - `canceled_at`
- O remoto tambem nao tinha `payout_events`, impedindo historico e quebrando a criacao em producao.
- A camada interna ainda lia `provider_status`, mas a Fase 2D nao deve depender de status do provider com a flag desligada.

## Resultado

- Repasses internos operacionais.
- Simulador operacional.
- Auditoria operacional.
- Historico operacional.
- Provider continua desabilitado.
