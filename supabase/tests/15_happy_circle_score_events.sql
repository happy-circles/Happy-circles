\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
begin
  if to_regclass('public.happy_circle_score_events') is null then
    raise exception 'expected public.happy_circle_score_events to exist';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'happy_circle_score_events'
      and column_name = 'treasure_claimed_at'
  ) then
    raise exception 'expected treasure claim timestamp column';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'happy_circle_score_events'
      and indexname = 'happy_circle_score_events_unique_award_idx'
  ) then
    raise exception 'expected unique award index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'happy_circle_score_events'
      and indexname = 'happy_circle_score_events_user_awarded_at_idx'
  ) then
    raise exception 'expected user awarded_at index';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'happy_circle_score_events'
      and indexname = 'happy_circle_score_events_user_unclaimed_idx'
  ) then
    raise exception 'expected user unclaimed award index';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'happy_circle_score_events'
      and policyname = 'happy_circle_score_events_select_self'
  ) then
    raise exception 'expected self-select RLS policy';
  end if;

  if not has_table_privilege('authenticated', 'public.happy_circle_score_events', 'SELECT') then
    raise exception 'expected authenticated users to read own score events';
  end if;

  if has_table_privilege('authenticated', 'public.happy_circle_score_events', 'INSERT')
    or has_table_privilege('authenticated', 'public.happy_circle_score_events', 'UPDATE')
    or has_table_privilege('authenticated', 'public.happy_circle_score_events', 'DELETE') then
    raise exception 'score events must not be client-writable';
  end if;

  if not has_column_privilege(
    'authenticated',
    'public.happy_circle_score_events',
    'treasure_claimed_at',
    'UPDATE'
  ) then
    raise exception 'authenticated users need narrow claim timestamp update privilege';
  end if;

  if has_function_privilege('authenticated', 'public.award_happy_circle_score(uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'award_happy_circle_score must only be internal';
  end if;

  if not has_function_privilege('authenticated', 'public.claim_happy_circle_treasure(uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'expected authenticated users to claim own treasure';
  end if;

  if has_function_privilege('anon', 'public.claim_happy_circle_treasure(uuid)'::regprocedure, 'EXECUTE') then
    raise exception 'anonymous users must not claim treasure';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'claim_happy_circle_treasure'
      and pg_get_function_arguments(p.oid) = 'p_score_event_id uuid'
      and p.prosecdef
  ) then
    raise exception 'claim_happy_circle_treasure must run as security invoker';
  end if;
end
$$;

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b2';
  v_c uuid := '00000000-0000-0000-0000-0000000000c3';
  v_d uuid := '00000000-0000-0000-0000-0000000000d4';
  v_request jsonb;
  v_request_id uuid;
  v_snapshot jsonb;
  v_amount_minor bigint;
  v_movements jsonb;
  v_proposal jsonb;
  v_proposal_id uuid;
  v_response jsonb;
  v_event_count integer;
  v_score_sum integer;
  v_score_event_id uuid;
  v_claimed_at timestamptz;
  v_other_user_blocked boolean := false;
begin
  v_request := public.create_balance_request(
    v_a,
    'test-score-exec-shift-request',
    'balance_increase',
    v_b,
    v_a,
    v_b,
    23,
    'Score graph shift',
    null,
    null
  );

  v_request_id := (v_request ->> 'requestId')::uuid;

  perform public.accept_financial_request(
    v_b,
    'test-score-exec-shift-accept',
    v_request_id
  );

  v_request := public.create_balance_request(
    v_b,
    'test-score-exec-b-c-request',
    'balance_increase',
    v_c,
    v_b,
    v_c,
    90000,
    'Score cycle B to C',
    null,
    null
  );

  perform public.accept_financial_request(
    v_c,
    'test-score-exec-b-c-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_c,
    'test-score-exec-c-d-request',
    'balance_increase',
    v_d,
    v_c,
    v_d,
    90000,
    'Score cycle C to D',
    null,
    null
  );

  perform public.accept_financial_request(
    v_d,
    'test-score-exec-c-d-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_d,
    'test-score-exec-d-a-request',
    'balance_increase',
    v_a,
    v_d,
    v_a,
    90000,
    'Score cycle D to A',
    null,
    null
  );

  perform public.accept_financial_request(
    v_a,
    'test-score-exec-d-a-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_snapshot := public.compute_graph_component_snapshot(v_a, v_b, 'COP');

  select min((edge.value ->> 'amount_minor')::bigint)
    into v_amount_minor
  from jsonb_array_elements(v_snapshot -> 'graphSnapshot') as edge(value)
  where ((edge.value ->> 'debtor_user_id')::uuid, (edge.value ->> 'creditor_user_id')::uuid) in (
    (v_a, v_b),
    (v_b, v_c),
    (v_c, v_d),
    (v_d, v_a)
  );

  if v_amount_minor is null or v_amount_minor <= 0 then
    raise exception 'expected active score test cycle amount';
  end if;

  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_c, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_d, 'amount_minor', v_amount_minor)
  );

  v_proposal := public.propose_cycle_settlement(
    v_a,
    'test-score-exec-propose',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_c, v_d],
    v_a,
    v_b,
    'COP',
    null
  );
  v_proposal_id := (v_proposal ->> 'proposalId')::uuid;

  perform public.decide_cycle_settlement(v_a, 'test-score-exec-approve-a', v_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_b, 'test-score-exec-approve-b', v_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_c, 'test-score-exec-approve-c', v_proposal_id, 'approved');
  v_response := public.decide_cycle_settlement(
    v_d,
    'test-score-exec-approve-d',
    v_proposal_id,
    'approved'
  );

  if v_response ->> 'status' <> 'executed' then
    raise exception 'expected score test circle to execute, got %', v_response;
  end if;

  select count(*), coalesce(sum(score_delta), 0)
    into v_event_count, v_score_sum
  from public.happy_circle_score_events
  where settlement_proposal_id = v_proposal_id;

  if v_event_count <> 4 or v_score_sum <> 16 then
    raise exception 'expected four +4 score events, got count %, sum %', v_event_count, v_score_sum;
  end if;

  perform public.execute_cycle_settlement(v_a, 'test-score-exec-again', v_proposal_id);

  select count(*), coalesce(sum(score_delta), 0)
    into v_event_count, v_score_sum
  from public.happy_circle_score_events
  where settlement_proposal_id = v_proposal_id;

  if v_event_count <> 4 or v_score_sum <> 16 then
    raise exception 'expected score events to remain idempotent, got count %, sum %', v_event_count, v_score_sum;
  end if;

  select id
    into v_score_event_id
  from public.happy_circle_score_events
  where settlement_proposal_id = v_proposal_id
    and user_id = v_a;

  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_response := public.claim_happy_circle_treasure(v_score_event_id);

  if v_response ->> 'status' <> 'claimed'
    or v_response ->> 'scoreEventId' <> v_score_event_id::text
    or (v_response ->> 'scoreDelta')::integer <> 4 then
    raise exception 'expected first claim to mark treasure claimed, got %', v_response;
  end if;

  select treasure_claimed_at
    into v_claimed_at
  from public.happy_circle_score_events
  where id = v_score_event_id;

  if v_claimed_at is null then
    raise exception 'expected claim timestamp to persist';
  end if;

  v_response := public.claim_happy_circle_treasure(v_score_event_id);

  if v_response ->> 'status' <> 'already_claimed'
    or (v_response ->> 'treasureClaimedAt')::timestamptz <> v_claimed_at then
    raise exception 'expected second claim to be idempotent, got %', v_response;
  end if;

  perform set_config('request.jwt.claim.sub', v_b::text, true);

  begin
    perform public.claim_happy_circle_treasure(v_score_event_id);
  exception
    when others then
      if sqlerrm like '%happy_circle_score_event_not_found%' then
        v_other_user_blocked := true;
      else
        raise;
      end if;
  end;

  if not v_other_user_blocked then
    raise exception 'expected users to be blocked from claiming other users treasure';
  end if;
