alter table public.organizations
  add column if not exists legal_name text null,
  add column if not exists segment text null,
  add column if not exists website text null;

alter table public.profiles
  add column if not exists title text null;

alter table public.receivers
  add column if not exists provider_reference text null;

create index if not exists receivers_org_provider_ref_idx on public.receivers (organization_id, provider_reference);

