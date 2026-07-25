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

