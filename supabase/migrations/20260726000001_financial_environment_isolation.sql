alter table public.transactions
  add column if not exists provider_environment text null;

alter table public.pay_transacao
  add column if not exists provider_environment text null;

alter table public.pay_assinatura
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.pay_pagador
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.pay_subscription_events
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.webhook_events
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.webhook_events_unresolved
  add column if not exists provider_environment text null;

alter table public.pay_conciliation_runs
  add column if not exists provider_environment text null;

alter table public.pay_conciliation_items
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.ledger_entries
  add column if not exists provider text null,
  add column if not exists provider_environment text null,
  add column if not exists provider_order_id text null,
  add column if not exists provider_charge_id text null,
  add column if not exists provider_reference text null;

alter table public.pay_ledger
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.pay_split
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.receivers
  add column if not exists provider text null,
  add column if not exists provider_environment text null,
  add column if not exists provider_receiver_id text null;

alter table public.payouts
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.payout_events
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.pay_antecipacao
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.pay_antecipacao_events
  add column if not exists provider text null,
  add column if not exists provider_environment text null;

alter table public.transactions
  drop constraint if exists transactions_provider_environment_check;

alter table public.transactions
  add constraint transactions_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_transacao
  drop constraint if exists pay_transacao_provider_environment_check;

alter table public.pay_transacao
  add constraint pay_transacao_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_assinatura
  drop constraint if exists pay_assinatura_provider_environment_check;

alter table public.pay_assinatura
  add constraint pay_assinatura_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_pagador
  drop constraint if exists pay_pagador_provider_environment_check;

alter table public.pay_pagador
  add constraint pay_pagador_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_subscription_events
  drop constraint if exists pay_subscription_events_provider_environment_check;

alter table public.pay_subscription_events
  add constraint pay_subscription_events_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.webhook_events
  drop constraint if exists webhook_events_provider_environment_check;

alter table public.webhook_events
  add constraint webhook_events_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.webhook_events_unresolved
  drop constraint if exists webhook_events_unresolved_provider_environment_check;

alter table public.webhook_events_unresolved
  add constraint webhook_events_unresolved_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_conciliation_runs
  drop constraint if exists pay_conciliation_runs_provider_environment_check;

alter table public.pay_conciliation_runs
  add constraint pay_conciliation_runs_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_conciliation_items
  drop constraint if exists pay_conciliation_items_provider_environment_check;

alter table public.pay_conciliation_items
  add constraint pay_conciliation_items_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.ledger_entries
  drop constraint if exists ledger_entries_provider_environment_check;

alter table public.ledger_entries
  add constraint ledger_entries_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_ledger
  drop constraint if exists pay_ledger_provider_environment_check;

alter table public.pay_ledger
  add constraint pay_ledger_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_split
  drop constraint if exists pay_split_provider_environment_check;

alter table public.pay_split
  add constraint pay_split_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.receivers
  drop constraint if exists receivers_provider_environment_check;

alter table public.receivers
  add constraint receivers_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.payouts
  drop constraint if exists payouts_provider_environment_check;

alter table public.payouts
  add constraint payouts_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.payout_events
  drop constraint if exists payout_events_provider_environment_check;

alter table public.payout_events
  add constraint payout_events_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_antecipacao
  drop constraint if exists pay_antecipacao_provider_environment_check;

alter table public.pay_antecipacao
  add constraint pay_antecipacao_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

alter table public.pay_antecipacao_events
  drop constraint if exists pay_antecipacao_events_provider_environment_check;

alter table public.pay_antecipacao_events
  add constraint pay_antecipacao_events_provider_environment_check
  check (provider_environment is null or provider_environment in ('sandbox', 'production'));

update public.transactions
set provider_environment = nullif(metadata ->> 'provider_environment', '')
where provider_environment is null
  and jsonb_typeof(metadata) = 'object'
  and metadata ? 'provider_environment';

