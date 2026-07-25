# FASE 2C - Assinaturas e Recorrencia Interna - Producao

Data: 2026-07-13

## Publicacao

- Deploy de producao publicado via Vercel CLI.
- Alias ativo:
  - `https://connektpay.vercel.app`

## Banco remoto

- Projeto Supabase validado:
  - `tecnqmtzdefeacbfdyma`
- Migration aplicada em producao:
  - `20260713000003_phase2c_subscriptions_internal.sql`

## Correcao de producao aplicada

- O banco remoto estava sem a base de recorrencia requerida pela Fase 2C.
- A migration da Fase 2C foi aplicada em um `workdir` isolado contendo apenas o historico remoto necessario e a migration da fase, evitando puxar migrations pendentes de outros modulos.
- Apos isso, `pay_plano`, `pay_pagador` e `pay_assinatura` passaram a responder corretamente no schema exposto.

## Homologacao final

### APIs internas

- `GET /api/subscriptions-internal` -> `200`
- `POST /api/subscriptions-internal/simulate` -> `200`
- `POST /api/subscriptions-internal/plans` -> `201`
- `PATCH /api/subscriptions-internal/plans/[id]` -> `200`
- `POST /api/subscriptions-internal/plans/[id]/duplicate` -> `201`
- `POST /api/subscriptions-internal/subscriptions` -> `201`
- `PATCH /api/subscriptions-internal/subscriptions/[id]` -> `200`
- `DELETE /api/subscriptions-internal/subscriptions/[id]` -> `200`
- `DELETE /api/subscriptions-internal/plans/[id]` -> `200`
- `GET /api/audit-logs` com eventos da fase -> `200`

### Garantias confirmadas

- nenhuma chamada para MyGateway
- nenhuma cobranca real
- nenhum webhook externo
- nenhum retry externo
- `provider_synced` continua bloqueado sem integracao real

## Status final

- Assinaturas internas prontas em producao.
- Simulador funcionando em producao.
- Auditoria funcionando em producao.
- Sem regressao identificada nos checks executados desta fase.
