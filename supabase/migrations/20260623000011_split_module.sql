create table if not exists public.pay_taxa_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fee_fixed_amount bigint not null default 0,
  fee_percentage_bps int not null default 0,
  min_fee_amount bigint null,
  max_fee_amount bigint null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pay_taxa_config_org_uq on public.pay_taxa_config (organization_id);
create index if not exists pay_taxa_config_org_status_idx on public.pay_taxa_config (organization_id, status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_taxa_config_set_updated_at') then
    execute 'create trigger pay_taxa_config_set_updated_at before update on public.pay_taxa_config for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_transacao (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_link_id uuid null references public.payment_links(id) on delete set null,
  gross_amount bigint not null,
  connekt_fee_amount bigint not null,
  receiver_total_amount bigint not null,
  currency text not null default 'BRL',
  status text not null default 'created',
  provider_reference text null,
  provider_payload jsonb not null default '{}'::jsonb,
  provider_split_payload jsonb not null default '{}'::jsonb,
  provider_last_error text null,
  provider_last_error_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_transacao_org_created_at_idx on public.pay_transacao (organization_id, created_at desc);
create index if not exists pay_transacao_org_status_idx on public.pay_transacao (organization_id, status);
create index if not exists pay_transacao_provider_ref_idx on public.pay_transacao (provider_reference);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_transacao_set_updated_at') then
    execute 'create trigger pay_transacao_set_updated_at before update on public.pay_transacao for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_split (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receiver_id uuid null references public.receivers(id) on delete set null,
  kind text not null,
  amount bigint not null,
  percentage_bps int not null default 0,
  rule_id uuid null references public.split_rules(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists pay_split_tx_kind_receiver_uq on public.pay_split (transaction_id, kind, receiver_id);
create index if not exists pay_split_org_created_at_idx on public.pay_split (organization_id, created_at desc);
create index if not exists pay_split_tx_idx on public.pay_split (transaction_id);

create table if not exists public.pay_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  receiver_id uuid null references public.receivers(id) on delete set null,
  type text not null,
  direction text not null,
  amount bigint not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists pay_ledger_tx_type_receiver_dir_uq on public.pay_ledger (transaction_id, type, receiver_id, direction);
create index if not exists pay_ledger_org_occurred_at_idx on public.pay_ledger (organization_id, occurred_at desc);
create index if not exists pay_ledger_tx_idx on public.pay_ledger (transaction_id);

alter table public.split_rules
  add column if not exists value_cents bigint null,
  add column if not exists percentage_bps int null;

update public.split_rules
set value_cents = round(value)::bigint
where type = 'fixed' and value_cents is null;

update public.split_rules
set percentage_bps = round((value * 100))::int
where type = 'percentage' and percentage_bps is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'split_rules_value_integrity'
  ) then
    execute $c$
      alter table public.split_rules
      add constraint split_rules_value_integrity
      check (
        (type = 'fixed' and value_cents is not null and percentage_bps is null)
        or
        (type = 'percentage' and percentage_bps is not null and value_cents is null)
      )
    $c$;
  end if;
end $$;

alter table public.pay_taxa_config enable row level security;
alter table public.pay_transacao enable row level security;
alter table public.pay_split enable row level security;
alter table public.pay_ledger enable row level security;

alter table public.pay_taxa_config force row level security;
alter table public.pay_transacao force row level security;
alter table public.pay_split force row level security;
alter table public.pay_ledger force row level security;

drop policy if exists pay_taxa_config_all on public.pay_taxa_config;
create policy pay_taxa_config_all on public.pay_taxa_config
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_transacao_all on public.pay_transacao;
create policy pay_transacao_all on public.pay_transacao
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_split_all on public.pay_split;
create policy pay_split_all on public.pay_split
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_ledger_all on public.pay_ledger;
create policy pay_ledger_all on public.pay_ledger
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