update public.pay_transacao pt
set provider_environment = t.provider_environment
from public.transactions t
where pt.transaction_id = t.id
  and pt.provider_environment is null;

update public.pay_split ps
set
  provider = t.provider,
  provider_environment = t.provider_environment
from public.transactions t
where ps.transaction_id = t.id
  and (ps.provider is null or ps.provider_environment is null);

update public.pay_ledger pl
set
  provider = t.provider,
  provider_environment = t.provider_environment
from public.transactions t
where pl.transaction_id = t.id
  and (pl.provider is null or pl.provider_environment is null);

update public.ledger_entries le
set
  provider = coalesce(le.provider, t.provider),
  provider_environment = coalesce(le.provider_environment, t.provider_environment),
  provider_order_id = coalesce(le.provider_order_id, t.provider_order_id),
  provider_charge_id = coalesce(le.provider_charge_id, t.provider_charge_id),
  provider_reference = coalesce(le.provider_reference, t.provider_reference)
from public.transactions t
where le.transaction_id = t.id
  and (
    le.provider is null
    or le.provider_environment is null
    or le.provider_order_id is null
    or le.provider_charge_id is null
    or le.provider_reference is null
  );

update public.ledger_entries le
set
  provider = coalesce(le.provider, p.provider),
  provider_environment = coalesce(le.provider_environment, p.provider_environment),
  provider_reference = coalesce(le.provider_reference, p.provider_reference)
from public.payouts p
where le.payout_id = p.id
  and (
    le.provider is null
    or le.provider_environment is null
    or le.provider_reference is null
  );

update public.ledger_entries le
set
  provider = coalesce(le.provider, pa.provider),
  provider_environment = coalesce(le.provider_environment, pa.provider_environment),
  provider_reference = coalesce(le.provider_reference, pa.provider_reference, pa.acquirer_anticipation_id)
from public.pay_antecipacao pa
where le.anticipation_request_id = pa.id
  and (
    le.provider is null
    or le.provider_environment is null
    or le.provider_reference is null
  );

update public.payouts p
set
  provider = coalesce(p.provider, r.provider),
  provider_environment = coalesce(p.provider_environment, r.provider_environment)
from public.receivers r
where p.receiver_id = r.id
  and (p.provider is null or p.provider_environment is null);

update public.payout_events pe
set
  provider = coalesce(pe.provider, p.provider),
  provider_environment = coalesce(pe.provider_environment, p.provider_environment)
from public.payouts p
where pe.payout_id = p.id
  and (pe.provider is null or pe.provider_environment is null);

update public.pay_antecipacao pa
set
  provider = coalesce(pa.provider, r.provider),
  provider_environment = coalesce(pa.provider_environment, r.provider_environment)
from public.receivers r
where pa.recebedor_id = r.id
  and (pa.provider is null or pa.provider_environment is null);

update public.pay_antecipacao_events pae
set
  provider = coalesce(pae.provider, pa.provider),
  provider_environment = coalesce(pae.provider_environment, pa.provider_environment)
from public.pay_antecipacao pa
where pae.antecipacao_id = pa.id
  and (pae.provider is null or pae.provider_environment is null);

-- Estratégia segura de legados:
-- 1. registros com provider/provider_environment inferíveis por vínculo interno recebem o mesmo escopo;
-- 2. registros ambíguos permanecem com provider_environment nulo;
-- 3. registros com provider_environment nulo não entram nos índices únicos/operacionais por ambiente e devem ficar bloqueados até revisão manual.

drop index if exists webhook_events_org_provider_event_uq;
create unique index if not exists webhook_events_org_provider_event_env_uq
  on public.webhook_events (organization_id, coalesce(provider, 'unknown'), coalesce(provider_environment, 'unknown'), provider_event_id)
  where provider_event_id is not null;

alter table public.webhook_events_unresolved
  drop constraint if exists webhook_events_unresolved_provider_event_uq;

create unique index if not exists webhook_events_unresolved_provider_event_env_uq
  on public.webhook_events_unresolved (provider, coalesce(provider_environment, 'unknown'), provider_event_id);

