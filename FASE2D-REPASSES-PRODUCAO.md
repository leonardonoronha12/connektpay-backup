# FASE 2D - Repasses Internos - Producao

Data: 2026-07-14

## Publicacao

- Deploy de producao publicado via Vercel CLI.
- Alias ativo:
  - `https://connektpay.vercel.app`

## Banco remoto

- Projeto Supabase validado:
  - `tecnqmtzdefeacbfdyma`
- Migrations aplicadas em producao:
  - `20260713000004_phase2d_payouts_internal.sql`
  - `20260714000005_phase2d_payouts_requested_at.sql`
  - `20260714000006_phase2d_payouts_lifecycle_dates.sql`
  - `20260714000007_phase2d_payout_events.sql`

## Correcoes de producao aplicadas

- O banco remoto usado pelo deploy nao tinha todos os campos assumidos pela camada interna de `payouts`.
- Foram adicionados em producao:
  - `requested_at`
  - `paid_at`
  - `failed_at`
  - `canceled_at`
- A tabela `payout_events` tambem precisou ser criada em producao para suportar o historico obrigatorio da fase.
- A camada interna foi desacoplada de `provider_status`, evitando dependencia de um campo legado ausente no remoto.

## Homologacao final

### APIs internas

- `GET /api/payouts-internal` -> `200`
- `POST /api/payouts-internal/simulate` -> `200`
- `POST /api/payouts-internal` -> `201`
- `PATCH /api/payouts-internal/[id]` -> `200`
- `GET /api/payouts-internal/[id]` -> `200`
- `DELETE /api/payouts-internal/[id]` -> `200`
- `GET /api/audit-logs?q=payout_internal` -> `200`

### Fluxo homologado

- draft -> update -> delete
- requested -> under_review -> approved -> scheduled -> cancel -> delete
- requested -> under_review -> rejected -> delete

### Garantias confirmadas

- nenhuma chamada para MyGateway
- nenhuma transferencia real
- nenhum `provider_reference` inventado
- nenhum webhook externo do provider
- nenhum processamento financeiro real
- historico em `payout_events`
- auditoria em `audit_logs`

## Status final

- Repasses internos prontos em producao.
- Simulador funcionando em producao.
- Auditoria funcionando em producao.
- Sem regressao identificada nos checks executados desta fase.
