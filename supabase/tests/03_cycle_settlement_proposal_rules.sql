\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_request jsonb;
  v_request_id uuid;
  v_snapshot jsonb;
  v_graph_snapshot_hash text;
  v_proposal_first jsonb;
  v_proposal_second jsonb;
  v_proposal_id uuid;
  v_pending_count integer;
  v_participant_count integer;
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

  v_request := public.create_balance_request(
    '00000000-0000-0000-0000-0000000000a1',
    'test-cycle-proposal-anchor-request',
    'balance_increase',
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2',
    1234,
    'Cycle proposal test anchor',
    null,
    null
  );

  v_request_id := (v_request ->> 'requestId')::uuid;

  perform public.accept_financial_request(
    '00000000-0000-0000-0000-0000000000b2',
    'test-cycle-proposal-anchor-accept',
    v_request_id
  );

  v_snapshot := public.compute_graph_component_snapshot(
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2',
    'COP'
  );
  v_graph_snapshot_hash := v_snapshot ->> 'graphSnapshotHash';

  if v_graph_snapshot_hash is null then
    raise exception 'expected local graph snapshot hash';
  end if;

  v_proposal_first := public.propose_cycle_settlement(
    '00000000-0000-0000-0000-0000000000a1',
    'test-cycle-proposal-first',
    v_graph_snapshot_hash,
    v_snapshot -> 'graphSnapshot',
    '[
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000b2","creditor_user_id":"00000000-0000-0000-0000-0000000000a1","amount_minor":120000},
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000c3","creditor_user_id":"00000000-0000-0000-0000-0000000000b2","amount_minor":120000},
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000d4","creditor_user_id":"00000000-0000-0000-0000-0000000000c3","amount_minor":120000},
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000a1","creditor_user_id":"00000000-0000-0000-0000-0000000000d4","amount_minor":120000}
    ]'::jsonb,
    array[
      '00000000-0000-0000-0000-0000000000a1'::uuid,
      '00000000-0000-0000-0000-0000000000b2'::uuid,
      '00000000-0000-0000-0000-0000000000c3'::uuid,
      '00000000-0000-0000-0000-0000000000d4'::uuid
    ],
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2',
    'COP',
    null
  );

  v_proposal_id := (v_proposal_first ->> 'proposalId')::uuid;

  if v_proposal_id is null then
    raise exception 'expected proposal id from first proposal';
  end if;

  select count(*)
    into v_participant_count
  from public.settlement_proposal_participants
  where settlement_proposal_id = v_proposal_id;

  if v_participant_count <> 4 then
    raise exception 'expected 4 participants, got %', v_participant_count;
  end if;

  select count(*)
    into v_pending_count
  from public.settlement_proposal_participants
  where settlement_proposal_id = v_proposal_id
    and decision = 'pending';

  if v_pending_count <> 4 then
    raise exception 'expected all participants pending, got % pending', v_pending_count;
  end if;

  v_proposal_second := public.propose_cycle_settlement(
    '00000000-0000-0000-0000-0000000000b2',
    'test-cycle-proposal-second',
    v_graph_snapshot_hash,
    v_snapshot -> 'graphSnapshot',
    '[
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000b2","creditor_user_id":"00000000-0000-0000-0000-0000000000a1","amount_minor":120000},
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000c3","creditor_user_id":"00000000-0000-0000-0000-0000000000b2","amount_minor":120000},
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000d4","creditor_user_id":"00000000-0000-0000-0000-0000000000c3","amount_minor":120000},
      {"debtor_user_id":"00000000-0000-0000-0000-0000000000a1","creditor_user_id":"00000000-0000-0000-0000-0000000000d4","amount_minor":120000}
    ]'::jsonb,
    array[
      '00000000-0000-0000-0000-0000000000a1'::uuid,
      '00000000-0000-0000-0000-0000000000b2'::uuid,
      '00000000-0000-0000-0000-0000000000c3'::uuid,
      '00000000-0000-0000-0000-0000000000d4'::uuid
    ],
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2',
    'COP',
    null
  );

  if (v_proposal_second ->> 'proposalId')::uuid <> v_proposal_id then
    raise exception 'expected second proposal call to reuse open proposal';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - cycle settlement proposal rules';