create index if not exists transactions_org_provider_env_order_idx
  on public.transactions (organization_id, provider, provider_environment, provider_order_id)
  where provider_order_id is not null;

create index if not exists transactions_org_provider_env_charge_idx
  on public.transactions (organization_id, provider, provider_environment, provider_charge_id)
  where provider_charge_id is not null;

create index if not exists transactions_org_provider_env_ref_idx
  on public.transactions (organization_id, provider, provider_environment, provider_reference)
  where provider_reference is not null;

create index if not exists pay_assinatura_org_provider_env_ref_idx
  on public.pay_assinatura (organization_id, provider, provider_environment, provider_reference)
  where provider_reference is not null;

create index if not exists pay_conciliation_items_org_provider_env_ref_idx
  on public.pay_conciliation_items (organization_id, provider, provider_environment, provider_reference)
  where provider_reference is not null;

create index if not exists ledger_entries_org_provider_env_occurred_idx
  on public.ledger_entries (organization_id, provider, provider_environment, occurred_at desc, created_at desc);

create index if not exists ledger_entries_org_provider_env_tx_idx
  on public.ledger_entries (organization_id, provider, provider_environment, transaction_id)
  where transaction_id is not null;

create index if not exists ledger_entries_org_provider_env_payout_idx
  on public.ledger_entries (organization_id, provider, provider_environment, payout_id)
  where payout_id is not null;

create index if not exists ledger_entries_org_provider_env_ant_idx
  on public.ledger_entries (organization_id, provider, provider_environment, anticipation_request_id)
  where anticipation_request_id is not null;

create index if not exists pay_split_org_provider_env_tx_idx
  on public.pay_split (organization_id, provider, provider_environment, transaction_id);

create index if not exists pay_ledger_org_provider_env_tx_idx
  on public.pay_ledger (organization_id, provider, provider_environment, transaction_id);

create index if not exists payouts_org_provider_env_ref_idx
  on public.payouts (organization_id, provider, provider_environment, provider_reference)
  where provider_reference is not null;

create index if not exists payout_events_org_provider_env_payout_idx
  on public.payout_events (organization_id, provider, provider_environment, payout_id);

create index if not exists pay_antecipacao_org_provider_env_ref_idx
  on public.pay_antecipacao (organization_id, provider, provider_environment, provider_reference)
  where provider_reference is not null;

create index if not exists pay_antecipacao_events_org_provider_env_ant_idx
  on public.pay_antecipacao_events (organization_id, provider, provider_environment, antecipacao_id);

create index if not exists receivers_org_provider_env_idx
  on public.receivers (organization_id, provider, provider_environment, created_at desc);

create unique index if not exists receivers_org_provider_env_provider_receiver_uq
  on public.receivers (organization_id, provider, provider_environment, provider_receiver_id)
  where provider_receiver_id is not null and provider is not null and provider_environment is not null;

drop function if exists public.create_internal_checkout_transaction(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
);

