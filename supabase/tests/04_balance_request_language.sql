\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_request jsonb;
  v_request_id uuid;
  v_accept_response jsonb;
  v_transaction_type public.ledger_transaction_type;
begin
  v_request := public.create_balance_request(
    '00000000-0000-0000-0000-0000000000a1',
    'test-balance-language-request',
    'balance_increase',
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2',
    5000,
    'Smoke balance request',
    null,
    null
  );

  v_request_id := (v_request ->> 'requestId')::uuid;

  if v_request_id is null then
    raise exception 'expected request id from create_balance_request';
  end if;

  if not exists (
    select 1
    from public.financial_requests
    where id = v_request_id
      and request_type = 'balance_increase'
  ) then
    raise exception 'expected balance_increase request type';
  end if;

  v_accept_response := public.accept_financial_request(
    '00000000-0000-0000-0000-0000000000b2',
    'test-balance-language-accept',
    v_request_id
  );

  select transaction_type
    into v_transaction_type
  from public.ledger_transactions
  where id = (v_accept_response ->> 'ledgerTransactionId')::uuid;

  if v_transaction_type <> 'balance_increase_acceptance' then
    raise exception 'expected balance_increase_acceptance transaction, got %', v_transaction_type;
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - balance request language';
