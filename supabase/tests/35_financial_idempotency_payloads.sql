begin;
set local statement_timeout = '60s';

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000fd11', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payload-a@example.com', '{"provider":"email"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000fd12', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payload-b@example.com', '{"provider":"email"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-00000000fd13', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'payload-c@example.com', '{"provider":"email"}', '{}', now(), now());
insert into public.user_profiles (id, email, display_name, account_access_state)
values
  ('00000000-0000-0000-0000-00000000fd11', 'payload-a@example.com', 'Payload A', 'active'),
  ('00000000-0000-0000-0000-00000000fd12', 'payload-b@example.com', 'Payload B', 'active'),
  ('00000000-0000-0000-0000-00000000fd13', 'payload-c@example.com', 'Payload C', 'active')
on conflict (id) do update set account_access_state = 'active';

create function pg_temp.expect_financial_error(p_sql text, p_error text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'expected financial command to fail with %', p_error;
  exception when others then
    if sqlerrm <> p_error then raise; end if;
  end;
end;
$$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000fd11';
  b uuid := '00000000-0000-0000-0000-00000000fd12';
  c uuid := '00000000-0000-0000-0000-00000000fd13';
  relation_ab uuid := gen_random_uuid();
  relation_ac uuid := gen_random_uuid();
  created_id uuid;
  rejected_id uuid;
  amended_id uuid;
  child_id uuid;
  proposal_id uuid := gen_random_uuid();
  executed_proposal_id uuid := gen_random_uuid();
  stale_proposal_id uuid := gen_random_uuid();
  execution_id uuid := gen_random_uuid();
  ack jsonb;
  accepted_ack jsonb;
  rejected_ack jsonb;
  amended_ack jsonb;
  decision_ack jsonb;
  execution_ack jsonb;
  baseline_ledger jsonb;
  baseline_requests bigint;
  query text;
begin
  if has_function_privilege('authenticated', 'app_private.financial_command_hash(jsonb)', 'execute')
    or has_function_privilege('service_role', 'app_private.financial_legacy_payload(uuid,text,jsonb,timestamptz)', 'execute')
    or has_function_privilege('anon', 'app_private.assert_financial_idempotency(public.idempotency_keys,jsonb)', 'execute') then
    raise exception 'financial idempotency helpers must remain private';
  end if;
  insert into public.relationships (id, user_low_id, user_high_id, status)
    values (relation_ab, a, b, 'active'), (relation_ac, a, c, 'active');
  perform public.ensure_relationship_accounts(relation_ab);
  perform public.ensure_relationship_accounts(relation_ac);

  ack := public.create_balance_request(a, 'payload-create', 'balance_increase',
    b, a, b, 1000, 'Original', null, null, 'food_drinks');
  created_id := (ack ->> 'requestId')::uuid;
  if public.create_balance_request(a, 'payload-create', 'balance_increase',
      b, a, b, 1000, 'Original', null, null, 'food_drinks') is distinct from ack
    or not exists (select 1 from public.idempotency_keys where actor_user_id = a
      and operation_name = 'create_balance_request' and idempotency_key = 'payload-create' and request_hash is not null) then
    raise exception 'new creation must bind a hash and replay one result';
  end if;
  select count(*) into baseline_requests from public.financial_requests where relationship_id in (relation_ab, relation_ac);
  foreach query in array array[
    format($q$select public.create_balance_request(%L,'payload-create','balance_increase',%L,%L,%L,2000,'Original',null,null,'food_drinks')$q$, a,b,a,b),
    format($q$select public.create_balance_request(%L,'payload-create','balance_increase',%L,%L,%L,1000,'Changed',null,null,'food_drinks')$q$, a,b,a,b),
    format($q$select public.create_balance_request(%L,'payload-create','balance_increase',%L,%L,%L,1000,'Original',null,null,'other')$q$, a,b,a,b),
    format($q$select public.create_balance_request(%L,'payload-create','balance_increase',%L,%L,%L,1000,'Original',null,null,'food_drinks')$q$, a,c,a,c),
    format($q$select public.create_balance_request(%L,'payload-create','balance_increase',%L,%L,%L,1000,'Original',null,null,'food_drinks')$q$, a,b,b,a),
    format($q$select public.create_balance_request(%L,'payload-create','balance_increase',%L,%L,%L,1000,'Original',%L,null,'food_drinks')$q$, a,b,a,b,created_id)
  ] loop
    perform pg_temp.expect_financial_error(query, 'idempotency_key_reused');
  end loop;
  if (select count(*) from public.financial_requests where relationship_id in (relation_ab, relation_ac)) <> baseline_requests then
    raise exception 'conflicting creation added requests';
  end if;

  -- Simulate a pre-migration receipt. A mismatched first replay must neither
  -- consume the receipt nor claim the caller's payload as its original hash.
  update public.idempotency_keys set request_hash = null where actor_user_id = a
    and operation_name = 'create_balance_request' and idempotency_key = 'payload-create';
  perform pg_temp.expect_financial_error(format(
    $q$select public.create_balance_request(%L,'payload-create','balance_increase',%L,%L,%L,9999,'Original',null,null,'food_drinks')$q$,a,b,a,b), 'idempotency_key_reused');
  if exists (select 1 from public.idempotency_keys where actor_user_id = a
      and operation_name = 'create_balance_request' and idempotency_key = 'payload-create' and request_hash is not null) then
    raise exception 'mismatched legacy creation consumed the receipt';
  end if;
  if public.create_balance_request(a, 'payload-create', 'balance_increase',
      b,a,b,1000,'Original',null,null,'food_drinks') is distinct from ack then
    raise exception 'verified legacy creation must keep its response';
  end if;

  ack := public.create_balance_request(a, 'payload-rejectable', 'balance_increase',
    b,a,b,500,'Rejectable',null,null,'other');
  rejected_id := (ack ->> 'requestId')::uuid;
  accepted_ack := public.accept_financial_request(b, 'payload-accept', created_id);
  perform pg_temp.expect_financial_error(format(
    $q$select public.accept_financial_request(%L,'payload-accept',%L)$q$,b,rejected_id), 'idempotency_key_reused');
  update public.idempotency_keys set request_hash = null where actor_user_id = b
    and operation_name = 'accept_financial_request' and idempotency_key = 'payload-accept';
  perform pg_temp.expect_financial_error(format(
    $q$select public.accept_financial_request(%L,'payload-accept',%L)$q$,b,rejected_id), 'idempotency_key_reused');
  if public.accept_financial_request(b, 'payload-accept', created_id) is distinct from accepted_ack
    or not exists (select 1 from public.financial_requests where id = rejected_id and status = 'pending') then
    raise exception 'acceptance replay changed its result or another request';
  end if;
  rejected_ack := public.reject_financial_request(b, 'payload-reject', rejected_id);
  perform pg_temp.expect_financial_error(format(
    $q$select public.reject_financial_request(%L,'payload-reject',%L)$q$,b,created_id), 'idempotency_key_reused');
  update public.idempotency_keys set request_hash = null where actor_user_id = b
    and operation_name = 'reject_financial_request' and idempotency_key = 'payload-reject';
  perform pg_temp.expect_financial_error(format(
    $q$select public.reject_financial_request(%L,'payload-reject',%L)$q$,b,created_id), 'idempotency_key_reused');
  if public.reject_financial_request(b, 'payload-reject', rejected_id) is distinct from rejected_ack then
    raise exception 'verified legacy rejection changed its response';
  end if;

  ack := public.create_balance_request(a, 'payload-amendable', 'balance_increase',
    b,a,b,1200,'Amendable',null,null,'food_drinks');
  amended_id := (ack ->> 'requestId')::uuid;
  amended_ack := public.amend_financial_request(b, 'payload-amend', amended_id,1700,'Counterproposal',null);
  child_id := (amended_ack ->> 'amendedRequestId')::uuid;
  -- Default/null category and its explicit effective value are one intent.
  if public.amend_financial_request(b, 'payload-amend', amended_id,1700,'Counterproposal','food_drinks') is distinct from amended_ack then
    raise exception 'equivalent amendment category changed replay semantics';
  end if;
  foreach query in array array[
    format($q$select public.amend_financial_request(%L,'payload-amend',%L,1800,'Counterproposal',null)$q$,b,amended_id),
    format($q$select public.amend_financial_request(%L,'payload-amend',%L,1700,'Changed',null)$q$,b,amended_id),
    format($q$select public.amend_financial_request(%L,'payload-amend',%L,1700,'Counterproposal','transport')$q$,b,amended_id),
    format($q$select public.amend_financial_request(%L,'payload-amend',%L,1700,'Counterproposal',null)$q$,b,created_id)
  ] loop perform pg_temp.expect_financial_error(query,'idempotency_key_reused'); end loop;
  update public.idempotency_keys set request_hash = null where actor_user_id = b
    and operation_name = 'amend_financial_request' and idempotency_key = 'payload-amend';
  perform pg_temp.expect_financial_error(format(
    $q$select public.amend_financial_request(%L,'payload-amend',%L,1900,'Counterproposal',null)$q$,b,amended_id), 'idempotency_key_reused');
  if public.amend_financial_request(b, 'payload-amend', amended_id,1700,'Counterproposal',null) is distinct from amended_ack
    or (select count(*) from public.financial_requests where parent_request_id = amended_id) <> 1 then
    raise exception 'legacy amendment must reconstruct the original child without creating another';
  end if;

  -- Actor scope is part of the unique key: one account never inherits another
  -- account's cached response even if the client happens to reuse its text key.
  perform public.create_balance_request(a, 'payload-account-scope', 'balance_increase',
    b,a,b,100,'Account A',null,null,'other');
  perform public.create_balance_request(b, 'payload-account-scope', 'balance_increase',
    a,b,a,900,'Account B',null,null,'other');
  if (select count(distinct response_json ->> 'requestId') from public.idempotency_keys
      where actor_user_id in (a,b) and operation_name = 'create_balance_request' and idempotency_key = 'payload-account-scope') <> 2 then
    raise exception 'account-scoped keys reused another actor result';
  end if;
  select jsonb_agg(to_jsonb(entry) order by entry.id) into baseline_ledger
    from public.ledger_entries entry join public.ledger_accounts account on account.id = entry.ledger_account_id
    where account.owner_user_id in (a,b,c);

  -- Lightweight proposals exercise the public decision contract without final
  -- approval or executing a settlement. Real settlement execution is covered by
  -- the cycle suites; these cases focus on exact replay/decision identity.
  insert into public.settlement_proposals (id,created_by_user_id,status,graph_snapshot_hash,graph_snapshot,movements_json)
    values (proposal_id,a,'pending_approvals',public.compute_graph_snapshot_hash(),'[]','[]'),
      (executed_proposal_id,a,'executed',public.compute_graph_snapshot_hash(),'[]','[]'),
      (stale_proposal_id,a,'stale',public.compute_graph_snapshot_hash(),'[]','[]');
  insert into public.settlement_proposal_participants (settlement_proposal_id,participant_user_id,decision,approval_scope_hash)
    values (proposal_id,a,'pending',public.compute_cycle_participant_approval_scope_hash('[]',a,'COP')),
      (proposal_id,b,'pending',public.compute_cycle_participant_approval_scope_hash('[]',b,'COP')),
      (executed_proposal_id,a,'approved',public.compute_cycle_participant_approval_scope_hash('[]',a,'COP')),
      (stale_proposal_id,a,'pending',public.compute_cycle_participant_approval_scope_hash('[]',a,'COP'));
  insert into public.settlement_executions (id,settlement_proposal_id,executed_by_user_id)
    values (execution_id,executed_proposal_id,a);
  decision_ack := public.decide_cycle_settlement(a,'payload-decision',proposal_id,'approved');
  perform pg_temp.expect_financial_error(format(
    $q$select public.decide_cycle_settlement(%L,'payload-decision',%L,'rejected')$q$,a,proposal_id), 'idempotency_key_reused');
  perform pg_temp.expect_financial_error(format(
    $q$select public.decide_cycle_settlement(%L,'payload-decision',%L,'approved')$q$,a,stale_proposal_id), 'idempotency_key_reused');
  update public.idempotency_keys set request_hash = null where actor_user_id = a
    and operation_name = 'decide_cycle_settlement' and idempotency_key = 'payload-decision';
  perform pg_temp.expect_financial_error(format(
    $q$select public.decide_cycle_settlement(%L,'payload-decision',%L,'rejected')$q$,a,proposal_id), 'idempotency_key_reused');
  if public.decide_cycle_settlement(a,'payload-decision',proposal_id,'approved') is distinct from decision_ack then
    raise exception 'verified legacy approval must remain idempotent';
  end if;
  execution_ack := public.execute_cycle_settlement(a,'payload-execute',executed_proposal_id);
  perform pg_temp.expect_financial_error(format(
    $q$select public.execute_cycle_settlement(%L,'payload-execute',%L)$q$,a,proposal_id), 'idempotency_key_reused');
  update public.idempotency_keys set request_hash = null where actor_user_id = a
    and operation_name = 'execute_cycle_settlement' and idempotency_key = 'payload-execute';
  perform pg_temp.expect_financial_error(format(
    $q$select public.execute_cycle_settlement(%L,'payload-execute',%L)$q$,a,proposal_id), 'idempotency_key_reused');
  if public.execute_cycle_settlement(a,'payload-execute',executed_proposal_id) is distinct from execution_ack then
    raise exception 'verified legacy execution must keep its result';
  end if;

  insert into public.idempotency_keys (actor_user_id,operation_name,idempotency_key,response_json)
    values (a,'decide_cycle_settlement','payload-legacy-stale',jsonb_build_object('proposalId',stale_proposal_id,'status','stale')),
      (a,'create_balance_request','payload-legacy-incomplete',null),
      (a,'create_balance_request','payload-legacy-missing',jsonb_build_object('requestId',gen_random_uuid(),'status','pending'));
  foreach query in array array[
    format($q$select public.decide_cycle_settlement(%L,'payload-legacy-stale',%L,'approved')$q$,a,stale_proposal_id),
    format($q$select public.decide_cycle_settlement(%L,'payload-legacy-stale',%L,'rejected')$q$,a,stale_proposal_id),
    format($q$select public.create_balance_request(%L,'payload-legacy-incomplete','balance_increase',%L,%L,%L,1000,'Unknown',null,null,'other')$q$,a,b,a,b),
    format($q$select public.create_balance_request(%L,'payload-legacy-missing','balance_increase',%L,%L,%L,1000,'Unknown',null,null,'other')$q$,a,b,a,b)
  ] loop perform pg_temp.expect_financial_error(query,'idempotency_legacy_unverifiable'); end loop;
  -- Mutable participant state alone cannot prove a legacy caller's decision.
  update public.settlement_proposal_participants set decision = 'approved', decision_source = 'manual'
    where settlement_proposal_id = stale_proposal_id and participant_user_id = a;
  perform pg_temp.expect_financial_error(format(
    $q$select public.decide_cycle_settlement(%L,'payload-legacy-stale',%L,'approved')$q$,a,stale_proposal_id), 'idempotency_legacy_unverifiable');
  -- Even an eventual manual decision does not identify the payload of an older
  -- request which had returned stale before making any decision.
  perform public.append_audit_event(a,'settlement_proposal',stale_proposal_id,'settlement_approved',null,'{}');
  update public.idempotency_keys set created_at = created_at - interval '1 day'
    where actor_user_id = a and operation_name = 'decide_cycle_settlement' and idempotency_key = 'payload-legacy-stale';
  perform pg_temp.expect_financial_error(format(
    $q$select public.decide_cycle_settlement(%L,'payload-legacy-stale',%L,'approved')$q$,a,stale_proposal_id), 'idempotency_legacy_unverifiable');
  if exists (select 1 from public.idempotency_keys where actor_user_id = a
      and idempotency_key in ('payload-legacy-stale','payload-legacy-incomplete','payload-legacy-missing')
      and request_hash is not null) then
    raise exception 'unverifiable legacy payload was guessed from the new caller';
  end if;
  if exists (select 1 from public.idempotency_keys where actor_user_id in (a,b)
      and idempotency_key in ('payload-create','payload-accept','payload-reject','payload-amend','payload-decision','payload-execute')
      and request_hash is null) then
    raise exception 'verified legacy replays did not bind their original hashes';
  end if;
  if (select jsonb_agg(to_jsonb(entry) order by entry.id)
      from public.ledger_entries entry join public.ledger_accounts account on account.id = entry.ledger_account_id
      where account.owner_user_id in (a,b,c)) is distinct from baseline_ledger then
    raise exception 'replays or conflicts modified the existing ledger';
  end if;
end;
$$;

rollback;
select '1..1';
select 'ok 1 - financial keys bind payloads and actors, verified legacy receipts replay, unverifiable receipts fail closed';
