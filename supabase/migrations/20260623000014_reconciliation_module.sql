do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conciliation_runs')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pay_conciliation_runs')
  then
    execute 'alter table public.conciliation_runs rename to pay_conciliation_runs';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conciliation_items')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'pay_conciliation_items')
  then
    execute 'alter table public.conciliation_items rename to pay_conciliation_items';
  end if;
end $$;

create table if not exists public.pay_conciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running',
  provider text not null default 'mygateway',
  period_start timestamptz null,
  period_end timestamptz null,
  total_internal_amount_centavos bigint not null default 0,
  total_provider_amount_centavos bigint not null default 0,
  total_difference_centavos bigint not null default 0,
  total_checked int not null default 0,
  total_matched int not null default 0,
  total_divergent int not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pay_conciliation_runs
  add column if not exists provider text null,
  add column if not exists period_start timestamptz null,
  add column if not exists period_end timestamptz null,
  add column if not exists total_internal_amount_centavos bigint null,
  add column if not exists total_provider_amount_centavos bigint null,
  add column if not exists total_difference_centavos bigint null,
  add column if not exists total_checked int null,
  add column if not exists total_matched int null,
  add column if not exists total_divergent int null,
  add column if not exists created_by uuid null,
  add column if not exists summary jsonb null,
  add column if not exists created_at timestamptz null,
  add column if not exists updated_at timestamptz null;

update public.pay_conciliation_runs
set
  provider = coalesce(provider, 'mygateway'),
  total_internal_amount_centavos = coalesce(total_internal_amount_centavos, 0),
  total_provider_amount_centavos = coalesce(total_provider_amount_centavos, 0),
  total_difference_centavos = coalesce(total_difference_centavos, 0),
  total_checked = coalesce(total_checked, 0),
  total_matched = coalesce(total_matched, 0),
  total_divergent = coalesce(total_divergent, 0),
  summary = coalesce(summary, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  provider is null
  or total_internal_amount_centavos is null
  or total_provider_amount_centavos is null
  or total_difference_centavos is null
  or total_checked is null
  or total_matched is null
  or total_divergent is null
  or summary is null
  or created_at is null
  or updated_at is null;

alter table public.pay_conciliation_runs
  alter column provider set not null,
  alter column total_internal_amount_centavos set not null,
  alter column total_provider_amount_centavos set not null,
  alter column total_difference_centavos set not null,
  alter column total_checked set not null,
  alter column total_matched set not null,
  alter column total_divergent set not null,
  alter column summary set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_conciliation_runs_set_updated_at') then
    execute 'create trigger pay_conciliation_runs_set_updated_at before update on public.pay_conciliation_runs for each row execute function public.set_updated_at()';
  end if;
end $$;

create index if not exists pay_conciliation_runs_org_idx on public.pay_conciliation_runs (organization_id);
create index if not exists pay_conciliation_runs_org_started_at_idx on public.pay_conciliation_runs (organization_id, started_at desc);
create index if not exists pay_conciliation_runs_org_period_idx on public.pay_conciliation_runs (organization_id, period_start desc, period_end desc);

create table if not exists public.pay_conciliation_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.pay_conciliation_runs(id) on delete cascade,
  entity_type text not null,
  entity_id uuid null,
  provider_reference text null,
  internal_status text null,
  provider_status text null,
  internal_amount_centavos bigint null,
  provider_amount_centavos bigint null,
  difference_centavos bigint not null default 0,
  status text not null default 'pending',
  reason text null,
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pay_conciliation_items
  add column if not exists entity_type text null,
  add column if not exists entity_id uuid null,
  add column if not exists provider_reference text null,
  add column if not exists internal_status text null,
  add column if not exists provider_status text null,
  add column if not exists internal_amount_centavos bigint null,
  add column if not exists provider_amount_centavos bigint null,
  add column if not exists difference_centavos bigint null,
  add column if not exists status text null,
  add column if not exists reason text null,
  add column if not exists payload jsonb null,
  add column if not exists resolved_at timestamptz null,
  add column if not exists created_at timestamptz null,
  add column if not exists updated_at timestamptz null;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'transaction_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'entity_id')
  then
    execute 'alter table public.pay_conciliation_items add column if not exists entity_id uuid null';
    execute 'update public.pay_conciliation_items set entity_id = transaction_id where entity_id is null and transaction_id is not null';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'transaction_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'entity_type')
  then
    execute 'alter table public.pay_conciliation_items add column if not exists entity_type text null';
    execute 'update public.pay_conciliation_items set entity_type = ''transaction'' where entity_type is null';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'internal_amount')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'internal_amount_centavos')
  then
    execute 'alter table public.pay_conciliation_items add column if not exists internal_amount_centavos bigint null';
    execute 'update public.pay_conciliation_items set internal_amount_centavos = internal_amount where internal_amount_centavos is null and internal_amount is not null';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'provider_amount')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'provider_amount_centavos')
  then
    execute 'alter table public.pay_conciliation_items add column if not exists provider_amount_centavos bigint null';
    execute 'update public.pay_conciliation_items set provider_amount_centavos = provider_amount where provider_amount_centavos is null and provider_amount is not null';
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'diff')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pay_conciliation_items' and column_name = 'difference_centavos')
  then
    execute 'alter table public.pay_conciliation_items add column if not exists difference_centavos bigint null';
    execute 'update public.pay_conciliation_items set difference_centavos = diff where difference_centavos is null and diff is not null';
  end if;
