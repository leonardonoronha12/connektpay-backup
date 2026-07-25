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
security definer
set search_path = public, auth
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.current_organization_ids() from public;
grant execute on function public.current_organization_ids() to authenticated;

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
  requested_at timestamptz null,
  paid_at timestamptz null,
  failed_at timestamptz null,
  canceled_at timestamptz null,
  scheduled_for timestamptz null,
  provider_reference text null,
  provider_payload jsonb not null default '{}'::jsonb,
  is_internal boolean not null default false,
  bank_account_snapshot jsonb null default null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  rejection_reason text null,
  internal_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payouts_org_idx on public.payouts (organization_id);
create index if not exists payouts_org_status_idx on public.payouts (organization_id, status);
create index if not exists payouts_org_scheduled_for_idx on public.payouts (organization_id, scheduled_for);
create index if not exists payouts_org_internal_status_idx on public.payouts (organization_id, is_internal, status);
create index if not exists payouts_org_internal_receiver_idx on public.payouts (organization_id, is_internal, receiver_id);

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

create or replace function public.ensure_profile_and_org()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  email text;
  existing_org_id uuid;
  new_org_id uuid;
  domain text;
  base text;
  org_name text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  select p.organization_id into existing_org_id
  from public.profiles p
  where p.id = uid;

  if existing_org_id is not null then
    return existing_org_id;
  end if;

  select au.email into email
  from auth.users au
  where au.id = uid;

  if email is null or length(trim(email)) = 0 then
    raise exception 'Missing user email';
  end if;

  domain := split_part(email, '@', 2);
  base := split_part(domain, '.', 1);
  org_name := case when base is not null and length(base) > 0 then upper(base) else 'Minha organização' end;

  insert into public.organizations (name, document)
  values (org_name, null)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, role, phone)
  values (uid, new_org_id, email, null, 'owner', null);

  insert into public.provider_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  return new_org_id;
end;
$$;

grant execute on function public.ensure_profile_and_org() to authenticated;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  email text;
  domain text;
  base text;
  org_name text;
  new_org_id uuid;
begin
  email := new.email;
  if email is null or length(trim(email)) = 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.id::text));

  if exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;

  domain := split_part(email, '@', 2);
  base := split_part(domain, '.', 1);
  org_name := case when base is not null and length(base) > 0 then upper(base) else 'Minha organização' end;

  insert into public.organizations (name, document)
  values (org_name, null)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, role, phone)
  values (new.id, new_org_id, email, null, 'owner', null);

  insert into public.provider_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'auth_users_create_profile_org') then
    execute 'create trigger auth_users_create_profile_org after insert on auth.users for each row execute function public.handle_auth_user_created()';
  end if;
end $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.receivers enable row level security;
alter table public.payment_links enable row level security;
alter table public.transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.split_rules enable row level security;
alter table public.split_configs enable row level security;
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

drop policy if exists split_configs_all on public.split_configs;
create policy split_configs_all on public.split_configs
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

drop function if exists public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid);

create or replace function public.append_ledger_entry(
  p_organization_id uuid,
  p_type text,
  p_direction text,
  p_amount bigint,
  p_origin text default 'system',
  p_occurred_at timestamptz default now(),
  p_transaction_id uuid default null,
  p_payout_id uuid default null,
  p_anticipation_request_id uuid default null
)
returns public.ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
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

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  select le.balance_after
  into prev_balance
  from public.ledger_entries le
  where le.organization_id = p_organization_id
  order by le.occurred_at desc, le.created_at desc
  limit 1;

  prev_balance := coalesce(prev_balance, 0);
  next_balance := case when p_direction = 'credit' then prev_balance + p_amount else prev_balance - p_amount end;

  insert into public.ledger_entries (
    organization_id,
    transaction_id,
    payout_id,
    anticipation_request_id,
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

revoke all on function public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid) from public;
grant execute on function public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid) to authenticated;

create table if not exists public.api_rate_limits (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_key_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  primary key (organization_id, api_key_hash, window_start)
);

create index if not exists api_rate_limits_org_idx on public.api_rate_limits (organization_id);
create index if not exists api_rate_limits_window_idx on public.api_rate_limits (window_start desc);

create or replace function public.rate_limit_check(p_organization_id uuid, p_api_key_hash text, p_limit int, p_window_seconds int default 60)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ws timestamptz;
  next_count int;
