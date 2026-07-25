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

