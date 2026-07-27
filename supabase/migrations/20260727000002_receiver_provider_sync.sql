alter table public.receivers
  add column if not exists external_status text null,
  add column if not exists provider_request_id text null;

drop index if exists public.receivers_org_document_uq;
create unique index if not exists receivers_org_provider_env_document_uq
  on public.receivers (organization_id, provider, provider_environment, document)
  where provider is not null and provider_environment is not null and document is not null;

drop index if exists public.receivers_org_provider_reference_uq;
create unique index if not exists receivers_org_provider_env_reference_uq
  on public.receivers (organization_id, provider, provider_environment, provider_reference)
  where provider_reference is not null and provider is not null and provider_environment is not null;