begin
  if p_organization_id is null or p_api_key_hash is null then
    return false;
  end if;
  if p_limit is null or p_limit <= 0 then
    return true;
  end if;

  ws := date_trunc('second', now() - (extract(epoch from now())::int % p_window_seconds) * interval '1 second');
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || p_api_key_hash || ':' || ws::text));

  insert into public.api_rate_limits (organization_id, api_key_hash, window_start, count)
  values (p_organization_id, p_api_key_hash, ws, 1)
  on conflict (organization_id, api_key_hash, window_start)
  do update set count = public.api_rate_limits.count + 1
  returning count into next_count;

  return next_count <= p_limit;
end;
$$;

revoke all on function public.rate_limit_check(uuid, text, int, int) from public;
grant execute on function public.rate_limit_check(uuid, text, int, int) to authenticated;

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public;
revoke all on table public.api_rate_limits from anon;
revoke all on table public.api_rate_limits from authenticated;

alter table public.webhook_events
  add column if not exists provider_event_id text null,
  add column if not exists processed_at timestamptz null,
  add column if not exists next_retry_at timestamptz null;

create unique index if not exists webhook_events_org_provider_event_uq
  on public.webhook_events (organization_id, provider_event_id)
  where provider_event_id is not null;

create index if not exists webhook_events_org_next_retry_idx on public.webhook_events (organization_id, next_retry_at);

create table if not exists public.webhook_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  webhook_event_id uuid not null references public.webhook_events(id) on delete cascade,
  attempt int not null,
  status text not null,
  error text null,
  duration_ms int null,
  created_at timestamptz not null default now()
);

create index if not exists webhook_attempts_event_idx on public.webhook_attempts (webhook_event_id);
create index if not exists webhook_attempts_org_idx on public.webhook_attempts (organization_id);
create index if not exists webhook_attempts_org_created_at_idx on public.webhook_attempts (organization_id, created_at desc);

alter table public.webhook_attempts enable row level security;

drop policy if exists webhook_attempts_all on public.webhook_attempts;
create policy webhook_attempts_all on public.webhook_attempts
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

alter table public.audit_logs
add column if not exists origin text not null default 'internal_api';

alter table public.audit_logs
add column if not exists actor_user_id uuid null;

create index if not exists audit_logs_org_origin_created_at_idx on public.audit_logs (organization_id, origin, created_at desc);

alter table public.organizations force row level security;
alter table public.profiles force row level security;
alter table public.customers force row level security;
alter table public.receivers force row level security;
alter table public.payment_links force row level security;
alter table public.transactions force row level security;
alter table public.subscriptions force row level security;
alter table public.split_rules force row level security;
alter table public.split_configs force row level security;
alter table public.ledger_entries force row level security;
alter table public.anticipation_requests force row level security;
alter table public.payouts force row level security;
alter table public.webhook_events force row level security;
alter table public.kyc_requests force row level security;
alter table public.audit_logs force row level security;
alter table public.provider_settings force row level security;
alter table public.webhook_attempts force row level security;
alter table public.conciliation_runs force row level security;
alter table public.conciliation_items force row level security;
alter table public.api_rate_limits force row level security;

alter table public.organizations
  add column if not exists legal_name text null,
  add column if not exists segment text null,
  add column if not exists website text null;

alter table public.profiles
  add column if not exists title text null;

alter table public.receivers
  add column if not exists provider_reference text null;

create index if not exists receivers_org_provider_ref_idx on public.receivers (organization_id, provider_reference);

alter table public.transactions
  add column if not exists public_token uuid null;

update public.transactions
set public_token = gen_random_uuid()
where public_token is null;

alter table public.transactions
  alter column public_token set not null;

create unique index if not exists transactions_public_token_uq on public.transactions (public_token);

alter table public.payment_links
  add column if not exists provider_reference text null,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists provider_status text null,
  add column if not exists provider_url text null,
  add column if not exists provider_synced_at timestamptz null,
  add column if not exists provider_last_error text null,
  add column if not exists provider_last_error_at timestamptz null;

create index if not exists payment_links_org_provider_ref_idx on public.payment_links (organization_id, provider_reference);
create index if not exists payment_links_org_provider_status_idx on public.payment_links (organization_id, provider_status);

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
  add column if not exists percentage_bps int null,
  add column if not exists split_config_id uuid null references public.split_configs(id) on delete cascade;

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

