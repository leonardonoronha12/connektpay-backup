create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,
  severity text not null default 'info',
  title text not null,
  message text not null,
  href text null,
  source_type text null,
  source_id text null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notifications_org_idx on public.notifications (organization_id);
create index if not exists notifications_org_created_at_idx on public.notifications (organization_id, created_at desc);
create index if not exists notifications_org_unread_idx on public.notifications (organization_id, read_at, resolved_at);
create index if not exists notifications_org_source_idx on public.notifications (organization_id, source_type, source_id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'notifications_set_updated_at') then
    execute 'create trigger notifications_set_updated_at before update on public.notifications for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.notification_preferences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  webhook_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'notification_preferences_set_updated_at') then
    execute 'create trigger notification_preferences_set_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at()';
  end if;
end $$;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

drop policy if exists notifications_all on public.notifications;
create policy notifications_all on public.notifications
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists notification_preferences_all on public.notification_preferences;
create policy notification_preferences_all on public.notification_preferences
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));
