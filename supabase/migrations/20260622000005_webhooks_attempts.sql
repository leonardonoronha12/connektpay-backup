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