create or replace function public.create_internal_checkout_transaction(
  p_transaction_id uuid,
  p_organization_id uuid,
  p_customer_id uuid,
  p_payment_link_id uuid,
  p_amount bigint,
  p_currency text,
  p_method text,
  p_status text,
  p_provider text,
  p_provider_environment text,
  p_idempotency_key text,
  p_transaction_metadata jsonb default '{}'::jsonb,
  p_split_summary jsonb default '{}'::jsonb,
  p_split_rows jsonb default '[]'::jsonb
)
returns table (
  transaction_id uuid,
  public_token uuid,
  status text,
  idempotency_key text,
  reused boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_public_token uuid;
  v_status text;
begin
  if p_idempotency_key is not null then
    select t.id, t.public_token, t.status
      into v_transaction_id, v_public_token, v_status
      from public.transactions t
     where t.organization_id = p_organization_id
       and t.idempotency_key = p_idempotency_key
     limit 1;

    if v_transaction_id is not null then
      insert into public.pay_transacao (
        transaction_id,
        organization_id,
        payment_link_id,
        gross_amount,
        connekt_fee_amount,
        receiver_total_amount,
        currency,
        status,
        provider,
        provider_environment,
        provider_reference,
        provider_order_id,
        provider_charge_id,
        provider_payload,
        provider_split_payload,
        idempotency_key,
        split_snapshot
      )
      values (
        v_transaction_id,
        p_organization_id,
        p_payment_link_id,
        coalesce((p_split_summary ->> 'gross_amount')::bigint, p_amount),
        coalesce((p_split_summary ->> 'connekt_fee_amount')::bigint, 0),
        coalesce((p_split_summary ->> 'receiver_total_amount')::bigint, p_amount),
        p_currency,
        p_status,
        p_provider,
        p_provider_environment,
        null,
        null,
        null,
        '{}'::jsonb,
        '{}'::jsonb,
        p_idempotency_key,
        coalesce(p_split_summary, '{}'::jsonb)
      )
      on conflict (transaction_id) do nothing;

      insert into public.pay_split (
        transaction_id,
        organization_id,
        provider,
        provider_environment,
        receiver_id,
        kind,
        amount,
        percentage_bps,
        rule_id
      )
      select
        v_transaction_id,
        p_organization_id,
        p_provider,
        p_provider_environment,
        nullif(item ->> 'receiver_id', '')::uuid,
        coalesce(item ->> 'kind', 'receiver'),
        coalesce((item ->> 'amount')::bigint, 0),
        coalesce((item ->> 'percentage_bps')::int, 0),
        nullif(item ->> 'rule_id', '')::uuid
      from jsonb_array_elements(coalesce(p_split_rows, '[]'::jsonb)) as item
      on conflict (transaction_id, kind, receiver_id) do nothing;

      return query
      select v_transaction_id, v_public_token, v_status, p_idempotency_key, true;
      return;
    end if;
  end if;

  insert into public.transactions (
    id,
    organization_id,
    customer_id,
    payment_link_id,
    amount,
    currency,
    method,
    status,
    provider,
    provider_environment,
    provider_reference,
    provider_order_id,
    provider_charge_id,
    provider_payload,
    idempotency_key,
    metadata,
    public_token
  )
  values (
    coalesce(p_transaction_id, gen_random_uuid()),
    p_organization_id,
    p_customer_id,
    p_payment_link_id,
    p_amount,
    p_currency,
    p_method,
    p_status,
    p_provider,
    p_provider_environment,
    null,
    null,
    null,
    '{}'::jsonb,
    p_idempotency_key,
    coalesce(p_transaction_metadata, '{}'::jsonb),
    gen_random_uuid()
  )
  returning id, public_token, status into v_transaction_id, v_public_token, v_status;

  insert into public.pay_transacao (
    transaction_id,
    organization_id,
    payment_link_id,
    gross_amount,
    connekt_fee_amount,
    receiver_total_amount,
    currency,
    status,
    provider,
    provider_environment,
    provider_reference,
    provider_order_id,
    provider_charge_id,
    provider_payload,
    provider_split_payload,
    idempotency_key,
    split_snapshot
  )
  values (
    v_transaction_id,
    p_organization_id,
    p_payment_link_id,
    coalesce((p_split_summary ->> 'gross_amount')::bigint, p_amount),
    coalesce((p_split_summary ->> 'connekt_fee_amount')::bigint, 0),
    coalesce((p_split_summary ->> 'receiver_total_amount')::bigint, p_amount),
    p_currency,
    p_status,
    p_provider,
    p_provider_environment,
    null,
    null,
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    p_idempotency_key,
    coalesce(p_split_summary, '{}'::jsonb)
  )
  on conflict (transaction_id) do nothing;

  insert into public.pay_split (
    transaction_id,
    organization_id,
    provider,
    provider_environment,
    receiver_id,
    kind,
    amount,
    percentage_bps,
    rule_id
  )
  select
    v_transaction_id,
    p_organization_id,
    p_provider,
    p_provider_environment,
    nullif(item ->> 'receiver_id', '')::uuid,
    coalesce(item ->> 'kind', 'receiver'),
    coalesce((item ->> 'amount')::bigint, 0),
    coalesce((item ->> 'percentage_bps')::int, 0),
    nullif(item ->> 'rule_id', '')::uuid
  from jsonb_array_elements(coalesce(p_split_rows, '[]'::jsonb)) as item
  on conflict (transaction_id, kind, receiver_id) do nothing;

  return query
  select v_transaction_id, v_public_token, v_status, p_idempotency_key, false;
end;
$$;

revoke all on function public.create_internal_checkout_transaction(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) from public, authenticated, anon;

grant execute on function public.create_internal_checkout_transaction(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) to service_role;

drop function if exists public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid);
drop function if exists public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid, text, text, text, text, text);

