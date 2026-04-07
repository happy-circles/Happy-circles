create or replace function public.propose_cycle_settlement(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_graph_snapshot_hash text,
  p_graph_snapshot jsonb,
  p_movements_json jsonb,
  p_participant_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_proposal_id uuid;
  v_response jsonb;
  v_participant_user_id uuid;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'propose_cycle_settlement', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'propose_cycle_settlement'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  if p_graph_snapshot_hash <> public.compute_graph_snapshot_hash() then
    raise exception 'graph_snapshot_mismatch';
  end if;

  insert into public.settlement_proposals (
    created_by_user_id,
    status,
    graph_snapshot_hash,
    graph_snapshot,
    movements_json
  )
  values (
    p_actor_user_id,
    'pending_approvals',
    p_graph_snapshot_hash,
    p_graph_snapshot,
    p_movements_json
  )
  returning id into v_proposal_id;

  foreach v_participant_user_id in array p_participant_user_ids
  loop
    insert into public.settlement_proposal_participants (
      settlement_proposal_id,
      participant_user_id,
      decision
    )
    values (
      v_proposal_id,
      v_participant_user_id,
      case when v_participant_user_id = p_actor_user_id then 'approved' else 'pending' end
    );
  end loop;

  if not exists (
    select 1
    from public.settlement_proposal_participants
    where settlement_proposal_id = v_proposal_id
      and decision = 'pending'
  ) then
    update public.settlement_proposals
    set status = 'approved'
    where id = v_proposal_id;
  end if;

  perform public.append_audit_event(
    p_actor_user_id,
    'settlement_proposal',
    v_proposal_id,
    'settlement_proposed',
    null,
    jsonb_build_object('participants', p_participant_user_ids)
  );

  v_response := jsonb_build_object(
    'proposalId', v_proposal_id,
    'status', (
      select status::text
      from public.settlement_proposals
      where id = v_proposal_id
    )
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.decide_cycle_settlement(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_proposal_id uuid,
  p_decision public.settlement_participant_decision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_response jsonb;
  v_all_approved boolean;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'decide_cycle_settlement', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'decide_cycle_settlement'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  update public.settlement_proposal_participants
  set decision = p_decision,
      decided_at = timezone('utc', now())
  where settlement_proposal_id = p_proposal_id
    and participant_user_id = p_actor_user_id;

  if not found then
    raise exception 'settlement_participant_not_found';
  end if;

  if p_decision = 'rejected' then
    update public.settlement_proposals
    set status = 'rejected'
    where id = p_proposal_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'settlement_proposal',
      p_proposal_id,
      'settlement_rejected',
      null,
      '{}'::jsonb
    );
  else
    select not exists (
      select 1
      from public.settlement_proposal_participants
      where settlement_proposal_id = p_proposal_id
        and decision <> 'approved'
    )
    into v_all_approved;

    if v_all_approved then
      update public.settlement_proposals
      set status = 'approved'
      where id = p_proposal_id;
    end if;

    perform public.append_audit_event(
      p_actor_user_id,
      'settlement_proposal',
      p_proposal_id,
      'settlement_approved',
      null,
      jsonb_build_object('fully_approved', coalesce(v_all_approved, false))
    );
  end if;

  v_response := jsonb_build_object(
    'proposalId', p_proposal_id,
    'status', (
      select status::text
      from public.settlement_proposals
      where id = p_proposal_id
    )
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.execute_cycle_settlement(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_proposal public.settlement_proposals%rowtype;
  v_execution_id uuid;
  v_movement jsonb;
  v_transaction_id uuid;
  v_debtor_payable_account_id uuid;
  v_creditor_receivable_account_id uuid;
  v_current_hash text;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'execute_cycle_settlement', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'execute_cycle_settlement'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_proposal
  from public.settlement_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'settlement_proposal_not_found';
  end if;

  if v_proposal.status <> 'approved' then
    raise exception 'settlement_proposal_not_approved';
  end if;

  if not exists (
    select 1
    from public.settlement_proposal_participants
    where settlement_proposal_id = p_proposal_id
      and participant_user_id = p_actor_user_id
  ) then
    raise exception 'actor_not_participant';
  end if;

  v_current_hash := public.compute_graph_snapshot_hash();
  if v_current_hash <> v_proposal.graph_snapshot_hash then
    update public.settlement_proposals
    set status = 'stale'
    where id = p_proposal_id;

    v_response := jsonb_build_object(
      'proposalId', p_proposal_id,
      'status', 'stale'
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
  end if;

  insert into public.settlement_executions (
    settlement_proposal_id,
    executed_by_user_id
  )
  values (
    p_proposal_id,
    p_actor_user_id
  )
  returning id into v_execution_id;

  for v_movement in
    select value
    from jsonb_array_elements(v_proposal.movements_json)
  loop
    select id
      into v_debtor_payable_account_id
    from public.ledger_accounts
    where owner_user_id = (v_movement ->> 'debtor_user_id')::uuid
      and counterparty_user_id = (v_movement ->> 'creditor_user_id')::uuid
      and account_kind = 'payable'
      and currency_code = 'COP';

    select id
      into v_creditor_receivable_account_id
    from public.ledger_accounts
    where owner_user_id = (v_movement ->> 'creditor_user_id')::uuid
      and counterparty_user_id = (v_movement ->> 'debtor_user_id')::uuid
      and account_kind = 'receivable'
      and currency_code = 'COP';

    insert into public.ledger_transactions (
      transaction_type,
      source_type,
      currency_code,
      origin_settlement_proposal_id,
      description,
      created_by_user_id
    )
    values (
      'cycle_settlement',
      'system',
      'COP',
      p_proposal_id,
      'Cycle settlement system movement',
      p_actor_user_id
    )
    returning id into v_transaction_id;

    insert into public.ledger_entries (
      ledger_transaction_id,
      ledger_account_id,
      entry_side,
      amount_minor,
      entry_order
    )
    values
      (
        v_transaction_id,
        v_creditor_receivable_account_id,
        'debit',
        (v_movement ->> 'amount_minor')::bigint,
        1
      ),
      (
        v_transaction_id,
        v_debtor_payable_account_id,
        'credit',
        (v_movement ->> 'amount_minor')::bigint,
        2
      );

    perform public.refresh_pair_net_edge_for_pair(
      (v_movement ->> 'debtor_user_id')::uuid,
      (v_movement ->> 'creditor_user_id')::uuid,
      v_transaction_id
    );
  end loop;

  update public.settlement_proposals
  set status = 'executed',
      executed_at = timezone('utc', now())
  where id = p_proposal_id;

  perform public.append_audit_event(
    p_actor_user_id,
    'settlement_execution',
    v_execution_id,
    'settlement_executed',
    null,
    jsonb_build_object('proposal_id', p_proposal_id)
  );

  v_response := jsonb_build_object(
    'proposalId', p_proposal_id,
    'executionId', v_execution_id,
    'status', 'executed'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;
