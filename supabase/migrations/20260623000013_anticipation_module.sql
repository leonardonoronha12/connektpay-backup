do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'anticipation_requests')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pay_antecipacao')
  then
    execute 'alter table public.anticipation_requests rename to pay_antecipacao';
  end if;
end $$;

create table if not exists public.pay_antecipacao (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recebedor_id uuid null references public.receivers(id) on delete set null,
  requested_amount_centavos bigint not null,
  available_amount_centavos bigint null,
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
  canceled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pay_antecipacao
  add column if not exists provider_reference text null,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists requested_at timestamptz null,
  add column if not exists approved_at timestamptz null,
  add column if not exists executed_at timestamptz null,
  add column if not exists canceled_at timestamptz null;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'receiver_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'recebedor_id')
  then
    execute 'alter table public.pay_antecipacao rename column receiver_id to recebedor_id';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'requested_amount')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'requested_amount_centavos')
  then
    execute 'alter table public.pay_antecipacao rename column requested_amount to requested_amount_centavos';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'fee_amount')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'fee_centavos')
  then
    execute 'alter table public.pay_antecipacao rename column fee_amount to fee_centavos';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'net_amount')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'net_amount_centavos')
  then
    execute 'alter table public.pay_antecipacao rename column net_amount to net_amount_centavos';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'fee_rate')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_antecipacao' and column_name = 'fee_bps')
  then
    execute 'alter table public.pay_antecipacao add column if not exists fee_bps int null';
    execute 'update public.pay_antecipacao set fee_bps = round((fee_rate * 10000))::int where fee_bps is null and fee_rate is not null';
  end if;
end $$;

create index if not exists pay_antecipacao_org_idx on public.pay_antecipacao (organization_id);
create index if not exists pay_antecipacao_org_status_idx on public.pay_antecipacao (organization_id, status);
create index if not exists pay_antecipacao_org_created_at_idx on public.pay_antecipacao (organization_id, created_at desc);
create index if not exists pay_antecipacao_org_receiver_idx on public.pay_antecipacao (organization_id, recebedor_id);
create index if not exists pay_antecipacao_provider_ref_idx on public.pay_antecipacao (provider_reference);
create index if not exists pay_antecipacao_acquirer_id_idx on public.pay_antecipacao (acquirer_anticipation_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_antecipacao_set_updated_at') then
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

create or replace view public.anticipation_requests as
select
  id,
  organization_id,
  recebedor_id as receiver_id,
  requested_amount_centavos as requested_amount,
  null::numeric as fee_rate,
  fee_centavos as fee_amount,
  net_amount_centavos as net_amount,
  status,
  provider_reference,
  provider_payload,
  created_at,
  updated_at
from public.pay_antecipacao;

