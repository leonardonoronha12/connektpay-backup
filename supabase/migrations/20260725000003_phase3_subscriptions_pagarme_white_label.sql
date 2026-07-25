alter table public.pay_pagador
  add column if not exists provider_customer_id text null,
  add column if not exists provider_card_id text null,
  add column if not exists provider_card_brand text null,
  add column if not exists provider_card_last4 text null;

create index if not exists pay_pagador_org_provider_customer_idx on public.pay_pagador (organization_id, provider_customer_id)
where provider_customer_id is not null;

create index if not exists pay_pagador_org_provider_card_idx on public.pay_pagador (organization_id, provider_card_id)
where provider_card_id is not null;

alter table public.pay_assinatura
  add column if not exists provider_reference text null,
  add column if not exists provider_first_order_id text null,
  add column if not exists provider_first_charge_id text null,
  add column if not exists provider_first_brand_id text null,
  add column if not exists provider_last_order_id text null,
  add column if not exists provider_last_charge_id text null;

create unique index if not exists pay_assinatura_org_provider_reference_uq on public.pay_assinatura (organization_id, provider_reference)
where provider_reference is not null;

create index if not exists pay_assinatura_org_first_charge_idx on public.pay_assinatura (organization_id, provider_first_charge_id)
where provider_first_charge_id is not null;

create index if not exists pay_assinatura_org_last_charge_idx on public.pay_assinatura (organization_id, provider_last_charge_id)
where provider_last_charge_id is not null;
