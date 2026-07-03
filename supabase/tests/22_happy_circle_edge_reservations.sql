\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b2';
  v_c uuid := '00000000-0000-0000-0000-0000000000c3';
  v_d uuid := '00000000-0000-0000-0000-0000000000d4';
  v_proposal_id uuid;
  v_request jsonb;
  v_snapshot jsonb;
  v_context jsonb;
  v_job jsonb;
  v_job_id uuid;
  v_movements jsonb;
  v_first jsonb;
  v_second jsonb;
  v_first_id uuid;
  v_second_id uuid;
  v_first_amount bigint;
  v_second_amount bigint;
  v_available_amount bigint;
  v_anchor_before bigint;
  v_anchor_after bigint;
  v_edge_after bigint;
  v_response jsonb;
  v_case_id uuid;
begin
  for v_proposal_id in
    select id
    from public.settlement_proposals
    where status in ('pending_approvals', 'approved')
    order by created_at
  loop
    perform public.mark_happy_circle_proposal_stale(
      null,
      v_proposal_id,
      'related_execution_changed_balance'::public.settlement_stale_reason
    );
  end loop;

  v_request := public.create_balance_request(
    v_a,
    'test-edge-reservations-a-b-request',
    'balance_increase',
    v_b,
    v_a,
    v_b,
    70000000,
    'Edge reservation A to B',
    null,
    null
  );
  perform public.accept_financial_request(
    v_b,
    'test-edge-reservations-a-b-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_b,
    'test-edge-reservations-b-c-request',
    'balance_increase',
    v_c,
    v_b,
    v_c,
    70000000,
    'Edge reservation B to C',
    null,
    null
  );
  perform public.accept_financial_request(
    v_c,
    'test-edge-reservations-b-c-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_c,
    'test-edge-reservations-c-a-request',
    'balance_increase',
    v_a,
    v_c,
    v_a,
    70000000,
    'Edge reservation C to A',
    null,
    null
  );
  perform public.accept_financial_request(
    v_a,
    'test-edge-reservations-c-a-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_snapshot := public.compute_available_graph_component_snapshot(v_a, v_b, 'COP');

  select min((edge.value ->> 'amount_minor')::bigint)
    into v_available_amount
  from jsonb_array_elements(v_snapshot -> 'graphSnapshot') as edge(value)
  where ((edge.value ->> 'debtor_user_id')::uuid, (edge.value ->> 'creditor_user_id')::uuid) in (
    (v_a, v_b),
    (v_b, v_c),
    (v_c, v_a)
  );

  select (v_snapshot -> 'anchorEdge' ->> 'amount_minor')::bigint
    into v_anchor_before;

  if v_available_amount is null or v_available_amount <= 10 then
    raise exception 'expected enough available amount for residual reservation test';
  end if;

  v_first_amount := (v_available_amount * 3) / 5;
  v_second_amount := v_available_amount - v_first_amount;

  if v_first_amount <= 0 or v_second_amount <= 0 or v_first_amount = v_second_amount then
    raise exception 'expected asymmetric split amounts, got first %, second %', v_first_amount, v_second_amount;
  end if;

  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_first_amount),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_first_amount),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', v_first_amount)
  );

  v_first := public.propose_cycle_settlement(
    v_a,
    'test-edge-reservations-first-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_c],
    v_a,
    v_b,
    'COP',
    null
  );
  v_first_id := (v_first ->> 'proposalId')::uuid;

  if v_first_id is null then
    raise exception 'expected first reserved proposal, got %', v_first;
  end if;

  if (
    select count(*)
    from public.settlement_edge_reservations
    where settlement_proposal_id = v_first_id
      and status = 'active'
  ) <> 3 then
    raise exception 'expected first proposal to reserve all three cycle edges';
  end if;

  v_snapshot := public.compute_available_graph_component_snapshot(v_a, v_b, 'COP');
  select (v_snapshot -> 'anchorEdge' ->> 'amount_minor')::bigint
    into v_anchor_after;

  if v_anchor_after <> v_anchor_before - v_first_amount then
    raise exception 'expected residual anchor amount %, got %', v_anchor_before - v_first_amount, v_anchor_after;
  end if;

  v_job := public.enqueue_graph_cycle_job(
    'test_residual_context',
    v_first_id,
    v_a,
    v_a,
    v_a,
    v_b,
    'COP'
  );
  v_job_id := (v_job ->> 'jobId')::uuid;
  v_context := public.get_graph_cycle_job_context(v_job_id);

  if (v_context -> 'context' -> 'anchorEdge' ->> 'amount_minor')::bigint <> v_anchor_after then
    raise exception 'expected graph cycle worker context to expose residual amount, got %', v_context;
  end if;

  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_second_amount),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_second_amount),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', v_second_amount)
  );

  v_second := public.propose_cycle_settlement(
    v_a,
    'test-edge-reservations-second-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_c],
    v_a,
    v_b,
    'COP',
    null
  );
  v_second_id := (v_second ->> 'proposalId')::uuid;

  if v_second_id is null or v_second_id = v_first_id then
    raise exception 'expected second residual proposal, got first %, second %', v_first, v_second;
  end if;

  perform public.decide_cycle_settlement(v_a, 'test-edge-reservations-first-a', v_first_id, 'approved');
  perform public.decide_cycle_settlement(v_b, 'test-edge-reservations-first-b', v_first_id, 'approved');
  v_response := public.decide_cycle_settlement(v_c, 'test-edge-reservations-first-c', v_first_id, 'approved');

  if v_response ->> 'status' <> 'executed' then
    raise exception 'expected first proposal to execute, got %', v_response;
  end if;

  if not exists (
    select 1
    from public.settlement_proposals
    where id = v_second_id
      and status = 'pending_approvals'
  ) then
    raise exception 'expected second residual proposal to remain pending after first execution';
  end if;

  perform public.decide_cycle_settlement(v_a, 'test-edge-reservations-second-a', v_second_id, 'approved');
  perform public.decide_cycle_settlement(v_b, 'test-edge-reservations-second-b', v_second_id, 'approved');
  v_response := public.decide_cycle_settlement(v_c, 'test-edge-reservations-second-c', v_second_id, 'approved');

  if v_response ->> 'status' <> 'executed' then
    raise exception 'expected second proposal to execute from reserved residual, got %', v_response;
  end if;

  if exists (
    select 1
    from public.settlement_edge_reservations
    where settlement_proposal_id in (v_first_id, v_second_id)
      and status <> 'consumed'
  ) then
    raise exception 'expected executed proposal reservations to be consumed';
  end if;

  select coalesce(edge.amount_minor, 0)
    into v_edge_after
  from public.pair_net_edges_cache edge
  where edge.user_low_id = least(v_a, v_b)
    and edge.user_high_id = greatest(v_a, v_b)
    and edge.currency_code = 'COP';

  if v_edge_after <> v_anchor_before - v_first_amount - v_second_amount then
    raise exception 'expected ledger edge amount after both executions %, got %',
      v_anchor_before - v_first_amount - v_second_amount,
      v_edge_after;
  end if;

  v_request := public.create_balance_request(
    v_a,
    'test-edge-capacity-loss-a-d-request',
    'balance_increase',
    v_d,
    v_a,
    v_d,
    50000000,
    'Capacity loss A to D',
    null,
    null
  );
  perform public.accept_financial_request(
    v_d,
    'test-edge-capacity-loss-a-d-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_d,
    'test-edge-capacity-loss-d-b-request',
    'balance_increase',
    v_b,
    v_d,
    v_b,
    50000000,
    'Capacity loss D to B',
    null,
    null
  );
  perform public.accept_financial_request(
    v_b,
    'test-edge-capacity-loss-d-b-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_b,
    'test-edge-capacity-loss-b-a-request',
    'balance_increase',
    v_a,
    v_b,
    v_a,
    50000000,
    'Capacity loss B to A',
    null,
    null
  );
  perform public.accept_financial_request(
    v_a,
    'test-edge-capacity-loss-b-a-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_snapshot := public.compute_available_graph_component_snapshot(v_a, v_d, 'COP');

  select min((edge.value ->> 'amount_minor')::bigint)
    into v_available_amount
  from jsonb_array_elements(v_snapshot -> 'graphSnapshot') as edge(value)
  where ((edge.value ->> 'debtor_user_id')::uuid, (edge.value ->> 'creditor_user_id')::uuid) in (
    (v_a, v_d),
    (v_d, v_b),
    (v_b, v_a)
  );

  if v_available_amount is null or v_available_amount <= 10 then
    raise exception 'expected enough available amount for capacity loss test';
  end if;

  v_first_amount := (v_available_amount * 3) / 5;
  v_second_amount := v_available_amount - v_first_amount;

  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_a, 'amount_minor', v_first_amount),
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_d, 'amount_minor', v_first_amount),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_b, 'amount_minor', v_first_amount)
  );

  v_first := public.propose_cycle_settlement(
    v_a,
    'test-edge-capacity-loss-first-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_d],
    v_a,
    v_d,
    'COP',
    null
  );
  v_first_id := (v_first ->> 'proposalId')::uuid;

  v_snapshot := public.compute_available_graph_component_snapshot(v_a, v_d, 'COP');
  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_a, 'amount_minor', v_second_amount),
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_d, 'amount_minor', v_second_amount),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_b, 'amount_minor', v_second_amount)
  );

  v_second := public.propose_cycle_settlement(
    v_a,
    'test-edge-capacity-loss-second-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_d],
    v_a,
    v_d,
    'COP',
    null
  );
  v_second_id := (v_second ->> 'proposalId')::uuid;

  v_request := public.create_balance_request(
    v_d,
    'test-edge-capacity-loss-reducer-request',
    'balance_increase',
    v_a,
    v_d,
    v_a,
    v_second_amount,
    'Reduce reserved capacity',
    null,
    null
  );
  perform public.accept_financial_request(
    v_a,
    'test-edge-capacity-loss-reducer-accept',
    (v_request ->> 'requestId')::uuid
  );

  if not exists (
    select 1
    from public.settlement_proposals
    where id = v_first_id
      and status = 'pending_approvals'
  ) then
    raise exception 'expected older reservation to keep capacity';
  end if;

  if not exists (
    select 1
    from public.settlement_proposals
    where id = v_second_id
      and status = 'stale'
      and stale_reason = 'reserved_capacity_lost'
  ) then
    raise exception 'expected later reservation to become stale after capacity loss';
  end if;

  if exists (
    select 1
    from public.settlement_edge_reservations
    where settlement_proposal_id = v_second_id
      and status = 'active'
  ) then
    raise exception 'expected stale proposal reservations to be released';
  end if;

  v_response := public.decide_cycle_settlement(
    v_a,
    'test-edge-capacity-loss-reject-first',
    v_first_id,
    'rejected'
  );

  if v_response ->> 'status' <> 'rejected' then
    raise exception 'expected rejection response, got %', v_response;
  end if;

  if exists (
    select 1
    from public.settlement_edge_reservations
    where settlement_proposal_id = v_first_id
      and status = 'active'
  ) then
    raise exception 'expected rejected proposal to release reservations';
  end if;

  v_snapshot := public.compute_available_graph_component_snapshot(v_a, v_d, 'COP');
  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_a, 'amount_minor', 2),
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_d, 'amount_minor', 2),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_b, 'amount_minor', 2)
  );

  v_first := public.propose_cycle_settlement(
    v_a,
    'test-edge-reservation-morph-old-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_d],
    v_a,
    v_d,
    'COP',
    null
  );
  v_first_id := (v_first ->> 'proposalId')::uuid;

  if v_first_id is null then
    raise exception 'expected morph old proposal, got %', v_first;
  end if;

  perform public.mark_happy_circle_proposal_stale(
    v_a,
    v_first_id,
    'balance_changed'::public.settlement_stale_reason
  );

  v_job := public.enqueue_graph_cycle_job(
    'stale_settlement_proposal',
    v_first_id,
    v_a,
    v_a,
    v_a,
    v_d,
    'COP'
  );
  v_job_id := (v_job ->> 'jobId')::uuid;

  if v_job_id is null then
    raise exception 'expected morph job id, got %', v_job;
  end if;

  v_snapshot := public.compute_available_graph_component_snapshot(v_a, v_d, 'COP');
  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_a, 'amount_minor', 1),
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_d, 'amount_minor', 1),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_b, 'amount_minor', 1)
  );

  v_response := public.propose_cycle_settlement(
    v_b,
    'test-edge-reservation-morph-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_d],
    v_a,
    v_d,
    'COP',
    v_job_id
  );

  if (v_response ->> 'proposalId')::uuid = v_first_id then
    raise exception 'expected morph to create replacement proposal, got %', v_response;
  end if;

  select happy_circle_case_id
    into v_case_id
  from public.settlement_proposals
  where id = v_first_id;

  if not exists (
    select 1
    from public.settlement_proposals replacement
    where replacement.id = (v_response ->> 'proposalId')::uuid
      and replacement.happy_circle_case_id = v_case_id
      and replacement.replaces_proposal_id = v_first_id
  ) then
    raise exception 'expected morph replacement to preserve happy circle case lineage';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - happy circle edge reservations preserve residual capacity and ledger safety';
