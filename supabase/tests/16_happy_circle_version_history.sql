\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_a uuid := '00000000-0000-0000-0000-0000000000a1';
  v_b uuid := '00000000-0000-0000-0000-0000000000b2';
  v_c uuid := '00000000-0000-0000-0000-0000000000c3';
  v_d uuid := '00000000-0000-0000-0000-0000000000d4';
  v_request jsonb;
  v_snapshot jsonb;
  v_amount_minor bigint;
  v_movements jsonb;
  v_changed_movements jsonb;
  v_first jsonb;
  v_revalidated jsonb;
  v_replacement jsonb;
  v_first_id uuid;
  v_replacement_id uuid;
  v_case_id uuid;
  v_job jsonb;
  v_job_id uuid;
begin
  update public.settlement_proposals
  set status = 'stale',
      stale_reason = coalesce(stale_reason, 'related_execution_changed_balance'::public.settlement_stale_reason),
      updated_at = timezone('utc', now())
  where status in ('pending_approvals', 'approved');

  v_request := public.create_balance_request(
    v_a,
    'test-version-cycle-a-b-request',
    'balance_increase',
    v_b,
    v_a,
    v_b,
    90000,
    'Version cycle A to B',
    null,
    null
  );

  perform public.accept_financial_request(
    v_b,
    'test-version-cycle-a-b-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_b,
    'test-version-cycle-b-c-request',
    'balance_increase',
    v_c,
    v_b,
    v_c,
    90000,
    'Version cycle B to C',
    null,
    null
  );

  perform public.accept_financial_request(
    v_c,
    'test-version-cycle-b-c-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_c,
    'test-version-cycle-c-d-request',
    'balance_increase',
    v_d,
    v_c,
    v_d,
    90000,
    'Version cycle C to D',
    null,
    null
  );

  perform public.accept_financial_request(
    v_d,
    'test-version-cycle-c-d-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_d,
    'test-version-cycle-d-a-request',
    'balance_increase',
    v_a,
    v_d,
    v_a,
    90000,
    'Version cycle D to A',
    null,
    null
  );

  perform public.accept_financial_request(
    v_a,
    'test-version-cycle-d-a-accept',
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

  if v_amount_minor is null or v_amount_minor <= 1 then
    raise exception 'expected active test cycle amount above one minor unit';
  end if;

  v_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_c, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_d, 'amount_minor', v_amount_minor)
  );

  v_changed_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_amount_minor - 1),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_amount_minor - 1),
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_c, 'amount_minor', v_amount_minor - 1),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_d, 'amount_minor', v_amount_minor - 1)
  );

  v_first := public.propose_cycle_settlement(
    v_a,
    'test-version-result-hash-first',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_c, v_d],
    v_a,
    v_b,
    'COP',
    null
  );
  v_first_id := (v_first ->> 'proposalId')::uuid;

  select happy_circle_case_id
    into v_case_id
  from public.settlement_proposals
  where id = v_first_id
    and version_number = 1
    and result_hash is not null;

  if v_case_id is null then
    raise exception 'expected first proposal to create happy circle case and result hash';
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
    v_b,
    'COP'
  );
  v_job_id := (v_job ->> 'jobId')::uuid;

  if v_job_id is null then
    raise exception 'expected stale proposal job id, got %', v_job;
  end if;

  v_revalidated := public.propose_cycle_settlement(
    v_b,
    'test-version-result-hash-revalidated',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_c, v_d],
    v_a,
    v_b,
    'COP',
    v_job_id
  );

  if (v_revalidated ->> 'proposalId')::uuid <> v_first_id
    or coalesce((v_revalidated ->> 'revalidated')::boolean, false) is not true
    or (v_revalidated ->> 'versionNumber')::integer <> 1 then
    raise exception 'expected stale proposal to be revalidated without a new visible version, got %', v_revalidated;
  end if;

  if not exists (
    select 1
    from public.settlement_proposals proposal
    where proposal.id = v_first_id
      and proposal.status = 'pending_approvals'
      and proposal.stale_reason is null
      and proposal.replaced_by_proposal_id is null
      and proposal.version_number = 1
      and proposal.result_hash = public.compute_settlement_result_hash(
        v_movements,
        array[v_a, v_b, v_c, v_d],
        'COP'
      )
  ) then
    raise exception 'expected original proposal to be reactivated with preserved version number';
  end if;

  if not exists (
    select 1
    from public.happy_circle_cases circle_case
    where circle_case.id = v_case_id
      and circle_case.status = 'active'
      and circle_case.current_proposal_id = v_first_id
  ) then
    raise exception 'expected happy circle case to keep current proposal after revalidation';
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
    v_b,
    'COP'
  );
  v_job_id := (v_job ->> 'jobId')::uuid;

  if v_job_id is null then
    raise exception 'expected second stale proposal job id, got %', v_job;
  end if;

  v_replacement := public.propose_cycle_settlement(
    v_b,
    'test-version-result-hash-replacement',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_changed_movements,
    array[v_a, v_b, v_c, v_d],
    v_a,
    v_b,
    'COP',
    v_job_id
  );
  v_replacement_id := (v_replacement ->> 'proposalId')::uuid;

  if v_replacement_id is null or v_replacement_id = v_first_id then
    raise exception 'expected changed visible result to create replacement proposal, got %', v_replacement;
  end if;

  if not exists (
    select 1
    from public.settlement_proposals old_proposal
    join public.settlement_proposals new_proposal
      on new_proposal.id = v_replacement_id
    where old_proposal.id = v_first_id
      and old_proposal.status = 'stale'
      and old_proposal.stale_reason = 'balance_changed'
      and old_proposal.replaced_by_proposal_id = v_replacement_id
      and new_proposal.replaces_proposal_id = v_first_id
      and new_proposal.happy_circle_case_id = v_case_id
      and new_proposal.version_number = 2
      and new_proposal.result_hash <> old_proposal.result_hash
  ) then
    raise exception 'expected changed result to keep explicit happy circle version lineage';
  end if;

  if not exists (
    select 1
    from public.happy_circle_cases circle_case
    where circle_case.id = v_case_id
      and circle_case.status = 'active'
      and circle_case.current_proposal_id = v_replacement_id
  ) then
    raise exception 'expected happy circle case to point at replacement';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - happy circle result hash revalidates identical results and versions changed results';