end $$;

update public.pay_conciliation_items
set
  entity_type = coalesce(entity_type, 'transaction'),
  difference_centavos = coalesce(difference_centavos, 0),
  status = coalesce(status, 'pending'),
  payload = coalesce(payload, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  entity_type is null
  or difference_centavos is null
  or status is null
  or payload is null
  or created_at is null
  or updated_at is null;

alter table public.pay_conciliation_items
  alter column entity_type set not null,
  alter column difference_centavos set not null,
  alter column status set not null,
  alter column payload set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_conciliation_items_set_updated_at') then
    execute 'create trigger pay_conciliation_items_set_updated_at before update on public.pay_conciliation_items for each row execute function public.set_updated_at()';
  end if;
end $$;

create index if not exists pay_conciliation_items_org_idx on public.pay_conciliation_items (organization_id);
create index if not exists pay_conciliation_items_run_idx on public.pay_conciliation_items (run_id);
create index if not exists pay_conciliation_items_org_created_at_idx on public.pay_conciliation_items (organization_id, created_at desc);
create index if not exists pay_conciliation_items_org_status_idx on public.pay_conciliation_items (organization_id, status);
create unique index if not exists pay_conciliation_items_run_entity_uq on public.pay_conciliation_items (run_id, entity_type, entity_id) where entity_id is not null;
create unique index if not exists pay_conciliation_items_run_provider_ref_uq on public.pay_conciliation_items (run_id, entity_type, provider_reference) where provider_reference is not null;

create table if not exists public.pay_conciliation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.pay_conciliation_runs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pay_conciliation_events_org_idx on public.pay_conciliation_events (organization_id);
create index if not exists pay_conciliation_events_run_idx on public.pay_conciliation_events (run_id, created_at desc);

alter table public.pay_conciliation_runs enable row level security;
alter table public.pay_conciliation_items enable row level security;
alter table public.pay_conciliation_events enable row level security;
alter table public.pay_conciliation_runs force row level security;
alter table public.pay_conciliation_items force row level security;
alter table public.pay_conciliation_events force row level security;

drop policy if exists pay_conciliation_runs_all on public.pay_conciliation_runs;
create policy pay_conciliation_runs_all on public.pay_conciliation_runs
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_conciliation_items_all on public.pay_conciliation_items;
create policy pay_conciliation_items_all on public.pay_conciliation_items
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_conciliation_events_all on public.pay_conciliation_events;
create policy pay_conciliation_events_all on public.pay_conciliation_events
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

create or replace view public.conciliation_runs as
select
  id,
  organization_id,
  provider,
  started_at,
  finished_at,
  status,
  summary,
  created_at,
  updated_at
from public.pay_conciliation_runs;

create or replace view public.conciliation_items as
select
  i.id,
  i.organization_id,
  i.run_id,
  case when i.entity_type = 'transaction' then i.entity_id else null end as transaction_id,
  coalesce(i.internal_amount_centavos, 0) as internal_amount,
  i.provider_amount_centavos as provider_amount,
  i.difference_centavos as diff,
  i.status,
  i.payload as details,
  i.created_at
from public.pay_conciliation_items i;