end
$$;

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b2';
  v_c uuid := '00000000-0000-0000-0000-0000000000c3';
  v_proposal_id uuid := gen_random_uuid();
  v_event_count integer;
  v_score_sum integer;
begin
  insert into public.settlement_proposals (
    id,
    created_by_user_id,
    status,
    graph_snapshot_hash,
    graph_snapshot,
    movements_json,
    executed_at
  )
  values (
    v_proposal_id,
    v_a,
    'executed',
    'score-existing-executed',
    '[]'::jsonb,
    '[]'::jsonb,
    timezone('utc', now())
  );

  insert into public.settlement_proposal_participants (
    settlement_proposal_id,
    participant_user_id,
    decision,
    decided_at
  )
  values
    (v_proposal_id, v_a, 'approved', timezone('utc', now())),
    (v_proposal_id, v_b, 'approved', timezone('utc', now())),
    (v_proposal_id, v_c, 'approved', timezone('utc', now()));

  perform public.award_happy_circle_score(v_proposal_id);
  perform public.award_happy_circle_score(v_proposal_id);

  select count(*), coalesce(sum(score_delta), 0)
    into v_event_count, v_score_sum
  from public.happy_circle_score_events
  where settlement_proposal_id = v_proposal_id;

  if v_event_count <> 3 or v_score_sum <> 9 then
    raise exception 'expected existing executed circle to award three +3 events once, got count %, sum %',
      v_event_count,
      v_score_sum;
  end if;
end
$$;

\unset QUIET
select '1..3';
select 'ok 1 - happy circle score events are private with claimable treasure rpc';
select 'ok 2 - executed circles award score and claim treasure idempotently';
select 'ok 3 - existing executed circles can be awarded without duplicate events';
