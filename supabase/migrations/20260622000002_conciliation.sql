create table if not exists public.conciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'mygateway',
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conciliation_runs
  add column if not exists provider text null,
  add column if not exists updated_at timestamptz null;

alter table public.conciliation_runs
  alter column provider set default 'mygateway';

update public.conciliation_runs
set provider = coalesce(provider, 'mygateway')
where provider is null;

update public.conciliation_runs
set updated_at = coalesce(updated_at, now())
where updated_at is null;

alter table public.conciliation_runs
  alter column provider set not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'conciliation_runs_set_updated_at') then
    execute 'create trigger conciliation_runs_set_updated_at before update on public.conciliation_runs for each row execute function public.set_updated_at()';
  end if;
end $$;

create index if not exists conciliation_runs_org_idx on public.conciliation_runs (organization_id);
create index if not exists conciliation_runs_org_started_at_idx on public.conciliation_runs (organization_id, started_at desc);

create table if not exists public.conciliation_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.conciliation_runs(id) on delete cascade,
  transaction_id uuid null references public.transactions(id) on delete set null,
  internal_amount bigint not null,
  provider_amount bigint null,
  diff bigint not null,
  status text not null default 'pending',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.conciliation_items
  add column if not exists status text null,
  add column if not exists details jsonb null;

alter table public.conciliation_items
  alter column status set default 'pending';

update public.conciliation_items
set status = coalesce(status, 'pending')
where status is null;

update public.conciliation_items
set details = coalesce(details, '{}'::jsonb)
where details is null;

alter table public.conciliation_items
  alter column status set not null;

alter table public.conciliation_items
  alter column details set not null;

alter table public.conciliation_items
  alter column details set default '{}'::jsonb;

create index if not exists conciliation_items_org_idx on public.conciliation_items (organization_id);
create index if not exists conciliation_items_run_idx on public.conciliation_items (run_id);
create index if not exists conciliation_items_org_created_at_idx on public.conciliation_items (organization_id, created_at desc);
create index if not exists conciliation_items_org_status_idx on public.conciliation_items (organization_id, status);

alter table public.conciliation_runs enable row level security;
alter table public.conciliation_items enable row level security;

drop policy if exists conciliation_runs_all on public.conciliation_runs;
create policy conciliation_runs_all on public.conciliation_runs
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists conciliation_items_all on public.conciliation_items;
create policy conciliation_items_all on public.conciliation_items
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

