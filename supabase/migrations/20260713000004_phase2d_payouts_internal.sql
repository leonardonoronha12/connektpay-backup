alter table public.payouts
  add column if not exists is_internal boolean not null default false,
  add column if not exists bank_account_snapshot jsonb null default null,
  add column if not exists approved_at timestamptz null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null,
  add column if not exists internal_notes text null;

create index if not exists payouts_org_internal_status_idx on public.payouts (organization_id, is_internal, status);
create index if not exists payouts_org_internal_receiver_idx on public.payouts (organization_id, is_internal, receiver_id);
