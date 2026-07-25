do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'anticipation_requests'
  )
  and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
  ) then
    execute 'alter table public.anticipation_requests rename to pay_antecipacao';
  end if;
end $$;

create table if not exists public.pay_antecipacao (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recebedor_id uuid null references public.receivers(id) on delete set null,
  requested_amount_centavos bigint not null,
  available_amount_centavos bigint null,
  eligible_amount_centavos bigint null,
  estimated_fee_centavos bigint null,
  estimated_fee_bps int null,
  net_amount_centavos bigint null,
  fee_centavos bigint null,
  fee_bps int null,
  status text not null default 'pending',
  acquirer_anticipation_id text null,
  provider_reference text null,
  provider_payload jsonb not null default '{}'::jsonb,
  provider_status text null,
  provider_last_error text null,
  requested_at timestamptz null,
  approved_at timestamptz null,
  executed_at timestamptz null,
  expected_settlement_days int null,
  expected_settlement_at timestamptz null,
  paid_at timestamptz null,
  rejected_at timestamptz null,
  rejection_reason text null,
  internal_notes text null,
  eligibility_snapshot jsonb null default null,
  is_internal boolean not null default false,
  canceled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'receiver_id'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'recebedor_id'
  ) then
    execute 'alter table public.pay_antecipacao rename column receiver_id to recebedor_id';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'requested_amount'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'requested_amount_centavos'
  ) then
    execute 'alter table public.pay_antecipacao rename column requested_amount to requested_amount_centavos';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'fee_amount'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'fee_centavos'
  ) then
    execute 'alter table public.pay_antecipacao rename column fee_amount to fee_centavos';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'net_amount'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'net_amount_centavos'
  ) then
    execute 'alter table public.pay_antecipacao rename column net_amount to net_amount_centavos';
  end if;
end $$;

alter table public.pay_antecipacao
  add column if not exists available_amount_centavos bigint null,
  add column if not exists eligible_amount_centavos bigint null,
  add column if not exists estimated_fee_centavos bigint null,
  add column if not exists estimated_fee_bps int null,
  add column if not exists fee_bps int null,
  add column if not exists acquirer_anticipation_id text null,
  add column if not exists provider_reference text null,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists provider_status text null,
  add column if not exists provider_last_error text null,
  add column if not exists requested_at timestamptz null,
  add column if not exists approved_at timestamptz null,
  add column if not exists executed_at timestamptz null,
  add column if not exists expected_settlement_days int null,
  add column if not exists expected_settlement_at timestamptz null,
  add column if not exists paid_at timestamptz null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null,
  add column if not exists internal_notes text null,
  add column if not exists eligibility_snapshot jsonb null default null,
  add column if not exists is_internal boolean not null default false,
  add column if not exists canceled_at timestamptz null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pay_antecipacao'
      and column_name = 'fee_rate'
  ) then
    update public.pay_antecipacao
    set fee_bps = coalesce(fee_bps, round((fee_rate * 10000))::int)
    where fee_rate is not null;
  end if;
end $$;

update public.pay_antecipacao
set
  available_amount_centavos = coalesce(available_amount_centavos, requested_amount_centavos),
  eligible_amount_centavos = coalesce(eligible_amount_centavos, available_amount_centavos, requested_amount_centavos),
  estimated_fee_bps = coalesce(estimated_fee_bps, fee_bps),
  estimated_fee_centavos = coalesce(estimated_fee_centavos, fee_centavos),
  provider_payload = coalesce(provider_payload, '{}'::jsonb)
where
  available_amount_centavos is null
  or eligible_amount_centavos is null
  or estimated_fee_bps is null
  or estimated_fee_centavos is null
  or provider_payload is null;

create index if not exists pay_antecipacao_org_idx on public.pay_antecipacao (organization_id);
create index if not exists pay_antecipacao_org_status_idx on public.pay_antecipacao (organization_id, status);
create index if not exists pay_antecipacao_org_created_at_idx on public.pay_antecipacao (organization_id, created_at desc);
create index if not exists pay_antecipacao_org_receiver_idx on public.pay_antecipacao (organization_id, recebedor_id);
create index if not exists pay_antecipacao_org_internal_status_idx on public.pay_antecipacao (organization_id, is_internal, status);
create index if not exists pay_antecipacao_org_internal_receiver_idx on public.pay_antecipacao (organization_id, is_internal, recebedor_id);
create index if not exists pay_antecipacao_provider_ref_idx on public.pay_antecipacao (provider_reference);
create index if not exists pay_antecipacao_acquirer_id_idx on public.pay_antecipacao (acquirer_anticipation_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'pay_antecipacao_set_updated_at'
  ) then
    execute 'create trigger pay_antecipacao_set_updated_at before update on public.pay_antecipacao for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_antecipacao_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  antecipacao_id uuid not null references public.pay_antecipacao(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  provider_event_id text null,
  created_at timestamptz not null default now()
);

create index if not exists pay_antecipacao_events_org_idx on public.pay_antecipacao_events (organization_id);
create index if not exists pay_antecipacao_events_antecipacao_idx on public.pay_antecipacao_events (antecipacao_id, created_at desc);
create unique index if not exists pay_antecipacao_events_org_provider_uq on public.pay_antecipacao_events (organization_id, provider_event_id) where provider_event_id is not null;

alter table public.pay_antecipacao enable row level security;
alter table public.pay_antecipacao_events enable row level security;
alter table public.pay_antecipacao force row level security;
alter table public.pay_antecipacao_events force row level security;

drop policy if exists pay_antecipacao_all on public.pay_antecipacao;
create policy pay_antecipacao_all on public.pay_antecipacao
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_antecipacao_events_all on public.pay_antecipacao_events;
create policy pay_antecipacao_events_all on public.pay_antecipacao_events
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));
