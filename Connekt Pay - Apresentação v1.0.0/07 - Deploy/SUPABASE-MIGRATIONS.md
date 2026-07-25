# Supabase — Migrations (Connekt Pay)

Data: 2026-06-23

## Regras do projeto

- Migrations devem ser idempotentes:
  - usar `create table if not exists`
  - usar `alter table ... add column if not exists`
  - usar `drop policy if exists` antes de `create policy`
  - usar `do $$ begin ... end $$;` para renomes condicionais
- Valores financeiros sempre em centavos (`bigint`).
- Datas em UTC (`timestamptz`).
- Tabelas sensíveis devem ter:
  - `enable row level security`
  - `force row level security`
  - policies por `organization_id`
- Índices nas colunas usadas em filtros/listagens (`organization_id`, `created_at`, `status`, `provider_reference`).

## Como aplicar

### Opção A — aplicar migrations (recomendado)

No Supabase, vá em **SQL Editor** e aplique os arquivos de `supabase/migrations/` em ordem lexicográfica (prefixo timestamp).

### Opção B — aplicar schema completo (referência)

O arquivo [supabase/setup.sql](file:///c:/Users/Leonardo/Desktop/ConnektPay/supabase/setup.sql) representa o estado consolidado do schema. Ele é regenerado pelo projeto e serve como referência/backup do estado completo.

## Tabelas-chave por módulo

- Core: `organizations`, `profiles`, `customers`, `receivers`, `transactions`, `payment_links`
- Ledger: `ledger_entries`, `pay_ledger`
- Split: `pay_taxa_config`, `split_rules`, `pay_split`, `pay_transacao`
- Recorrência: `pay_plano`, `pay_pagador`, `pay_assinatura`, `pay_subscription_events`
- Antecipação: `pay_antecipacao`, `pay_antecipacao_events`
- Conciliação: `pay_conciliation_runs`, `pay_conciliation_items`, `pay_conciliation_events`
- Webhooks: `webhook_events`, `webhook_attempts`
- Auditoria: `audit_logs`

