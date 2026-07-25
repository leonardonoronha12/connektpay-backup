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
