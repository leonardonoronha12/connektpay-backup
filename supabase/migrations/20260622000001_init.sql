create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('owner', 'admin', 'financeiro', 'operacional', 'viewer', 'super_admin');
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    alter type public.user_role add value if not exists 'owner';
    alter type public.user_role add value if not exists 'admin';
    alter type public.user_role add value if not exists 'financeiro';
    alter type public.user_role add value if not exists 'operacional';
    alter type public.user_role add value if not exists 'viewer';
    alter type public.user_role add value if not exists 'super_admin';
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'organizations_set_updated_at') then
    execute 'create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text null,
  role public.user_role not null default 'viewer',
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_org_email_uq on public.profiles (organization_id, email);
create index if not exists profiles_org_idx on public.profiles (organization_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_set_updated_at') then
    execute 'create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at()';
  end if;
end $$;

create or replace function public.current_organization_ids()
returns setof uuid
language sql
stable
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid();
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text null,
  document text null,
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_org_idx on public.customers (organization_id);
create index if not exists customers_org_email_idx on public.customers (organization_id, email);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'customers_set_updated_at') then
    execute 'create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.receivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document text not null,
  bank_account jsonb not null default '{}'::jsonb,
  kyc_status text not null default 'pending',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receivers_org_idx on public.receivers (organization_id);
create index if not exists receivers_org_kyc_idx on public.receivers (organization_id, kyc_status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'receivers_set_updated_at') then
    execute 'create trigger receivers_set_updated_at before update on public.receivers for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text null,
  amount bigint not null,
  currency text not null default 'BRL',
  type text not null default 'one_time',
  methods jsonb not null default '{}'::jsonb,
  max_installments int null,
  status text not null default 'active',
  slug text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_links_org_slug_uq on public.payment_links (organization_id, slug);
create index if not exists payment_links_org_idx on public.payment_links (organization_id);
create index if not exists payment_links_org_status_idx on public.payment_links (organization_id, status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'payment_links_set_updated_at') then
    execute 'create trigger payment_links_set_updated_at before update on public.payment_links for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid null references public.customers(id) on delete set null,
  payment_link_id uuid null references public.payment_links(id) on delete set null,
  amount bigint not null,
  currency text not null default 'BRL',
  method text not null,
  status text not null default 'pending',
  provider_reference text null,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_org_idx on public.transactions (organization_id);
create index if not exists transactions_org_status_idx on public.transactions (organization_id, status);
create index if not exists transactions_org_created_at_idx on public.transactions (organization_id, created_at desc);
create index if not exists transactions_provider_ref_idx on public.transactions (provider_reference);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'transactions_set_updated_at') then
    execute 'create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  payment_link_id uuid null references public.payment_links(id) on delete set null,
  amount bigint not null,
  currency text not null default 'BRL',
  interval text not null default 'monthly',
  status text not null default 'active',
  next_billing_at timestamptz null,
  provider_reference text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_org_idx on public.subscriptions (organization_id);
create index if not exists subscriptions_org_status_idx on public.subscriptions (organization_id, status);
create index if not exists subscriptions_org_next_billing_idx on public.subscriptions (organization_id, next_billing_at);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'subscriptions_set_updated_at') then
    execute 'create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.split_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receiver_id uuid not null references public.receivers(id) on delete restrict,
  payment_link_id uuid null references public.payment_links(id) on delete set null,
  type text not null,
  value numeric not null,
  priority int not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists split_rules_org_idx on public.split_rules (organization_id);
create index if not exists split_rules_org_receiver_idx on public.split_rules (organization_id, receiver_id);
create index if not exists split_rules_org_payment_link_idx on public.split_rules (organization_id, payment_link_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'split_rules_set_updated_at') then
    execute 'create trigger split_rules_set_updated_at before update on public.split_rules for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.anticipation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receiver_id uuid null references public.receivers(id) on delete set null,
  requested_amount bigint not null,
  fee_rate numeric null,
  fee_amount bigint null,
  net_amount bigint null,
  status text not null default 'requested',
  provider_reference text null,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anticipation_requests_org_idx on public.anticipation_requests (organization_id);
create index if not exists anticipation_requests_org_status_idx on public.anticipation_requests (organization_id, status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'anticipation_requests_set_updated_at') then
    execute 'create trigger anticipation_requests_set_updated_at before update on public.anticipation_requests for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receiver_id uuid not null references public.receivers(id) on delete restrict,
  gross_amount bigint not null,
  fee_amount bigint null,
  net_amount bigint null,
  status text not null default 'scheduled',
  scheduled_for timestamptz null,
  provider_reference text null,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payouts_org_idx on public.payouts (organization_id);
