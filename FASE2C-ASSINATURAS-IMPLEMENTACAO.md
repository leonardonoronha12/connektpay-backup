# FASE 2C - Assinaturas e Recorrencia Interna - Implementacao

Data: 2026-07-13

## Escopo entregue

- Camada interna de Assinaturas implementada sem integracao com MyGateway.
- Nenhuma chamada externa ao provider foi adicionada.
- Nenhum fluxo de Payment Links, Recebedores/KYC, Split, Antecipacao ou Repasses foi alterado.

## Entregas principais

### Banco

- Migration `supabase/migrations/20260713000003_phase2c_subscriptions_internal.sql` consolidada para:
  - criar a base de recorrencia se estiver ausente no projeto remoto;
  - adicionar os campos internos faltantes em `pay_plano` e `pay_assinatura`;
  - manter compatibilidade com o schema ja existente.

### Backend

- `lib/env.ts`
  - adicionada a flag `SUBSCRIPTIONS_PROVIDER_ENABLED=false`.
- `lib/subscriptions-internal-core.ts`
  - normalizacao de drafts;
  - validacoes internas;
  - simulacao de recorrencia;
  - bloqueio de `provider_synced` sem integracao real.
- `lib/subscriptions-internal-service.ts`
  - CRUD interno de planos;
  - CRUD interno de adesoes;
  - duplicacao;
  - pausa, reativacao e cancelamento;
  - auditoria interna obrigatoria no mesmo contexto da operacao.

### APIs internas

- `app/api/subscriptions-internal/route.ts`
- `app/api/subscriptions-internal/plans/route.ts`
- `app/api/subscriptions-internal/plans/[id]/route.ts`
- `app/api/subscriptions-internal/plans/[id]/duplicate/route.ts`
- `app/api/subscriptions-internal/subscriptions/route.ts`
- `app/api/subscriptions-internal/subscriptions/[id]/route.ts`
- `app/api/subscriptions-internal/simulate/route.ts`

### Frontend

- `app/(app)/assinaturas-internas/page.tsx`
- `components/subscriptions/SubscriptionsInternalScreen.tsx`
- integracao em navegacao, metadata e prefetch.

### Auditoria

- Acoes registradas:
  - `CREATE`
  - `UPDATE`
  - `ACTIVATE`
  - `DEACTIVATE`
  - `PAUSE`
  - `RESUME`
  - `CANCEL`
  - `DELETE`

## Correcao de bloqueador encontrada na homologacao

- O projeto remoto conectado ao deploy nao tinha a base de recorrencia exposta no schema cache do Supabase.
- A migration da Fase 2C foi ajustada para ser autossuficiente e criar a base de recorrencia necessaria quando ausente.
- A auditoria da Fase 2C foi corrigida para usar o mesmo contexto Supabase da operacao interna, impedindo falha silenciosa de gravacao em `audit_logs`.

## Resultado

- Assinaturas internas operacionais.
- Simulador interno operacional.
- Auditoria operacional.
- Provider continua desabilitado.
