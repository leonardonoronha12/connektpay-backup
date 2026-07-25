create or replace function public.ensure_profile_and_org()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  email text;
  existing_org_id uuid;
  new_org_id uuid;
  domain text;
  base text;
  org_name text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  select p.organization_id into existing_org_id
  from public.profiles p
  where p.id = uid;

  if existing_org_id is not null then
    return existing_org_id;
  end if;

  select au.email into email
  from auth.users au
  where au.id = uid;

  if email is null or length(trim(email)) = 0 then
    raise exception 'Missing user email';
  end if;

  domain := split_part(email, '@', 2);
  base := split_part(domain, '.', 1);
  org_name := case when base is not null and length(base) > 0 then upper(base) else 'Minha organização' end;

  insert into public.organizations (name, document)
  values (org_name, null)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, role, phone)
  values (uid, new_org_id, email, null, 'owner', null);

  insert into public.provider_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  return new_org_id;
end;
$$;

grant execute on function public.ensure_profile_and_org() to authenticated;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  email text;
  domain text;
  base text;
  org_name text;
  new_org_id uuid;
begin
  email := new.email;
  if email is null or length(trim(email)) = 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.id::text));

  if exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;

  domain := split_part(email, '@', 2);
  base := split_part(domain, '.', 1);
  org_name := case when base is not null and length(base) > 0 then upper(base) else 'Minha organização' end;

  insert into public.organizations (name, document)
  values (org_name, null)
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, full_name, role, phone)
  values (new.id, new_org_id, email, null, 'owner', null);

  insert into public.provider_settings (organization_id)
  values (new_org_id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'auth_users_create_profile_org') then
    execute 'create trigger auth_users_create_profile_org after insert on auth.users for each row execute function public.handle_auth_user_created()';
  end if;
end $$;

