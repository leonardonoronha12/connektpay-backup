create table if not exists public.webhook_events_unresolved (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  type text not null,
  status text not null default 'pending',
  resolution_error text null,
  attempted_sources jsonb not null default '[]'::jsonb,
  correlation_snapshot jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  resolved_event_id uuid null references public.webhook_events(id) on delete set null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_events_unresolved_provider_event_uq unique (provider, provider_event_id)
);

create index if not exists webhook_events_unresolved_status_created_idx
  on public.webhook_events_unresolved (status, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'webhook_events_unresolved_set_updated_at'
  ) then
    execute 'create trigger webhook_events_unresolved_set_updated_at before update on public.webhook_events_unresolved for each row execute function public.set_updated_at()';
  end if;
end $$;

alter table public.webhook_events_unresolved enable row level security;
alter table public.webhook_events_unresolved force row level security;

revoke all on table public.webhook_events_unresolved from anon;
revoke all on table public.webhook_events_unresolved from authenticated;
