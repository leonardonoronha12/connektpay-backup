drop function if exists public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid);

create or replace function public.append_ledger_entry(
  p_organization_id uuid,
  p_type text,
  p_direction text,
  p_amount bigint,
  p_origin text default 'system',
  p_occurred_at timestamptz default now(),
  p_transaction_id uuid default null,
  p_payout_id uuid default null,
  p_anticipation_request_id uuid default null
)
returns public.ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_balance bigint;
  next_balance bigint;
  row public.ledger_entries;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;
  if p_direction not in ('credit','debit') then
    raise exception 'direction must be credit or debit';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  select le.balance_after
  into prev_balance
  from public.ledger_entries le
  where le.organization_id = p_organization_id
  order by le.occurred_at desc, le.created_at desc
  limit 1;

  prev_balance := coalesce(prev_balance, 0);
  next_balance := case when p_direction = 'credit' then prev_balance + p_amount else prev_balance - p_amount end;

  insert into public.ledger_entries (
    organization_id,
    transaction_id,
    payout_id,
    anticipation_request_id,
    type,
    direction,
    amount,
    balance_after,
    origin,
    occurred_at
  )
  values (
    p_organization_id,
    p_transaction_id,
    p_payout_id,
    p_anticipation_request_id,
    p_type,
    p_direction,
    p_amount,
    next_balance,
    coalesce(p_origin, 'system'),
    coalesce(p_occurred_at, now())
  )
  returning * into row;

  return row;
end;
$$;

revoke all on function public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid) from public;
grant execute on function public.append_ledger_entry(uuid, text, text, bigint, text, timestamptz, uuid, uuid, uuid) to authenticated;

