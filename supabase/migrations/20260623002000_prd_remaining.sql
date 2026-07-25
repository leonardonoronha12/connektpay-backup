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
  add column if not exists provider_last_error_at timestamptz null;

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
  add column if not exists payment_method text null;

update public.pay_plano
set payment_method = 'card'
where payment_method is null;

alter table public.pay_plano
  alter column payment_method set not null;

alter table public.pay_assinatura
  add column if not exists payment_method text null,
  add column if not exists pix_auto_authorization_status text null,
  add column if not exists pix_auto_authorization_id text null,
  add column if not exists pix_auto_authorized_at timestamptz null,
  add column if not exists pix_auto_canceled_at timestamptz null;

update public.pay_assinatura
set payment_method = coalesce(payment_method, 'card')
where payment_method is null;

alter table public.pay_assinatura
  alter column payment_method set not null;