create or replace function public.append_ledger_entry(
  p_organization_id uuid,
  p_type text,
  p_direction text,
  p_amount bigint,
  p_origin text default 'system',
  p_occurred_at timestamptz default now(),
  p_transaction_id uuid default null,
  p_payout_id uuid default null,
  p_anticipation_request_id uuid default null,
  p_provider text default null,
  p_provider_environment text default null,
  p_provider_order_id text default null,
  p_provider_charge_id text default null,
  p_provider_reference text default null
)
returns public.ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
  v_provider_environment text;
  v_provider_order_id text;
  v_provider_charge_id text;
  v_provider_reference text;
  prev_balance bigint;
  next_balance bigint;
  row public.ledger_entries;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;
  if p_direction not in ('credit','debit') then
    raise exception 'direction must be credit or debit';
  end if;

  v_provider := nullif(trim(coalesce(p_provider, '')), '');
  v_provider_environment := nullif(trim(coalesce(p_provider_environment, '')), '');
  v_provider_order_id := nullif(trim(coalesce(p_provider_order_id, '')), '');
  v_provider_charge_id := nullif(trim(coalesce(p_provider_charge_id, '')), '');
  v_provider_reference := nullif(trim(coalesce(p_provider_reference, '')), '');

  if p_transaction_id is not null then
    select
      coalesce(v_provider, nullif(trim(coalesce(t.provider, '')), '')),
      coalesce(v_provider_environment, nullif(trim(coalesce(t.provider_environment, '')), '')),
      coalesce(v_provider_order_id, nullif(trim(coalesce(t.provider_order_id, '')), '')),
      coalesce(v_provider_charge_id, nullif(trim(coalesce(t.provider_charge_id, '')), '')),
      coalesce(v_provider_reference, nullif(trim(coalesce(t.provider_reference, '')), ''))
    into v_provider, v_provider_environment, v_provider_order_id, v_provider_charge_id, v_provider_reference
    from public.transactions t
    where t.id = p_transaction_id
      and t.organization_id = p_organization_id
    limit 1;
  end if;

  if p_payout_id is not null then
    select
      coalesce(v_provider, nullif(trim(coalesce(p.provider, '')), '')),
      coalesce(v_provider_environment, nullif(trim(coalesce(p.provider_environment, '')), '')),
      coalesce(v_provider_reference, nullif(trim(coalesce(p.provider_reference, '')), ''))
    into v_provider, v_provider_environment, v_provider_reference
    from public.payouts p
    where p.id = p_payout_id
      and p.organization_id = p_organization_id
    limit 1;
  end if;

  if p_anticipation_request_id is not null then
    select
      coalesce(v_provider, nullif(trim(coalesce(a.provider, '')), '')),
      coalesce(v_provider_environment, nullif(trim(coalesce(a.provider_environment, '')), '')),
      coalesce(v_provider_reference, nullif(trim(coalesce(a.provider_reference, '')), ''), nullif(trim(coalesce(a.acquirer_anticipation_id, '')), ''))
    into v_provider, v_provider_environment, v_provider_reference
    from public.pay_antecipacao a
    where a.id = p_anticipation_request_id
      and a.organization_id = p_organization_id
    limit 1;
  end if;

  perform pg_advisory_xact_lock(hashtext(
    p_organization_id::text
    || '|' || coalesce(v_provider, 'unknown')
    || '|' || coalesce(v_provider_environment, 'unknown')
  ));

  select le.balance_after
  into prev_balance
  from public.ledger_entries le
  where le.organization_id = p_organization_id
    and coalesce(le.provider, 'unknown') = coalesce(v_provider, 'unknown')
    and coalesce(le.provider_environment, 'unknown') = coalesce(v_provider_environment, 'unknown')
  order by le.occurred_at desc, le.created_at desc
  limit 1;

  prev_balance := coalesce(prev_balance, 0);
  next_balance := case when p_direction = 'credit' then prev_balance + p_amount else prev_balance - p_amount end;

  insert into public.ledger_entries (
    organization_id,
    transaction_id,
    payout_id,
    anticipation_request_id,
    provider,
    provider_environment,
    provider_order_id,
    provider_charge_id,
    provider_reference,
    type,
    direction,
    amount,
    balance_after,
    origin,
    occurred_at
  )
  values (
    p_organization_id,
    p_transaction_id,
    p_payout_id,
    p_anticipation_request_id,
    v_provider,
    v_provider_environment,
    v_provider_order_id,
    v_provider_charge_id,
    v_provider_reference,
    p_type,
    p_direction,
    p_amount,
    next_balance,
    coalesce(p_origin, 'system'),
    coalesce(p_occurred_at, now())
  )
  returning * into row;

  return row;
