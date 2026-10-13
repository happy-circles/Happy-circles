begin;
set local statement_timeout = '60s';

-- Independent fixtures: these users and every effect below disappear on rollback.
insert into auth.users (
  id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'disabled-reversal-a@example.com', '{"provider":"email"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'disabled-reversal-b@example.com', '{"provider":"email"}', '{}', now(), now());

insert into public.user_profiles (id, email, display_name, account_access_state)
values
  ('00000000-0000-0000-0000-00000000fd01', 'disabled-reversal-a@example.com', 'Reversal A', 'active'),
  ('00000000-0000-0000-0000-00000000fd02', 'disabled-reversal-b@example.com', 'Reversal B', 'active')
on conflict (id) do update set account_access_state = 'active';

-- Compare complete fixture rows, not only counts: a rejected command must not
-- silently change the original ledger, request, balance cache, or replay record.
create function pg_temp.disabled_reversal_state(p_a uuid, p_b uuid, p_relationship_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'requests', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb)
      from public.financial_requests row where row.relationship_id = p_relationship_id),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb)
      from public.ledger_transactions row where row.origin_request_id in (
        select id from public.financial_requests where relationship_id = p_relationship_id)),
    'entries', (select coalesce(jsonb_agg(to_jsonb(entry) order by entry.id), '[]'::jsonb)
      from public.ledger_entries entry join public.ledger_accounts account on account.id = entry.ledger_account_id
      where account.owner_user_id in (p_a, p_b)),
    'balances', (select coalesce(jsonb_agg(to_jsonb(row) order by row.user_low_id, row.user_high_id), '[]'::jsonb)
      from public.pair_net_edges_cache row where row.user_low_id = p_a and row.user_high_id = p_b),
    'idempotency', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb)
      from public.idempotency_keys row where row.actor_user_id in (p_a, p_b)),
    'audit', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb)
      from public.audit_events row where row.actor_user_id in (p_a, p_b)),
    'jobs', (select coalesce(jsonb_agg(to_jsonb(row) order by row.id), '[]'::jsonb)
      from public.graph_cycle_jobs row where row.user_low_id = p_a and row.user_high_id = p_b)
  );
$$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000fd01';
  b uuid := '00000000-0000-0000-0000-00000000fd02';
  relationship_id uuid := gen_random_uuid();
  ordinary_request_id uuid;
  target_transaction_id uuid;
  corrected_root_id uuid;
  corrected_request_id uuid;
  counterproposal_root_id uuid;
  counterproposal_id uuid;
  pending_reversal_id uuid := gen_random_uuid();
  rejected_reversal_id uuid := gen_random_uuid();
  amended_reversal_id uuid := gen_random_uuid();
  reversal_child_id uuid := gen_random_uuid();
  historical_reversal_id uuid := gen_random_uuid();
  historical_transaction_id uuid := gen_random_uuid();
  missing_request_id uuid;
  key text;
  ack jsonb;
  accepted_ack jsonb;
  state_before jsonb;
  ledger_before jsonb;
