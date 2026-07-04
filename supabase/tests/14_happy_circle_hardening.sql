\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b2';
  v_c uuid := '00000000-0000-0000-0000-0000000000c3';
  v_d uuid := '00000000-0000-0000-0000-0000000000d4';
  v_snapshot jsonb;
  v_amount_minor bigint;
  v_movements jsonb;
  v_proposal jsonb;
  v_proposal_id uuid;
  v_response jsonb;
  v_rejected_count integer;
  v_invalid_payload_rejected boolean := false;
begin
  update public.settlement_proposals
  set status = 'stale',
      updated_at = timezone('utc', now())
  where status in ('pending_approvals', 'approved');

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
    raise exception 'expected active test cycle amount';
  end if;

  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_c, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_d, 'amount_minor', v_amount_minor)
  );

  begin
    perform public.validate_cycle_settlement_payload(
      v_snapshot -> 'graphSnapshot',
      jsonb_build_array(
        jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_b, 'amount_minor', v_amount_minor + 1)
      ),
      array[v_a, v_b, v_c, v_d],
      v_a,
      v_b,
      'COP'
    );
  exception
    when others then
      v_invalid_payload_rejected := true;
  end;

  if not v_invalid_payload_rejected then
    raise exception 'expected invalid cycle payload to be rejected';
  end if;

  v_proposal := public.propose_cycle_settlement(
    v_a,
    'test-harden-reject-propose',
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

  v_response := public.decide_cycle_settlement(
    v_b,
    'test-harden-reject-decision',
    v_proposal_id,
    'rejected'
  );

  if v_response ->> 'status' <> 'rejected' then
    raise exception 'expected rejected response, got %', v_response;
  end if;

  select count(*)
    into v_rejected_count
  from public.settlement_proposal_participants
  where settlement_proposal_id = v_proposal_id
    and participant_user_id = v_b
    and decision = 'rejected';

  if v_rejected_count <> 1 then
    raise exception 'expected rejecting participant to be marked rejected';
  end if;

  if not exists (
    select 1
    from public.settlement_proposals
    where id = v_proposal_id
      and status = 'rejected'
  ) then
    raise exception 'expected rejected proposal status';
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
  v_execution_count integer;
  v_ledger_transaction_count integer;
  v_already_decided_rejected boolean := false;
begin
  v_request := public.create_balance_request(
    v_a,
    'test-harden-auto-exec-shift-request',
    'balance_increase',
    v_b,
    v_a,
    v_b,
    19,
    'Hardening graph shift',
    null,
    null
  );

  v_request_id := (v_request ->> 'requestId')::uuid;

  perform public.accept_financial_request(
    v_b,
    'test-harden-auto-exec-shift-accept',
    v_request_id
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
    raise exception 'expected shifted active test cycle amount';
  end if;

  v_amount_minor := greatest(1, v_amount_minor - 1);

  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_c, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_d, 'amount_minor', v_amount_minor)
  );

  v_proposal := public.propose_cycle_settlement(
    v_a,
    'test-harden-auto-exec-propose',
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

  v_response := public.decide_cycle_settlement(
    v_a,
    'test-harden-auto-exec-approve-a',
    v_proposal_id,
    'approved'
  );

  if v_response ->> 'status' <> 'pending_approvals'
    or (v_response ->> 'approvalsPending')::integer <> 3 then
    raise exception 'expected first approval to remain pending, got %', v_response;
  end if;

  begin
    perform public.decide_cycle_settlement(
      v_a,
      'test-harden-auto-exec-approve-a-again',
      v_proposal_id,
      'approved'
    );
  exception
    when others then
      if sqlerrm = 'settlement_participant_already_decided' then
        v_already_decided_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_already_decided_rejected then
    raise exception 'expected second participant decision to fail';
  end if;

  perform public.decide_cycle_settlement(v_b, 'test-harden-auto-exec-approve-b', v_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_c, 'test-harden-auto-exec-approve-c', v_proposal_id, 'approved');
  v_response := public.decide_cycle_settlement(
    v_d,
    'test-harden-auto-exec-approve-d',
    v_proposal_id,
    'approved'
  );

  if v_response ->> 'status' <> 'executed' then
    raise exception 'expected final approval to execute, got %', v_response;
  end if;

  select count(*)
    into v_execution_count
  from public.settlement_executions
  where settlement_proposal_id = v_proposal_id;

  if v_execution_count <> 1 then
    raise exception 'expected exactly one settlement execution, got %', v_execution_count;
  end if;

  select count(*)
    into v_ledger_transaction_count
  from public.ledger_transactions
  where origin_settlement_proposal_id = v_proposal_id
    and transaction_type = 'cycle_settlement';

  if v_ledger_transaction_count <> 4 then
    raise exception 'expected 4 cycle ledger transactions, got %', v_ledger_transaction_count;
  end if;
end
$$;

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b2';
  v_job_id uuid;
  v_claimed jsonb;
  v_completed jsonb;
  v_requeued jsonb;
  v_wrong_worker_rejected boolean := false;
begin
  insert into public.graph_cycle_jobs (
    source_type,
    source_id,
    actor_user_id,
    anchor_user_id,
    user_low_id,
    user_high_id,
    currency_code,
    status,
    created_at
  )
  values (
    'hardening_test',
    gen_random_uuid(),
    v_a,
    v_a,
    v_a,
    v_b,
    'COP',
    'pending',
    '2000-01-01 00:00:00+00'
  )
  returning id into v_job_id;

  v_claimed := public.claim_graph_cycle_job('worker_a');

  if (v_claimed ->> 'id')::uuid <> v_job_id then
    raise exception 'expected worker_a to claim hardening job, got %', v_claimed;
  end if;

  begin
    perform public.complete_graph_cycle_job(v_job_id, 'worker_b', '{"status":"wrong_worker"}'::jsonb);
  exception
    when others then
      if sqlerrm = 'graph_cycle_job_not_owned_by_worker' then
        v_wrong_worker_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_wrong_worker_rejected then
    raise exception 'expected wrong worker completion to fail';
  end if;

  v_requeued := public.requeue_stale_graph_cycle_jobs(0, 10);

  if (v_requeued ->> 'requeuedCount')::integer < 1 then
    raise exception 'expected stale processing job to be requeued, got %', v_requeued;
  end if;

  v_claimed := public.claim_graph_cycle_job('worker_b');

  if (v_claimed ->> 'id')::uuid <> v_job_id then
    raise exception 'expected worker_b to reclaim hardening job, got %', v_claimed;
  end if;

  v_completed := public.complete_graph_cycle_job(v_job_id, 'worker_b', '{"status":"ok"}'::jsonb);

  if v_completed ->> 'status' <> 'completed' then
    raise exception 'expected worker_b completion, got %', v_completed;
  end if;
end
$$;

\unset QUIET
select '1..3';
select 'ok 1 - invalid cycle payload and rejection are authoritative';
select 'ok 2 - participant decisions are single-use and final approval auto-executes';
select 'ok 3 - graph cycle jobs enforce worker ownership and stale recovery';