create index if not exists split_rules_org_split_config_idx on public.split_rules (organization_id, split_config_id);
create unique index if not exists split_rules_internal_active_receiver_uq
  on public.split_rules (organization_id, split_config_id, receiver_id)
  where split_config_id is not null and status = 'active';

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

create table if not exists public.pay_plano (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recebedor_id uuid not null references public.receivers(id) on delete restrict,
  payment_link_id uuid null references public.payment_links(id) on delete set null,
  name text not null,
  description text null,
  amount_centavos bigint not null,
  currency text not null default 'BRL',
  cycle text not null,
  trial_days int not null default 0,
  billing_cycles_limit int null,
  is_infinite boolean not null default true,
  status text not null default 'active',
  starts_at timestamptz null,
  ends_at timestamptz null,
  internal_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_plano_org_idx on public.pay_plano (organization_id);
create index if not exists pay_plano_org_status_idx on public.pay_plano (organization_id, status);
create index if not exists pay_plano_org_receiver_idx on public.pay_plano (organization_id, recebedor_id);
create unique index if not exists pay_plano_org_payment_link_uq on public.pay_plano (organization_id, payment_link_id) where payment_link_id is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_plano_set_updated_at') then
    execute 'create trigger pay_plano_set_updated_at before update on public.pay_plano for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_pagador (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text null,
  document text null,
  phone text null,
  card_token_ref text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_pagador_org_idx on public.pay_pagador (organization_id);
create index if not exists pay_pagador_org_email_idx on public.pay_pagador (organization_id, email);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_pagador_set_updated_at') then
    execute 'create trigger pay_pagador_set_updated_at before update on public.pay_pagador for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_assinatura (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plano_id uuid not null references public.pay_plano(id) on delete restrict,
  pagador_id uuid not null references public.pay_pagador(id) on delete restrict,
  recebedor_id uuid not null references public.receivers(id) on delete restrict,
  status text not null default 'pending',
  next_charge_at timestamptz null,
  attempts_failed int not null default 0,
  acquirer_subscription_id text null,
  last_charge_at timestamptz null,
  canceled_at timestamptz null,
  joined_at timestamptz not null default now(),
  paused_at timestamptz null,
  resumed_at timestamptz null,
  expires_at timestamptz null,
  billing_cycles_completed int not null default 0,
  internal_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_assinatura_org_idx on public.pay_assinatura (organization_id);
create index if not exists pay_assinatura_org_status_idx on public.pay_assinatura (organization_id, status);
create index if not exists pay_assinatura_org_next_charge_idx on public.pay_assinatura (organization_id, next_charge_at);
create index if not exists pay_assinatura_org_plano_idx on public.pay_assinatura (organization_id, plano_id);
create index if not exists pay_assinatura_org_pagador_idx on public.pay_assinatura (organization_id, pagador_id);
create unique index if not exists pay_assinatura_org_acquirer_sub_uq on public.pay_assinatura (organization_id, acquirer_subscription_id) where acquirer_subscription_id is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_assinatura_set_updated_at') then
    execute 'create trigger pay_assinatura_set_updated_at before update on public.pay_assinatura for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assinatura_id uuid not null references public.pay_assinatura(id) on delete cascade,
  provider_event_id text null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pay_subscription_events_org_idx on public.pay_subscription_events (organization_id);
create index if not exists pay_subscription_events_assinatura_idx on public.pay_subscription_events (assinatura_id, created_at desc);
create unique index if not exists pay_subscription_events_org_provider_uq on public.pay_subscription_events (organization_id, provider_event_id) where provider_event_id is not null;

alter table public.pay_plano enable row level security;
alter table public.pay_pagador enable row level security;
alter table public.pay_assinatura enable row level security;
alter table public.pay_subscription_events enable row level security;

alter table public.pay_plano force row level security;
alter table public.pay_pagador force row level security;
alter table public.pay_assinatura force row level security;
alter table public.pay_subscription_events force row level security;

drop policy if exists pay_plano_all on public.pay_plano;
create policy pay_plano_all on public.pay_plano
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_pagador_all on public.pay_pagador;
create policy pay_pagador_all on public.pay_pagador
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_assinatura_all on public.pay_assinatura;
create policy pay_assinatura_all on public.pay_assinatura
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_subscription_events_all on public.pay_subscription_events;
create policy pay_subscription_events_all on public.pay_subscription_events
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

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
  eligible_amount_centavos bigint null,
  net_amount_centavos bigint null,
  fee_centavos bigint null,
  fee_bps int null,
  estimated_fee_centavos bigint null,
  estimated_fee_bps int null,
  expected_settlement_days int null,
  expected_settlement_at timestamptz null,
  status text not null default 'pending',
  acquirer_anticipation_id text null,
  provider_reference text null,
  provider_payload jsonb not null default '{}'::jsonb,
  provider_status text null,
  provider_last_error text null,
  is_internal boolean not null default false,
  eligibility_snapshot jsonb null default null,
  requested_at timestamptz null,
  approved_at timestamptz null,
  executed_at timestamptz null,
  paid_at timestamptz null,
  rejected_at timestamptz null,
  canceled_at timestamptz null,
  rejection_reason text null,
  internal_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pay_antecipacao
  add column if not exists provider_reference text null,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists is_internal boolean not null default false,
  add column if not exists eligible_amount_centavos bigint null,
  add column if not exists estimated_fee_centavos bigint null,
  add column if not exists estimated_fee_bps int null,
  add column if not exists expected_settlement_days int null,
  add column if not exists expected_settlement_at timestamptz null,
  add column if not exists paid_at timestamptz null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null,
  add column if not exists internal_notes text null,
  add column if not exists eligibility_snapshot jsonb null default null,
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
create index if not exists pay_antecipacao_org_internal_status_idx on public.pay_antecipacao (organization_id, is_internal, status);
create index if not exists pay_antecipacao_org_internal_receiver_idx on public.pay_antecipacao (organization_id, is_internal, recebedor_id);
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

create table if not exists public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receiver_id uuid not null references public.receivers(id) on delete cascade,
  kyc_request_id uuid null references public.kyc_requests(id) on delete set null,
  doc_type text not null,
  storage_bucket text not null default 'kyc-documents',
  storage_path text not null,
  original_filename text null,
  mime_type text null,
  size_bytes bigint null,
  created_at timestamptz not null default now()
);