begin
  if has_function_privilege('anon',
      'public.create_balance_request(uuid,text,public.request_type,uuid,uuid,uuid,bigint,text,uuid,uuid,public.transaction_category)', 'execute')
    or has_function_privilege('authenticated',
      'public.create_balance_request(uuid,text,public.request_type,uuid,uuid,uuid,bigint,text,uuid,uuid,public.transaction_category)', 'execute')
    or has_function_privilege('anon', 'public.accept_financial_request(uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.accept_financial_request(uuid,text,uuid)', 'execute')
    or has_function_privilege('anon', 'public.amend_financial_request(uuid,text,uuid,bigint,text,public.transaction_category)', 'execute')
    or has_function_privilege('authenticated', 'public.amend_financial_request(uuid,text,uuid,bigint,text,public.transaction_category)', 'execute')
    or not has_function_privilege('service_role',
      'public.create_balance_request(uuid,text,public.request_type,uuid,uuid,uuid,bigint,text,uuid,uuid,public.transaction_category)', 'execute')
    or not has_function_privilege('service_role', 'public.accept_financial_request(uuid,text,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.amend_financial_request(uuid,text,uuid,bigint,text,public.transaction_category)', 'execute') then
    raise exception 'financial RPC service-only permissions changed';
  end if;

  insert into public.relationships (id, user_low_id, user_high_id, status)
    values (relationship_id, a, b, 'active');
  perform public.ensure_relationship_accounts(relationship_id);

  -- The ordinary creation/acceptance contract, including successful replay,
  -- remains available after the reversal path is disabled.
  ack := public.create_balance_request(a, 'disabled-reversal-normal-create', 'balance_increase',
    b, a, b, 1000, 'Ordinary balance', null, null, 'food_drinks');
  ordinary_request_id := (ack ->> 'requestId')::uuid;
  if ordinary_request_id is null or ack ->> 'status' is distinct from 'pending'
    or public.create_balance_request(a, 'disabled-reversal-normal-create', 'balance_increase',
      b, a, b, 1000, 'Ordinary balance', null, null, 'food_drinks') is distinct from ack then
    raise exception 'ordinary creation or its replay changed';
  end if;
  accepted_ack := public.accept_financial_request(b, 'disabled-reversal-normal-accept', ordinary_request_id);
  target_transaction_id := (accepted_ack ->> 'ledgerTransactionId')::uuid;
  if target_transaction_id is null or accepted_ack ->> 'status' is distinct from 'accepted'
    or public.accept_financial_request(b, 'disabled-reversal-normal-accept', ordinary_request_id) is distinct from accepted_ack
    or (select count(*) from public.ledger_transactions where origin_request_id = ordinary_request_id) <> 1
    or (select count(*) from public.ledger_entries where ledger_transaction_id = target_transaction_id) <> 2
    or (select amount_minor from public.pair_net_edges_cache where user_low_id = a and user_high_id = b) is distinct from 1000::bigint then
    raise exception 'ordinary acceptance must still post exactly one balanced movement';
  end if;
  if (select sum(case when entry_side = 'debit' then amount_minor else -amount_minor end)
      from public.ledger_entries where ledger_transaction_id = target_transaction_id) is distinct from 0::numeric then
    raise exception 'ordinary acceptance posted an unbalanced ledger';
  end if;

  ack := public.create_balance_request(a, 'disabled-reversal-correctable-create', 'balance_increase',
    b, a, b, 1500, 'Correctable balance', null, null, 'other');
  corrected_root_id := (ack ->> 'requestId')::uuid;
  ack := public.correct_financial_request(a, 'disabled-reversal-normal-correct', corrected_root_id,
    2500, 'Corrected balance', 'transport', 1);
  corrected_request_id := (ack ->> 'correctedRequestId')::uuid;
  if corrected_request_id is null or not exists (
    select 1 from public.financial_requests where id = corrected_request_id
      and request_type = 'balance_increase' and status = 'pending' and amount_minor = 2500
      and request_case_id = corrected_root_id and version_number = 2
  ) then raise exception 'ordinary sender correction changed'; end if;
  ack := public.cancel_financial_request(a, 'disabled-reversal-normal-cancel', corrected_request_id, 2);
  if ack ->> 'status' is distinct from 'canceled'
    or exists (select 1 from public.ledger_transactions where origin_request_id in (corrected_root_id, corrected_request_id)) then
    raise exception 'ordinary pending cancellation must remain available without posting';
  end if;
  ack := public.create_balance_request(a, 'disabled-reversal-counterable-create', 'balance_increase',
    b, a, b, 1500, 'Counterproposal balance', null, null, 'other');
  counterproposal_root_id := (ack ->> 'requestId')::uuid;
  ack := public.amend_financial_request(b, 'disabled-reversal-normal-amend', counterproposal_root_id,
    2000, 'Ordinary counterproposal', 'other');
  counterproposal_id := (ack ->> 'amendedRequestId')::uuid;
  if counterproposal_id is null or not exists (select 1 from public.financial_requests
      where id = counterproposal_id and request_type = 'balance_increase' and status = 'pending'
        and creator_user_id = b and responder_user_id = a and amount_minor = 2000) then
    raise exception 'ordinary receiver amendment changed';
  end if;
  perform public.cancel_financial_request(b, 'disabled-reversal-counter-cancel', counterproposal_id, 2);

  -- Represent records created before disabling reversals. Administrative fixture
  -- inserts deliberately bypass the now-disabled public creation/acceptance RPCs.
  insert into public.financial_requests (
    id, relationship_id, request_type, status, creator_user_id, responder_user_id,
    debtor_user_id, creditor_user_id, amount_minor, description, target_ledger_transaction_id
  ) values
    (pending_reversal_id, relationship_id, 'transaction_reversal', 'pending', a, b,
     a, b, 1000, 'Historical pending reversal', target_transaction_id),
    (rejected_reversal_id, relationship_id, 'transaction_reversal', 'pending', a, b,
     a, b, 1000, 'Historical pending reversal to reject', target_transaction_id),
    (amended_reversal_id, relationship_id, 'transaction_reversal', 'amended', a, b,
     a, b, 1000, 'Historical amended reversal', target_transaction_id),
    (historical_reversal_id, relationship_id, 'transaction_reversal', 'accepted', a, b,
     a, b, 1000, 'Historical accepted reversal', target_transaction_id);
  insert into public.financial_requests (
    id, relationship_id, request_type, status, creator_user_id, responder_user_id,
    debtor_user_id, creditor_user_id, amount_minor, description, target_ledger_transaction_id, parent_request_id
  ) values (reversal_child_id, relationship_id, 'transaction_reversal', 'pending', b, a,
    a, b, 2000, 'Historical reversal counterproposal', target_transaction_id, amended_reversal_id);
  insert into public.ledger_transactions (
    id, transaction_type, source_type, origin_request_id, reverses_transaction_id,
    description, created_by_user_id
  ) values (historical_transaction_id, 'transaction_reversal_acceptance', 'user', historical_reversal_id,
    target_transaction_id, 'Existing historical reversal', b);
  insert into public.ledger_entries (
    ledger_transaction_id, ledger_account_id, entry_side, amount_minor, entry_order
  ) select historical_transaction_id, ledger_account_id,
      case when entry_side = 'debit' then 'credit'::public.ledger_entry_side else 'debit'::public.ledger_entry_side end,
      amount_minor, entry_order
    from public.ledger_entries where ledger_transaction_id = target_transaction_id;
  perform public.refresh_pair_net_edge_for_pair(a, b, historical_transaction_id);

  -- A cached success must not bypass the new disablement guard. These persisted
  -- response shapes are the old command contract, not new calls to the commands.
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key, response_json)
  values
    (a, 'create_balance_request', 'disabled-reversal-create-replay',
     jsonb_build_object('requestId', pending_reversal_id, 'status', 'pending')),
    (b, 'accept_financial_request', 'disabled-reversal-accept-replay',
     jsonb_build_object('requestId', historical_reversal_id, 'ledgerTransactionId', historical_transaction_id, 'status', 'accepted')),
    (b, 'amend_financial_request', 'disabled-reversal-amend-replay',
     jsonb_build_object('originalRequestId', amended_reversal_id, 'amendedRequestId', reversal_child_id, 'status', 'pending'));
  state_before := pg_temp.disabled_reversal_state(a, b, relationship_id);

  foreach key in array array['disabled-reversal-create-new', 'disabled-reversal-create-replay'] loop
    begin
      perform public.create_balance_request(a, key, 'transaction_reversal',
        b, a, b, 1000, 'Must not create', null, target_transaction_id, 'other');
      raise exception 'disabled reversal creation returned success';
    exception when others then
      if sqlerrm <> 'transaction_reversal_disabled' then raise; end if;
    end;
    if pg_temp.disabled_reversal_state(a, b, relationship_id) is distinct from state_before then
      raise exception 'blocked creation or replay changed persisted state';
    end if;
  end loop;

  begin
    perform public.accept_financial_request(b, 'disabled-reversal-accept-new', pending_reversal_id);
    raise exception 'disabled pending reversal acceptance returned success';
  exception when others then
    if sqlerrm <> 'transaction_reversal_disabled' then raise; end if;
  end;
  if pg_temp.disabled_reversal_state(a, b, relationship_id) is distinct from state_before then
    raise exception 'blocked acceptance changed pending request, idempotency, or ledger';
  end if;
  begin
    perform public.accept_financial_request(b, 'disabled-reversal-accept-replay', historical_reversal_id);
    raise exception 'historical reversal success bypassed disablement through replay';
  exception when others then
    if sqlerrm <> 'transaction_reversal_disabled' then raise; end if;
  end;
  if pg_temp.disabled_reversal_state(a, b, relationship_id) is distinct from state_before then
    raise exception 'blocked acceptance replay changed historical state';
  end if;
  begin
    perform public.amend_financial_request(b, 'disabled-reversal-amend-new', pending_reversal_id,
      2000, 'Must not create a reversal child', 'other');
    raise exception 'disabled reversal amendment returned success';
  exception when others then
    if sqlerrm <> 'transaction_reversal_disabled' then raise; end if;
  end;
  if pg_temp.disabled_reversal_state(a, b, relationship_id) is distinct from state_before
    or exists (select 1 from public.financial_requests where parent_request_id = pending_reversal_id) then
    raise exception 'blocked amendment created a child or changed persisted state';
  end if;
  begin
    perform public.amend_financial_request(b, 'disabled-reversal-amend-replay', amended_reversal_id,
      2000, 'Historical reversal counterproposal', 'other');
    raise exception 'historical reversal amendment bypassed disablement through replay';
  exception when others then
    if sqlerrm <> 'transaction_reversal_disabled' then raise; end if;
  end;
  if pg_temp.disabled_reversal_state(a, b, relationship_id) is distinct from state_before then
    raise exception 'blocked amendment replay changed historical lineage';
  end if;

  foreach missing_request_id in array array[null::uuid, gen_random_uuid()] loop
    begin
      perform public.accept_financial_request(b, 'disabled-reversal-missing-request', missing_request_id);
      raise exception 'missing request unexpectedly accepted';
    exception when others then
      if sqlerrm <> 'financial_request_not_found' then raise; end if;
    end;
    if pg_temp.disabled_reversal_state(a, b, relationship_id) is distinct from state_before then
      raise exception 'missing request left a partial mutation';
    end if;
  end loop;

  -- Disablement must not trap old pending requests or erase existing history.
  ledger_before := state_before - 'requests' - 'idempotency' - 'audit';
  perform public.reject_financial_request(b, 'disabled-reversal-pending-reject', rejected_reversal_id);
  ack := public.cancel_financial_request(a, 'disabled-reversal-pending-cancel', pending_reversal_id, 1);
  if ack ->> 'status' is distinct from 'canceled'
    or not exists (select 1 from public.financial_requests where id = pending_reversal_id
      and status = 'canceled' and resolved_by_user_id = a)
    or not exists (select 1 from public.financial_requests where id = historical_reversal_id and status = 'accepted')
    or not exists (select 1 from public.financial_requests where id = rejected_reversal_id and status = 'rejected')
    or (pg_temp.disabled_reversal_state(a, b, relationship_id) - 'requests' - 'idempotency' - 'audit') is distinct from ledger_before then
    raise exception 'canceling a historical pending reversal changed existing ledger or history';
  end if;
end;
$$;

rollback;
select '1..1';
select 'ok 1 - reversal creation, acceptance and amendment are disabled while preserving ledger, ordinary commands and pending cancel/reject';
