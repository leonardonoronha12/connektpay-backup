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
  add column if not exists address jsonb null,
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
set address = '{}'::jsonb
where address is null;

alter table public.receivers
  alter column address set default '{}'::jsonb;

update public.receivers
set document = regexp_replace(coalesce(document, ''), '\D', '', 'g')
where document ~ '\D';

update public.receivers
set type = case
  when length(regexp_replace(coalesce(document, ''), '\D', '', 'g')) = 11 then 'pf'
  when length(regexp_replace(coalesce(document, ''), '\D', '', 'g')) = 14 then 'pj'
  else type
end
where type is null;

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
