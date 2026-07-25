alter table public.transactions
  add column if not exists public_token uuid null;

update public.transactions
set public_token = gen_random_uuid()
where public_token is null;

alter table public.transactions
  alter column public_token set not null;

create unique index if not exists transactions_public_token_uq on public.transactions (public_token);

