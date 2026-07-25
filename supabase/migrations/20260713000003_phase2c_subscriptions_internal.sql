create table if not exists public.pay_plano (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recebedor_id uuid not null references public.receivers(id) on delete restrict,
  payment_link_id uuid null references public.payment_links(id) on delete set null,
  name text not null,
  description text null,
  amount_centavos bigint not null,
  cycle text not null,
  trial_days int not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_plano_org_idx on public.pay_plano (organization_id);
create index if not exists pay_plano_org_status_idx on public.pay_plano (organization_id, status);
create index if not exists pay_plano_org_receiver_idx on public.pay_plano (organization_id, recebedor_id);
create unique index if not exists pay_plano_org_payment_link_uq on public.pay_plano (organization_id, payment_link_id) where payment_link_id is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_plano_set_updated_at') then
    execute 'create trigger pay_plano_set_updated_at before update on public.pay_plano for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_pagador (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text null,
  document text null,
  phone text null,
  card_token_ref text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_pagador_org_idx on public.pay_pagador (organization_id);
create index if not exists pay_pagador_org_email_idx on public.pay_pagador (organization_id, email);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_pagador_set_updated_at') then
    execute 'create trigger pay_pagador_set_updated_at before update on public.pay_pagador for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_assinatura (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plano_id uuid not null references public.pay_plano(id) on delete restrict,
  pagador_id uuid not null references public.pay_pagador(id) on delete restrict,
  recebedor_id uuid not null references public.receivers(id) on delete restrict,
  status text not null default 'pending',
  next_charge_at timestamptz null,
  attempts_failed int not null default 0,
  acquirer_subscription_id text null,
  last_charge_at timestamptz null,
  canceled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pay_assinatura_org_idx on public.pay_assinatura (organization_id);
create index if not exists pay_assinatura_org_status_idx on public.pay_assinatura (organization_id, status);
create index if not exists pay_assinatura_org_next_charge_idx on public.pay_assinatura (organization_id, next_charge_at);
create index if not exists pay_assinatura_org_plano_idx on public.pay_assinatura (organization_id, plano_id);
create index if not exists pay_assinatura_org_pagador_idx on public.pay_assinatura (organization_id, pagador_id);
create unique index if not exists pay_assinatura_org_acquirer_sub_uq on public.pay_assinatura (organization_id, acquirer_subscription_id) where acquirer_subscription_id is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pay_assinatura_set_updated_at') then
    execute 'create trigger pay_assinatura_set_updated_at before update on public.pay_assinatura for each row execute function public.set_updated_at()';
  end if;
end $$;

create table if not exists public.pay_subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assinatura_id uuid not null references public.pay_assinatura(id) on delete cascade,
  provider_event_id text null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pay_subscription_events_org_idx on public.pay_subscription_events (organization_id);
create index if not exists pay_subscription_events_assinatura_idx on public.pay_subscription_events (assinatura_id, created_at desc);
create unique index if not exists pay_subscription_events_org_provider_uq on public.pay_subscription_events (organization_id, provider_event_id) where provider_event_id is not null;

alter table public.pay_plano enable row level security;
alter table public.pay_pagador enable row level security;
alter table public.pay_assinatura enable row level security;
alter table public.pay_subscription_events enable row level security;

alter table public.pay_plano force row level security;
alter table public.pay_pagador force row level security;
alter table public.pay_assinatura force row level security;
alter table public.pay_subscription_events force row level security;

drop policy if exists pay_plano_all on public.pay_plano;
create policy pay_plano_all on public.pay_plano
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_pagador_all on public.pay_pagador;
create policy pay_pagador_all on public.pay_pagador
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_assinatura_all on public.pay_assinatura;
create policy pay_assinatura_all on public.pay_assinatura
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

drop policy if exists pay_subscription_events_all on public.pay_subscription_events;
create policy pay_subscription_events_all on public.pay_subscription_events
for all
to authenticated
using (organization_id in (select * from public.current_organization_ids()))
with check (organization_id in (select * from public.current_organization_ids()));

alter table public.pay_plano
  add column if not exists payment_method text null,
  add column if not exists currency text null,
  add column if not exists billing_cycles_limit int null,
  add column if not exists is_infinite boolean not null default true,
  add column if not exists starts_at timestamptz null,
  add column if not exists ends_at timestamptz null,
  add column if not exists internal_notes text null;

update public.pay_plano
set payment_method = coalesce(payment_method, 'card'),
    currency = coalesce(currency, 'BRL'),
    is_infinite = coalesce(is_infinite, billing_cycles_limit is null, true)
where payment_method is null or currency is null or is_infinite is null;

alter table public.pay_plano
  alter column payment_method set not null,
  alter column currency set not null;

alter table public.pay_assinatura
  add column if not exists payment_method text null,
  add column if not exists joined_at timestamptz null,
  add column if not exists paused_at timestamptz null,
  add column if not exists resumed_at timestamptz null,
  add column if not exists expires_at timestamptz null,
  add column if not exists billing_cycles_completed int null,
  add column if not exists internal_notes text null;

update public.pay_assinatura
set payment_method = coalesce(payment_method, 'card'),
    joined_at = coalesce(joined_at, created_at),
    billing_cycles_completed = coalesce(billing_cycles_completed, 0)
where payment_method is null or joined_at is null or billing_cycles_completed is null;

alter table public.pay_assinatura
  alter column payment_method set not null,
  alter column joined_at set not null,
  alter column billing_cycles_completed set not null;