create index if not exists payouts_org_status_idx on public.payouts (organization_id, status);
create index if not exists payouts_org_scheduled_for_idx on public.payouts (organization_id, scheduled_for);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'payouts_set_updated_at') then
    execute 'create trigger payouts_set_updated_at before update on public.payouts for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid null references public.transactions(id) on delete set null,
  payout_id uuid null references public.payouts(id) on delete set null,
  anticipation_request_id uuid null references public.anticipation_requests(id) on delete set null,
  type text not null,
  direction text not null,
  amount bigint not null,
  balance_after bigint not null,
  origin text not null default 'system',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_org_idx on public.ledger_entries (organization_id);
create index if not exists ledger_entries_org_occurred_at_idx on public.ledger_entries (organization_id, occurred_at desc);
create index if not exists ledger_entries_tx_idx on public.ledger_entries (transaction_id);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,
  origin text not null default 'provider',
  status text not null default 'pending',
  attempts int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_events_org_idx on public.webhook_events (organization_id);
create index if not exists webhook_events_org_status_idx on public.webhook_events (organization_id, status);
create index if not exists webhook_events_org_created_at_idx on public.webhook_events (organization_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'webhook_events_set_updated_at') then
    execute 'create trigger webhook_events_set_updated_at before update on public.webhook_events for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.kyc_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receiver_id uuid null references public.receivers(id) on delete set null,
  status text not null default 'pending',
  risk text null,
  submitted_at timestamptz null,
  reviewed_at timestamptz null,
  decision_reason text null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_requests_org_idx on public.kyc_requests (organization_id);
create index if not exists kyc_requests_org_status_idx on public.kyc_requests (organization_id, status);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'kyc_requests_set_updated_at') then
    execute 'create trigger kyc_requests_set_updated_at before update on public.kyc_requests for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity text not null,
  entity_id uuid null,
  before jsonb null,
  after jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_org_idx on public.audit_logs (organization_id);
create index if not exists audit_logs_org_created_at_idx on public.audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create table if not exists public.provider_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment text not null default 'production',
  base_url text null,
  webhook_url text null,
  timeout_seconds int not null default 30,
  retry_policy jsonb not null default '{"max_attempts":3,"backoff":"exponential"}'::jsonb,
  status text not null default 'connected',
  last_sync_at timestamptz null,
  secrets jsonb not null default '{}'::jsonb,
  api_keys jsonb not null default '[]'::jsonb,
  tokens jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists provider_settings_org_uq on public.provider_settings (organization_id);
create index if not exists provider_settings_org_idx on public.provider_settings (organization_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'provider_settings_set_updated_at') then
    execute 'create trigger provider_settings_set_updated_at before update on public.provider_settings for each row execute function public.set_updated_at()';
  end if;
end $$;

create or replace function public.create_organization_with_owner(org_name text, org_document text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid;
  email text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select au.email into email from auth.users au where au.id = uid;
  if email is null then
    raise exception 'Missing user email';
  end if;

  insert into public.organizations (name, document)
  values (org_name, org_document)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, role)
  values (uid, new_org_id, email, null, 'owner');

  insert into public.provider_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  return new_org_id;
end;
$$;

grant execute on function public.create_organization_with_owner(text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.receivers enable row level security;
alter table public.payment_links enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.split_rules enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.anticipation_requests enable row level security;
alter table public.payouts enable row level security;
alter table public.webhook_events enable row level security;
alter table public.kyc_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.provider_settings enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
for select
to authenticated
using (id in (select * from public.current_organization_ids()));

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
for insert
to authenticated
with check (false);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
for update
to authenticated
using (id in (select * from public.current_organization_ids()))
with check (id in (select * from public.current_organization_ids()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
to authenticated
using (organization_id in (select * from public.current_organization_ids()));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert
to authenticated
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists customers_all on public.customers;
create policy customers_all on public.customers
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists receivers_all on public.receivers;
create policy receivers_all on public.receivers
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists payment_links_all on public.payment_links;
create policy payment_links_all on public.payment_links
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists transactions_all on public.transactions;
create policy transactions_all on public.transactions
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists subscriptions_all on public.subscriptions;
create policy subscriptions_all on public.subscriptions
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists split_rules_all on public.split_rules;
create policy split_rules_all on public.split_rules
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists anticipation_requests_all on public.anticipation_requests;
create policy anticipation_requests_all on public.anticipation_requests
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists payouts_all on public.payouts;
create policy payouts_all on public.payouts
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists ledger_entries_all on public.ledger_entries;
create policy ledger_entries_all on public.ledger_entries
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists webhook_events_all on public.webhook_events;
create policy webhook_events_all on public.webhook_events
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists kyc_requests_all on public.kyc_requests;
create policy kyc_requests_all on public.kyc_requests
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists provider_settings_all on public.provider_settings;
create policy provider_settings_all on public.provider_settings
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
for select
to authenticated
using (organization_id in (select * from public.current_organization_ids()));

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
for insert
to authenticated
with check (organization_id in (select * from public.current_organization_ids()));

revoke update, delete on public.audit_logs from authenticated;

