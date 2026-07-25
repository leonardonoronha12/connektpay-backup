alter table public.pay_antecipacao
  add column if not exists is_internal boolean not null default false,
  add column if not exists eligible_amount_centavos bigint null,
  add column if not exists estimated_fee_bps int null,
  add column if not exists estimated_fee_centavos bigint null,
  add column if not exists expected_settlement_days int null,
  add column if not exists expected_settlement_at timestamptz null,
  add column if not exists paid_at timestamptz null,
  add column if not exists rejected_at timestamptz null,
  add column if not exists rejection_reason text null,
  add column if not exists internal_notes text null,
  add column if not exists eligibility_snapshot jsonb null default null;

update public.pay_antecipacao
set
  eligible_amount_centavos = coalesce(eligible_amount_centavos, available_amount_centavos),
  estimated_fee_bps = coalesce(estimated_fee_bps, fee_bps),
  estimated_fee_centavos = coalesce(estimated_fee_centavos, fee_centavos)
where
  eligible_amount_centavos is null
  or estimated_fee_bps is null
  or estimated_fee_centavos is null;

create index if not exists pay_antecipacao_org_internal_status_idx on public.pay_antecipacao (organization_id, is_internal, status);
create index if not exists pay_antecipacao_org_internal_receiver_idx on public.pay_antecipacao (organization_id, is_internal, recebedor_id);
