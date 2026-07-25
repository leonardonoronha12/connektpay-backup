create table if not exists public.split_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  main_receiver_id uuid not null references public.receivers(id) on delete restrict,
  status text not null default 'active',
  valid_from timestamptz null,
  valid_until timestamptz null,
  internal_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists split_configs_org_idx on public.split_configs (organization_id);
create index if not exists split_configs_org_status_idx on public.split_configs (organization_id, status);
create index if not exists split_configs_org_main_receiver_idx on public.split_configs (organization_id, main_receiver_id);
create index if not exists split_configs_org_validity_idx on public.split_configs (organization_id, valid_from, valid_until);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'split_configs_set_updated_at') then
    execute 'create trigger split_configs_set_updated_at before update on public.split_configs for each row execute function public.set_updated_at()';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'split_configs_status_check'
  ) then
    execute $c$
      alter table public.split_configs
      add constraint split_configs_status_check
      check (status in ('active', 'inactive'))
    $c$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'split_configs_validity_check'
  ) then
    execute $c$
      alter table public.split_configs
      add constraint split_configs_validity_check
      check (valid_until is null or valid_from is null or valid_until >= valid_from)
    $c$;
  end if;
end $$;

alter table public.split_rules
  add column if not exists split_config_id uuid null references public.split_configs(id) on delete cascade;

create index if not exists split_rules_org_split_config_idx on public.split_rules (organization_id, split_config_id);
create unique index if not exists split_rules_internal_active_receiver_uq
  on public.split_rules (organization_id, split_config_id, receiver_id)
  where split_config_id is not null and status = 'active';

alter table public.split_configs enable row level security;
alter table public.split_configs force row level security;

drop policy if exists split_configs_all on public.split_configs;
create policy split_configs_all on public.split_configs
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));