create index if not exists kyc_documents_org_idx on public.kyc_documents (organization_id);
create index if not exists kyc_documents_receiver_idx on public.kyc_documents (receiver_id, created_at desc);
create index if not exists kyc_documents_request_idx on public.kyc_documents (kyc_request_id, created_at desc);

alter table public.kyc_documents enable row level security;
alter table public.kyc_documents force row level security;

drop policy if exists kyc_documents_all on public.kyc_documents;
create policy kyc_documents_all on public.kyc_documents
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    execute $q$
      insert into storage.buckets (id, name, public)
      values ('kyc-documents', 'kyc-documents', false)
      on conflict (id) do nothing
    $q$;
  end if;
end $$;

alter table public.receivers
  add column if not exists type text null,
  add column if not exists legal_name text null,
  add column if not exists email text null,
  add column if not exists phone text null,
  add column if not exists address jsonb null;

update public.receivers
set address = '{}'::jsonb
where address is null;

alter table public.receivers
  alter column address set default '{}'::jsonb;

alter table public.kyc_requests
  add column if not exists decision_reason text null;

create table if not exists public.payout_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payout_id uuid not null references public.payouts(id) on delete cascade,
  event_type text not null,
  provider_event_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payout_events_org_idx on public.payout_events (organization_id);
create index if not exists payout_events_payout_idx on public.payout_events (payout_id, created_at desc);
create index if not exists payout_events_provider_event_idx on public.payout_events (provider_event_id);

alter table public.payout_events enable row level security;
alter table public.payout_events force row level security;

drop policy if exists payout_events_all on public.payout_events;
create policy payout_events_all on public.payout_events
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

alter table public.payouts
  add column if not exists requested_at timestamptz null,
  add column if not exists paid_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists canceled_at timestamptz null,
  add column if not exists provider_status text null,
  add column if not exists provider_last_error text null,
  add column if not exists provider_last_error_at timestamptz null,
  add column if not exists is_internal boolean not null default false,
  add column if not exists bank_account_snapshot jsonb null default null,
  add column if not exists approved_at timestamptz null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null,
  add column if not exists internal_notes text null;

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete set null,
  to_email text not null,
  template text not null,
  subject text not null,
  status text not null default 'pending',
  error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_logs_org_idx on public.email_logs (organization_id);
