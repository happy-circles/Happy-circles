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
  v_changed_amount_minor bigint;
  v_old_movements jsonb;
  v_amount_movements jsonb;
  v_new_movements jsonb;
  v_old_response jsonb;
  v_amount_response jsonb;
  v_morph_response jsonb;
  v_exact_response jsonb;
  v_old_proposal_id uuid;
  v_amount_proposal_id uuid;
  v_morph_proposal_id uuid;
  v_case_id uuid;
  v_job jsonb;
  v_job_id uuid;
  v_new_participant_hash text;
  v_hash_base text;
  v_hash_group_changed text;
  v_hash_counterparty_changed text;
  v_hash_amount_changed text;
  v_hash_currency_changed text;
begin
  update public.settlement_proposals
  set status = 'stale',
      stale_reason = coalesce(stale_reason, 'related_execution_changed_balance'::public.settlement_stale_reason),
      updated_at = timezone('utc', now())
  where status in ('pending_approvals', 'approved');

  update public.happy_circle_cases
  set status = 'closed',
      completed_at = coalesce(completed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where status = 'active'
    and not exists (
      select 1
      from public.settlement_proposals proposal
      where proposal.happy_circle_case_id = happy_circle_cases.id
        and proposal.status in ('pending_approvals', 'approved')
    );

  v_hash_base := public.compute_cycle_participant_approval_scope_hash(
    jsonb_build_array(
      jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', 1000),
      jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', 1000)
    ),
    v_a,
    'COP'
  );
  v_hash_group_changed := public.compute_cycle_participant_approval_scope_hash(
    jsonb_build_array(
      jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', 1000),
      jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', 1000),
      jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_b, 'amount_minor', 1000)
    ),
    v_a,
    'COP'
  );
  v_hash_counterparty_changed := public.compute_cycle_participant_approval_scope_hash(
    jsonb_build_array(
      jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_d, 'amount_minor', 1000),
      jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', 1000)
    ),
    v_a,
    'COP'
  );
  v_hash_amount_changed := public.compute_cycle_participant_approval_scope_hash(
    jsonb_build_array(
      jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', 2000),
      jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', 1000)
    ),
    v_a,
    'COP'
  );
  v_hash_currency_changed := public.compute_cycle_participant_approval_scope_hash(
    jsonb_build_array(
      jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', 1000),
      jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', 1000)
    ),
    v_a,
    'USD'
  );

  if v_hash_base <> v_hash_group_changed then
    raise exception 'expected approval scope hash to ignore unrelated group movement';
  end if;

  if v_hash_base = v_hash_counterparty_changed then
    raise exception 'expected approval scope hash to change when personal counterparty changes';
  end if;

  if v_hash_base = v_hash_amount_changed then
    raise exception 'expected approval scope hash to change when personal amount changes';
  end if;

  if v_hash_base = v_hash_currency_changed then
    raise exception 'expected approval scope hash to change when currency changes';
  end if;

  v_request := public.create_balance_request(
    v_a,
    'test-carried-approvals-a-b-request',
    'balance_increase',
    v_b,
    v_a,
    v_b,
    50000000,
    'Carried approval A to B',
    null,
    null
  );
  perform public.accept_financial_request(
    v_b,
    'test-carried-approvals-a-b-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_b,
    'test-carried-approvals-b-c-request',
    'balance_increase',
    v_c,
    v_b,
    v_c,
    50000000,
    'Carried approval B to C',
    null,
    null
  );
  perform public.accept_financial_request(
    v_c,
    'test-carried-approvals-b-c-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_c,
    'test-carried-approvals-c-a-request',
    'balance_increase',
    v_a,
    v_c,
    v_a,
    50000000,
    'Carried approval C to A',
    null,
    null
  );
  perform public.accept_financial_request(
    v_a,
    'test-carried-approvals-c-a-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_b,
    'test-carried-approvals-b-d-request',
    'balance_increase',
    v_d,
    v_b,
    v_d,
    50000000,
    'Carried approval B to D',
    null,
    null
  );
  perform public.accept_financial_request(
    v_d,
    'test-carried-approvals-b-d-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_request := public.create_balance_request(
    v_d,
    'test-carried-approvals-d-c-request',
    'balance_increase',
    v_c,
    v_d,
    v_c,
    50000000,
    'Carried approval D to C',
    null,
    null
  );
  perform public.accept_financial_request(
    v_c,
    'test-carried-approvals-d-c-accept',
    (v_request ->> 'requestId')::uuid
  );

  v_snapshot := public.compute_graph_component_snapshot(v_a, v_b, 'COP');

  select min((edge.value ->> 'amount_minor')::bigint)
    into v_amount_minor
  from jsonb_array_elements(v_snapshot -> 'graphSnapshot') as edge(value)
  where ((edge.value ->> 'debtor_user_id')::uuid, (edge.value ->> 'creditor_user_id')::uuid) in (
    (v_a, v_b),
    (v_b, v_c),
    (v_c, v_a),
    (v_b, v_d),
    (v_d, v_c)
  );

  if v_amount_minor is null or v_amount_minor <= 0 then
    raise exception 'expected carried approval test graph edges';
  end if;
  v_changed_amount_minor := greatest(1, v_amount_minor / 2);

  v_old_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_amount_minor),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', v_amount_minor)
  );

  v_amount_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_changed_amount_minor),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_b, 'amount_minor', v_changed_amount_minor),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', v_changed_amount_minor)
  );

  v_new_movements := jsonb_build_array(
    jsonb_build_object('debtor_user_id', v_b, 'creditor_user_id', v_a, 'amount_minor', v_changed_amount_minor),
    jsonb_build_object('debtor_user_id', v_d, 'creditor_user_id', v_b, 'amount_minor', v_changed_amount_minor),
    jsonb_build_object('debtor_user_id', v_c, 'creditor_user_id', v_d, 'amount_minor', v_changed_amount_minor),
    jsonb_build_object('debtor_user_id', v_a, 'creditor_user_id', v_c, 'amount_minor', v_changed_amount_minor)
  );

  v_old_response := public.propose_cycle_settlement(
    v_a,
    'test-carried-approvals-old-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_old_movements,
    array[v_a, v_b, v_c],
    v_a,
    v_b,
    'COP',
    null
  );
  v_old_proposal_id := (v_old_response ->> 'proposalId')::uuid;

  select happy_circle_case_id
    into v_case_id
  from public.settlement_proposals
  where id = v_old_proposal_id;

  perform public.decide_cycle_settlement(
    v_a,
    'test-carried-approvals-a-approve-old',
    v_old_proposal_id,
    'approved'
  );
  perform public.decide_cycle_settlement(
    v_b,
    'test-carried-approvals-b-approve-old',
    v_old_proposal_id,
    'approved'
  );

  perform public.mark_happy_circle_proposal_stale(
    v_a,
    v_old_proposal_id,
    'balance_changed'::public.settlement_stale_reason
  );

  v_job := public.enqueue_graph_cycle_job(
    'stale_settlement_proposal',
    v_old_proposal_id,
    v_a,
    v_a,
    v_a,
    v_b,
    'COP'
  );
  v_job_id := (v_job ->> 'jobId')::uuid;

  v_amount_response := public.propose_cycle_settlement(
    v_a,
    'test-carried-approvals-same-group-amount-change',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_amount_movements,
    array[v_a, v_b, v_c],
    v_a,
    v_b,
    'COP',
    v_job_id
  );
  v_amount_proposal_id := (v_amount_response ->> 'proposalId')::uuid;

  if v_amount_proposal_id is null or v_amount_proposal_id = v_old_proposal_id then
    raise exception 'expected amount-changed Circle to create a replacement proposal, got %', v_amount_response;
  end if;

  if (v_amount_response ->> 'carriedApprovalCount')::integer <> 0
    or (v_amount_response ->> 'approvalsPending')::integer <> 3 then
    raise exception 'expected amount change to reset approvals for same participants, got %', v_amount_response;
  end if;

  if not exists (
    select 1
    from public.settlement_proposals old_proposal
    join public.settlement_proposals amount_proposal
      on amount_proposal.id = v_amount_proposal_id
    where old_proposal.id = v_old_proposal_id
      and old_proposal.status = 'stale'
      and old_proposal.replaced_by_proposal_id = v_amount_proposal_id
      and amount_proposal.replaces_proposal_id = v_old_proposal_id
      and amount_proposal.happy_circle_case_id = v_case_id
      and amount_proposal.version_number = 2
  ) then
    raise exception 'expected amount-changed Circle to keep case lineage';
  end if;

  if not exists (
    select 1
    from public.audit_events audit_event
    where audit_event.entity_type = 'happy_circle_case'
      and audit_event.entity_id = v_case_id
      and audit_event.event_name = 'happy_circle_case.version_morphed'
      and audit_event.metadata_json ->> 'old_proposal_id' = v_old_proposal_id::text
      and audit_event.metadata_json ->> 'new_proposal_id' = v_amount_proposal_id::text
      and (audit_event.metadata_json ->> 'old_cycle_amount_minor')::bigint = v_amount_minor
      and (audit_event.metadata_json ->> 'new_cycle_amount_minor')::bigint = v_changed_amount_minor
      and (audit_event.metadata_json ->> 'amount_changed')::boolean = true
      and (audit_event.metadata_json ->> 'participant_count_before')::integer = 3
      and (audit_event.metadata_json ->> 'participant_count_after')::integer = 3
      and (audit_event.metadata_json ->> 'added_participant_count')::integer = 0
      and (audit_event.metadata_json ->> 'removed_participant_count')::integer = 0
      and (audit_event.metadata_json ->> 'carried_approval_count')::integer = 0
      and (audit_event.metadata_json ->> 'pending_count')::integer = 3
  ) then
    raise exception 'expected amount-changed Circle audit metadata';
  end if;

  if exists (
    select 1
    from public.settlement_proposal_participants
    where settlement_proposal_id = v_amount_proposal_id
      and decision <> 'pending'
  ) then
    raise exception 'expected amount-changed participants to remain pending';
  end if;

  perform public.decide_cycle_settlement(
    v_a,
    'test-carried-approvals-a-approve-amount-version',
    v_amount_proposal_id,
    'approved'
  );

  perform public.mark_happy_circle_proposal_stale(
    v_a,
    v_amount_proposal_id,
    'balance_changed'::public.settlement_stale_reason
  );

  v_job := public.enqueue_graph_cycle_job(
    'stale_settlement_proposal',
    v_amount_proposal_id,
    v_a,
    v_a,
    v_a,
    v_b,
    'COP'
  );
  v_job_id := (v_job ->> 'jobId')::uuid;

  v_morph_response := public.propose_cycle_settlement(
    v_a,
    'test-carried-approvals-morphed-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_new_movements,
    array[v_a, v_b, v_c, v_d],
    v_a,
    v_b,
    'COP',
    v_job_id
  );
  v_morph_proposal_id := (v_morph_response ->> 'proposalId')::uuid;

  if v_morph_proposal_id is null or v_morph_proposal_id = v_amount_proposal_id then
    raise exception 'expected morphed Circle to create a replacement proposal, got %', v_morph_response;
  end if;

  if (v_morph_response ->> 'carriedApprovalCount')::integer <> 1
    or (v_morph_response ->> 'approvalsPending')::integer <> 3 then
    raise exception 'expected one carried approval and three pending approvals, got %', v_morph_response;
  end if;

  v_new_participant_hash := public.compute_happy_circle_participant_set_hash(array[v_a, v_b, v_c, v_d]);

  if not exists (
    select 1
    from public.settlement_proposals old_proposal
    join public.settlement_proposals new_proposal
      on new_proposal.id = v_morph_proposal_id
    join public.happy_circle_cases circle_case
      on circle_case.id = new_proposal.happy_circle_case_id
    where old_proposal.id = v_amount_proposal_id
      and old_proposal.status = 'stale'
      and old_proposal.replaced_by_proposal_id = v_morph_proposal_id
      and new_proposal.replaces_proposal_id = v_amount_proposal_id
      and new_proposal.happy_circle_case_id = v_case_id
      and new_proposal.version_number = 3
      and circle_case.id = v_case_id
      and circle_case.current_proposal_id = v_morph_proposal_id
      and circle_case.participant_set_hash = v_new_participant_hash
  ) then
    raise exception 'expected morphed Circle to keep case lineage and update participant set';
  end if;

  if not exists (
    select 1
    from public.settlement_proposal_participants new_participant
    join public.settlement_proposal_participants old_participant
      on old_participant.id = new_participant.carried_from_participant_id
    where new_participant.settlement_proposal_id = v_morph_proposal_id
      and new_participant.participant_user_id = v_a
      and new_participant.decision = 'approved'
      and new_participant.decision_source = 'carried'
      and new_participant.carried_at is not null
      and old_participant.settlement_proposal_id = v_amount_proposal_id
      and old_participant.participant_user_id = v_a
  ) then
    raise exception 'expected unchanged participant A approval to be carried';
  end if;

  if exists (
    select 1
    from public.settlement_proposal_participants new_participant
    join public.settlement_proposal_participants old_participant
      on old_participant.id = new_participant.carried_from_participant_id
    where new_participant.settlement_proposal_id = v_morph_proposal_id
      and old_participant.decision <> 'approved'
  ) then
    raise exception 'expected carried approvals to originate only from approved participants';
  end if;

  if exists (
    select 1
    from public.settlement_proposal_participants
    where settlement_proposal_id = v_morph_proposal_id
      and participant_user_id in (v_b, v_c, v_d)
      and decision <> 'pending'
  ) then
    raise exception 'expected changed or new participants to remain pending';
  end if;

  if not exists (
    select 1
    from public.audit_events audit_event
    where audit_event.entity_type = 'happy_circle_case'
      and audit_event.entity_id = v_case_id
      and audit_event.event_name = 'happy_circle_case.version_morphed'
      and audit_event.metadata_json ->> 'old_proposal_id' = v_amount_proposal_id::text
      and audit_event.metadata_json ->> 'new_proposal_id' = v_morph_proposal_id::text
      and (audit_event.metadata_json ->> 'old_cycle_amount_minor')::bigint = v_changed_amount_minor
      and (audit_event.metadata_json ->> 'new_cycle_amount_minor')::bigint = v_changed_amount_minor
      and (audit_event.metadata_json ->> 'amount_changed')::boolean = false
      and (audit_event.metadata_json ->> 'participant_count_before')::integer = 3
      and (audit_event.metadata_json ->> 'participant_count_after')::integer = 4
      and (audit_event.metadata_json ->> 'added_participant_count')::integer = 1
      and (audit_event.metadata_json ->> 'removed_participant_count')::integer = 0
      and (audit_event.metadata_json ->> 'carried_approval_count')::integer = 1
      and (audit_event.metadata_json ->> 'pending_count')::integer = 3
  ) then
    raise exception 'expected morphed Circle audit metadata to capture amount and participant changes';
  end if;

  update public.settlement_proposal_participants
  set decision = 'approved',
      decided_at = timezone('utc', now()),
      decision_source = 'manual',
      carried_from_participant_id = null,
      carried_at = null
  where settlement_proposal_id = v_morph_proposal_id
    and decision = 'pending';

  update public.settlement_proposals
  set status = 'approved',
      updated_at = timezone('utc', now())
  where id = v_morph_proposal_id;

  perform public.mark_happy_circle_proposal_stale(
    v_a,
    v_morph_proposal_id,
    'balance_changed'::public.settlement_stale_reason
  );

  v_job := public.enqueue_graph_cycle_job(
    'stale_settlement_proposal',
    v_morph_proposal_id,
    v_a,
    v_a,
    v_a,
    v_b,
    'COP'
  );
  v_job_id := (v_job ->> 'jobId')::uuid;

  v_exact_response := public.propose_cycle_settlement(
    v_a,
    'test-carried-approvals-exact-auto-execute',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    v_new_movements,
    array[v_a, v_b, v_c, v_d],
    v_a,
    v_b,
    'COP',
    v_job_id
  );

  if (v_exact_response ->> 'proposalId')::uuid <> v_morph_proposal_id
    or v_exact_response ->> 'status' <> 'executed' then
    raise exception 'expected exact revalidation with all approvals to execute, got %', v_exact_response;
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - happy circle carried approvals preserve personal impact and exact revalidation executes';
