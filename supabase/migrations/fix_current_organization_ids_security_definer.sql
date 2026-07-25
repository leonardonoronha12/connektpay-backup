create or replace function public.current_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.current_organization_ids() from public;
grant execute on function public.current_organization_ids() to authenticated;
