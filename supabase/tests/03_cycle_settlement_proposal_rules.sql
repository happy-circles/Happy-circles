\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_graph_snapshot_hash text;
  v_proposal_first jsonb;
  v_proposal_second jsonb;
  v_proposal_id uuid;
  v_pending_count integer;
  v_participant_count integer;
begin
  select public.compute_graph_snapshot_hash()
    into v_graph_snapshot_hash;

  v_proposal_first := public.propose_cycle_settlement(
    '00000000-0000-0000-0000-0000000000a1',
    'test-cycle-proposal-first',
    v_graph_snapshot_hash,
    (
      select jsonb_agg(row_to_json(edge))
      from public.v_pair_net_edges_authoritative edge
    ),
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
    ]
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
    (
      select jsonb_agg(row_to_json(edge))
      from public.v_pair_net_edges_authoritative edge
    ),
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
    ]
  );

  if (v_proposal_second ->> 'proposalId')::uuid <> v_proposal_id then
    raise exception 'expected second proposal call to reuse open proposal';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - cycle settlement proposal rules';
