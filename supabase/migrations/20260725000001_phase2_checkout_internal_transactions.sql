alter table public.transactions
  add column if not exists provider text null,
  add column if not exists provider_order_id text null,
  add column if not exists provider_charge_id text null,
  add column if not exists idempotency_key text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists provider_error_code text null,
  add column if not exists provider_error_message text null;

create unique index if not exists transactions_org_idempotency_key_uq
  on public.transactions (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.pay_transacao
  add column if not exists provider text null,
  add column if not exists provider_order_id text null,
  add column if not exists provider_charge_id text null,
  add column if not exists idempotency_key text null,
  add column if not exists split_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists provider_error_code text null,
  add column if not exists provider_error_message text null;

create unique index if not exists pay_transacao_org_idempotency_key_uq
  on public.pay_transacao (organization_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.create_internal_checkout_transaction(
  p_transaction_id uuid,
  p_organization_id uuid,
  p_customer_id uuid,
  p_payment_link_id uuid,
  p_amount bigint,
  p_currency text,
  p_method text,
  p_status text,
  p_provider text,
  p_idempotency_key text,
  p_transaction_metadata jsonb default '{}'::jsonb,
  p_split_summary jsonb default '{}'::jsonb,
  p_split_rows jsonb default '[]'::jsonb
)
returns table (
  transaction_id uuid,
  public_token uuid,
  status text,
  idempotency_key text,
  reused boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_public_token uuid;
  v_status text;
begin
  if p_idempotency_key is not null then
    select t.id, t.public_token, t.status
      into v_transaction_id, v_public_token, v_status
      from public.transactions t
     where t.organization_id = p_organization_id
       and t.idempotency_key = p_idempotency_key
     limit 1;

    if v_transaction_id is not null then
      insert into public.pay_transacao (
        transaction_id,
        organization_id,
        payment_link_id,
        gross_amount,
        connekt_fee_amount,
        receiver_total_amount,
        currency,
        status,
        provider,
        provider_reference,
        provider_order_id,
        provider_charge_id,
        provider_payload,
        provider_split_payload,
        idempotency_key,
        split_snapshot
      )
      values (
        v_transaction_id,
        p_organization_id,
        p_payment_link_id,
        coalesce((p_split_summary ->> 'gross_amount')::bigint, p_amount),
        coalesce((p_split_summary ->> 'connekt_fee_amount')::bigint, 0),
        coalesce((p_split_summary ->> 'receiver_total_amount')::bigint, p_amount),
        p_currency,
        p_status,
        p_provider,
        null,
        null,
        null,
        '{}'::jsonb,
        '{}'::jsonb,
        p_idempotency_key,
        coalesce(p_split_summary, '{}'::jsonb)
      )
      on conflict (transaction_id) do nothing;

      insert into public.pay_split (
        transaction_id,
        organization_id,
        receiver_id,
        kind,
        amount,
        percentage_bps,
        rule_id
      )
      select
        v_transaction_id,
        p_organization_id,
        nullif(item ->> 'receiver_id', '')::uuid,
        coalesce(item ->> 'kind', 'receiver'),
        coalesce((item ->> 'amount')::bigint, 0),
        coalesce((item ->> 'percentage_bps')::int, 0),
        nullif(item ->> 'rule_id', '')::uuid
      from jsonb_array_elements(coalesce(p_split_rows, '[]'::jsonb)) as item
      on conflict do nothing;

      return query
      select v_transaction_id, v_public_token, v_status, p_idempotency_key, true;
      return;
    end if;
  end if;

  insert into public.transactions as tx (
    id,
    organization_id,
    customer_id,
    payment_link_id,
    amount,
    currency,
    method,
    status,
    provider,
    provider_reference,
    provider_order_id,
    provider_charge_id,
    provider_payload,
    public_token,
    idempotency_key,
    metadata
  )
  values (
    coalesce(p_transaction_id, gen_random_uuid()),
    p_organization_id,
    p_customer_id,
    p_payment_link_id,
    p_amount,
    p_currency,
    p_method,
    p_status,
    p_provider,
    null,
    null,
    null,
    '{}'::jsonb,
    gen_random_uuid(),
    p_idempotency_key,
    coalesce(p_transaction_metadata, '{}'::jsonb)
  )
  returning tx.id, tx.public_token, tx.status
    into v_transaction_id, v_public_token, v_status;

  insert into public.pay_transacao (
    transaction_id,
    organization_id,
    payment_link_id,
    gross_amount,
    connekt_fee_amount,
    receiver_total_amount,
    currency,
    status,
    provider,
    provider_reference,
    provider_order_id,
    provider_charge_id,
    provider_payload,
    provider_split_payload,
    idempotency_key,
    split_snapshot
  )
  values (
    v_transaction_id,
    p_organization_id,
    p_payment_link_id,
    coalesce((p_split_summary ->> 'gross_amount')::bigint, p_amount),
    coalesce((p_split_summary ->> 'connekt_fee_amount')::bigint, 0),
    coalesce((p_split_summary ->> 'receiver_total_amount')::bigint, p_amount),
    p_currency,
    p_status,
    p_provider,
    null,
    null,
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    p_idempotency_key,
    coalesce(p_split_summary, '{}'::jsonb)
  );

  insert into public.pay_split (
    transaction_id,
    organization_id,
    receiver_id,
    kind,
    amount,
    percentage_bps,
    rule_id
  )
  select
    v_transaction_id,
    p_organization_id,
    nullif(item ->> 'receiver_id', '')::uuid,
    coalesce(item ->> 'kind', 'receiver'),
    coalesce((item ->> 'amount')::bigint, 0),
    coalesce((item ->> 'percentage_bps')::int, 0),
    nullif(item ->> 'rule_id', '')::uuid
  from jsonb_array_elements(coalesce(p_split_rows, '[]'::jsonb)) as item
  on conflict do nothing;

  return query
  select v_transaction_id, v_public_token, v_status, p_idempotency_key, false;
end;
$$;

create unique index if not exists pay_split_tx_kind_null_receiver_uq
  on public.pay_split (transaction_id, kind)
  where receiver_id is null;

revoke all on function public.create_internal_checkout_transaction(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) from public, authenticated, anon;

grant execute on function public.create_internal_checkout_transaction(
  uuid,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) to service_role;
