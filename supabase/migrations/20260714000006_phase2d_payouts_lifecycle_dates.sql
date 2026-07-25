alter table public.payouts
  add column if not exists paid_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists canceled_at timestamptz null;
