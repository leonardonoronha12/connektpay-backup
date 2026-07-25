# FASE 2E - Antecipacao Interna - Implementacao

Data: 2026-07-14

## Escopo entregue

- Camada interna de antecipacao implementada sem integracao com MyGateway.
- Nenhuma API externa foi adicionada ao fluxo interno.
- Nenhuma movimentacao financeira real foi executada.
- Recebedores, KYC, Split, Assinaturas, Repasses e Dashboard legado foram preservados fora do necessario para isolamento da fase.

## Entregas principais

### Banco

- Migration `supabase/migrations/20260714000008_phase2e_anticipation_internal.sql`
  - adiciona `is_internal`;
  - adiciona `eligible_amount_centavos`;
  - adiciona `estimated_fee_bps` e `estimated_fee_centavos`;
  - adiciona `expected_settlement_days` e `expected_settlement_at`;
  - adiciona `paid_at`, `rejected_at`, `rejection_reason`, `internal_notes` e `eligibility_snapshot`;
  - cria indices de segregacao interna por organizacao, status e recebedor.
- Migration `supabase/migrations/20260714000009_phase2e_anticipation_remote_compat.sql`
  - reconcilia o legado remoto `anticipation_requests` com `pay_antecipacao`;
  - adiciona colunas historicas ausentes no remoto, incluindo `acquirer_anticipation_id`;
  - cria `pay_antecipacao_events`;
  - habilita RLS e policies para o dominio de antecipacao.

### Backend

- `lib/env.ts`
  - adicionada a flag `ANTICIPATION_PROVIDER_ENABLED=false`.
- `lib/anticipation-core.ts`
  - status internos padronizados;
  - normalizacao de drafts;
  - simulacao interna tolerante a cenarios invalidos para devolver validacao de negocio;
  - validacoes de elegibilidade, saldo, duplicidade, bloqueio e estado final;
  - bloqueio de `provider_pending`, `provider_processing`, `paid` e `failed` sem integracao real.
- `lib/anticipation-service.ts`
  - bootstrap interno;
  - simulacao, historico e detalhe;
  - criacao de `draft` e `requested`;
  - transicoes `under_review`, `approved`, `rejected`, `scheduled`, `cancelled` e `delete`;
  - auditoria obrigatoria em `audit_logs`;
  - timeline em `pay_antecipacao_events`;
  - isolamento de registros internos por `is_internal=true`;
  - nenhum `provider_reference` inventado;
  - nenhuma escrita financeira real em ledger.
- `lib/webhook-processor.ts`
  - alinhamento dos status tipados do provider legado para `provider_processing` e `paid` no caminho externo.

### APIs internas

- `app/api/anticipation/route.ts`
- `app/api/anticipation/simulate/route.ts`
- `app/api/anticipation/[id]/route.ts`
- `app/api/anticipation/[id]/cancel/route.ts`
- `app/api/admin/anticipation/route.ts`
- `app/api/anticipations/route.ts`

Fluxos entregues:

- consultar elegibilidade;
- simular antecipacao;
- criar rascunho;
- solicitar antecipacao;
- consultar historico;
- revisar;
- aprovar;
- reprovar;
- agendar;
- cancelar;
- excluir `draft`, `rejected` e `cancelled`.

### Frontend

- `app/(app)/antecipacao/page.tsx`
- `app/(app)/admin/anticipation/page.tsx`
- `components/anticipation/AnticipationInternalScreen.tsx`
- `components/ui/Badge.tsx`

UX entregue:

- onboarding;
- ajuda contextual;
- simulador elegante;
- timeline;
- proximos passos;
- toasts;
- alerts;
- estados vazios educativos;
- mensagem explicita:
  - `A antecipacao financeira sera habilitada apos a integracao com a MyGateway.`

### Testes

- `tests/anticipation.spec.ts`
  - simulacao;
  - elegibilidade;
  - solicitacao;
  - saldo insuficiente;
  - duplicidade;
  - organizacao;
  - aprovacao;
  - reprovacao;
  - cancelamento;
  - exclusao;
  - RBAC;
  - auditoria.

## Bloqueadores encontrados e corrigidos

- O remoto nao tinha a estrutura consolidada de `pay_antecipacao`; havia apenas o legado `anticipation_requests`.
- A migration historica do modulo de antecipacao falhava no caminho de rename por nao garantir `acquirer_anticipation_id`.
- O endpoint de simulacao tinha tipagem incompleta para `receiverId`.
- O simulador/core ainda propagava erro generico em cenarios de saldo insuficiente em vez de retornar validacao de negocio.
- O `webhook-processor` ainda comparava status antigos (`approved` e `executed`) em um fluxo que agora tipa `provider_processing` e `paid`.

## Resultado

- Antecipacao interna operacional.
- Simulador operacional.
- Auditoria operacional.
- Historico operacional.
- Provider continua desabilitado.
