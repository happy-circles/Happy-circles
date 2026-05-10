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
  v_first jsonb;
  v_second jsonb;
  v_first_id uuid;
  v_second_id uuid;
  v_case_id uuid;
  v_job jsonb;
  v_job_id uuid;
begin
  update public.settlement_proposals
  set status = 'stale',
      stale_reason = coalesce(stale_reason, 'related_execution_changed_balance'::public.settlement_stale_reason),
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

  v_first := public.propose_cycle_settlement(
    v_a,
    'test-version-history-first',
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
    and version_number = 1;

  if v_case_id is null then
    raise exception 'expected first proposal to create happy circle case';
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

  v_second := public.propose_cycle_settlement(
    v_b,
    'test-version-history-second',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_movements,
    array[v_a, v_b, v_c, v_d],
    v_a,
    v_b,
    'COP',
    v_job_id
  );
  v_second_id := (v_second ->> 'proposalId')::uuid;

  if v_second_id is null or v_second_id = v_first_id then
    raise exception 'expected replacement proposal, got %', v_second;
  end if;

  if not exists (
    select 1
    from public.settlement_proposals old_proposal
    join public.settlement_proposals new_proposal
      on new_proposal.id = v_second_id
    where old_proposal.id = v_first_id
      and old_proposal.status = 'stale'
      and old_proposal.stale_reason = 'balance_changed'
      and old_proposal.replaced_by_proposal_id = v_second_id
      and new_proposal.replaces_proposal_id = v_first_id
      and new_proposal.happy_circle_case_id = v_case_id
      and new_proposal.version_number = 2
  ) then
    raise exception 'expected explicit happy circle version lineage';
  end if;

  if not exists (
    select 1
    from public.happy_circle_cases circle_case
    where circle_case.id = v_case_id
      and circle_case.status = 'active'
      and circle_case.current_proposal_id = v_second_id
  ) then
    raise exception 'expected happy circle case to point at replacement';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - happy circle stale proposals keep explicit version history';