end;
$$;

revoke all on function public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid, text, text, text, text, text) to authenticated;

-- Rollback reversível (executar apenas manualmente, se necessário):
-- drop index if exists receivers_org_provider_env_provider_receiver_uq;
-- drop index if exists receivers_org_provider_env_idx;
-- drop index if exists pay_antecipacao_events_org_provider_env_ant_idx;
-- drop index if exists pay_antecipacao_org_provider_env_ref_idx;
-- drop index if exists payout_events_org_provider_env_payout_idx;
-- drop index if exists payouts_org_provider_env_ref_idx;
-- drop index if exists pay_ledger_org_provider_env_tx_idx;
-- drop index if exists pay_split_org_provider_env_tx_idx;
-- drop index if exists ledger_entries_org_provider_env_ant_idx;
-- drop index if exists ledger_entries_org_provider_env_payout_idx;
-- drop index if exists ledger_entries_org_provider_env_tx_idx;
-- drop index if exists ledger_entries_org_provider_env_occurred_idx;
-- alter table public.pay_antecipacao_events drop constraint if exists pay_antecipacao_events_provider_environment_check;
-- alter table public.pay_antecipacao drop constraint if exists pay_antecipacao_provider_environment_check;
-- alter table public.payout_events drop constraint if exists payout_events_provider_environment_check;
-- alter table public.payouts drop constraint if exists payouts_provider_environment_check;
-- alter table public.receivers drop constraint if exists receivers_provider_environment_check;
-- alter table public.pay_split drop constraint if exists pay_split_provider_environment_check;
-- alter table public.pay_ledger drop constraint if exists pay_ledger_provider_environment_check;
-- alter table public.ledger_entries drop constraint if exists ledger_entries_provider_environment_check;
-- drop function if exists public.create_internal_checkout_transaction(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, text, jsonb, jsonb, jsonb);
-- -- Recriar a assinatura anterior de public.create_internal_checkout_transaction a partir de 20260725000001_phase2_checkout_internal_transactions.sql e reaplicar o grant para service_role.
-- drop function if exists public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid, text, text, text, text, text);
-- -- Recriar a assinatura anterior de public.append_ledger_entry a partir de 20260622000003_ledger_append.sql e reaplicar o grant para authenticated.