create index if not exists email_logs_created_at_idx on public.email_logs (created_at desc);
create index if not exists email_logs_status_idx on public.email_logs (status);

alter table public.email_logs enable row level security;
alter table public.email_logs force row level security;

drop policy if exists email_logs_read on public.email_logs;
create policy email_logs_read on public.email_logs
for select
to authenticated
using (organization_id in (select * from public.current_organization_ids()) or organization_id is null);

alter table public.pay_plano
  add column if not exists payment_method text null,
  add column if not exists currency text null,
  add column if not exists billing_cycles_limit int null,
  add column if not exists is_infinite boolean not null default true,
  add column if not exists starts_at timestamptz null,
  add column if not exists ends_at timestamptz null,
  add column if not exists internal_notes text null;

update public.pay_plano
set payment_method = coalesce(payment_method, 'card'),
    currency = coalesce(currency, 'BRL'),
    is_infinite = coalesce(is_infinite, billing_cycles_limit is null, true)
where payment_method is null or currency is null or is_infinite is null;

alter table public.pay_plano
  alter column payment_method set not null,
  alter column currency set not null;

alter table public.pay_assinatura
  add column if not exists payment_method text null,
  add column if not exists pix_auto_authorization_status text null,
  add column if not exists pix_auto_authorization_id text null,
  add column if not exists pix_auto_authorized_at timestamptz null,
  add column if not exists pix_auto_canceled_at timestamptz null,
  add column if not exists joined_at timestamptz null,
  add column if not exists paused_at timestamptz null,
  add column if not exists resumed_at timestamptz null,
  add column if not exists expires_at timestamptz null,
  add column if not exists billing_cycles_completed int null,
  add column if not exists internal_notes text null;

update public.pay_assinatura
set payment_method = coalesce(payment_method, 'card'),
    joined_at = coalesce(joined_at, created_at),
    billing_cycles_completed = coalesce(billing_cycles_completed, 0)
where payment_method is null or joined_at is null or billing_cycles_completed is null;

alter table public.pay_assinatura
  alter column payment_method set not null,
  alter column joined_at set not null,
  alter column billing_cycles_completed set not null;

alter table public.receivers
  add column if not exists internal_status text not null default 'draft',
  add column if not exists birth_date date null,
  add column if not exists trade_name text null,
  add column if not exists legal_responsible_name text null,
  add column if not exists legal_responsible_document text null,
  add column if not exists provider_status text null,
  add column if not exists provider_synced_at timestamptz null,
  add column if not exists provider_last_error text null,
  add column if not exists provider_last_error_at timestamptz null;

update public.receivers
set document = regexp_replace(coalesce(document, ''), '\D', '', 'g')
where document ~ '\D';

update public.receivers
set legal_responsible_document = regexp_replace(coalesce(legal_responsible_document, ''), '\D', '', 'g')
where legal_responsible_document is not null
  and legal_responsible_document ~ '\D';

create index if not exists receivers_org_internal_status_idx on public.receivers (organization_id, internal_status);
create unique index if not exists receivers_org_document_uq on public.receivers (organization_id, document);
create unique index if not exists receivers_org_provider_reference_uq on public.receivers (organization_id, provider_reference) where provider_reference is not null;

alter table public.kyc_requests
  add column if not exists internal_notes text null,
  add column if not exists checklist jsonb not null default '{}'::jsonb,
  add column if not exists reviewed_by_profile_id uuid null references public.profiles(id) on delete set null,
  add column if not exists provider_status text null,
  add column if not exists provider_last_error text null,
  add column if not exists provider_last_error_at timestamptz null;

create index if not exists kyc_requests_org_status_idx on public.kyc_requests (organization_id, status, created_at desc);

alter table public.kyc_documents
  add column if not exists checksum_sha256 text null,
  add column if not exists status text not null default 'uploaded',
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by_profile_id uuid null references public.profiles(id) on delete set null;

create index if not exists kyc_documents_org_status_idx on public.kyc_documents (organization_id, status, created_at desc);
create unique index if not exists kyc_documents_receiver_checksum_uq on public.kyc_documents (organization_id, receiver_id, doc_type, checksum_sha256) where checksum_sha256 is not null and deleted_at is null;
