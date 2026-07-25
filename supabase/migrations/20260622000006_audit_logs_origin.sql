alter table public.audit_logs
add column if not exists origin text not null default 'internal_api';

alter table public.audit_logs
add column if not exists actor_user_id uuid null;

create index if not exists audit_logs_org_origin_created_at_idx on public.audit_logs (organization_id, origin, created_at desc);

