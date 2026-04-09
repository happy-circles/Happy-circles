create or replace function public.mark_outdated_settlement_proposals_stale(
  p_current_graph_snapshot_hash text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.settlement_proposals
  set status = 'stale',
      updated_at = timezone('utc', now())
  where status in ('pending_approvals', 'approved')
    and graph_snapshot_hash <> p_current_graph_snapshot_hash;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create unique index if not exists settlement_proposals_one_open_per_graph_idx
  on public.settlement_proposals (graph_snapshot_hash)
  where status in ('pending_approvals', 'approved');

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
  v_existing_open_proposal_id uuid;
  v_existing_rejected_proposal_id uuid;
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

  select id
    into v_existing_open_proposal_id
  from public.settlement_proposals
  where graph_snapshot_hash = p_graph_snapshot_hash
    and status in ('pending_approvals', 'approved')
  order by created_at desc
  limit 1
  for update;

  if v_existing_open_proposal_id is not null then
    v_response := jsonb_build_object(
      'proposalId', v_existing_open_proposal_id,
      'status', (
        select status::text
        from public.settlement_proposals
        where id = v_existing_open_proposal_id
      )
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
  end if;

  select id
    into v_existing_rejected_proposal_id
  from public.settlement_proposals
  where graph_snapshot_hash = p_graph_snapshot_hash
    and status = 'rejected'
  order by created_at desc
  limit 1;

  if v_existing_rejected_proposal_id is not null then
    v_response := jsonb_build_object(
      'proposalId', v_existing_rejected_proposal_id,
      'status', 'rejected'
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
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
      'pending'
    );
  end loop;

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
    'status', 'pending_approvals'
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
  v_proposal public.settlement_proposals%rowtype;
  v_response jsonb;
  v_all_approved boolean;
  v_current_hash text;
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

  select *
    into v_proposal
  from public.settlement_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'settlement_proposal_not_found';
  end if;

  if v_proposal.status <> 'pending_approvals' then
    raise exception 'settlement_proposal_not_pending';
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

create or replace function public.accept_financial_request(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_request public.financial_requests%rowtype;
  v_transaction_id uuid;
  v_debtor_payable_account_id uuid;
  v_creditor_receivable_account_id uuid;
  v_current_graph_snapshot_hash text;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'accept_financial_request', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'accept_financial_request'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_request
  from public.financial_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'financial_request_not_found';
  end if;

  if v_request.responder_user_id <> p_actor_user_id then
    raise exception 'request_not_visible_to_actor';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'financial_request_not_pending';
  end if;

  insert into public.ledger_transactions (
    transaction_type,
    source_type,
    currency_code,
    origin_request_id,
    description,
    created_by_user_id
  )
  values (
    case v_request.request_type
      when 'debt' then 'debt_acceptance'
      when 'manual_settlement' then 'manual_settlement_acceptance'
      when 'reversal' then 'reversal_acceptance'
    end,
    'user',
    'COP',
    v_request.id,
    v_request.description,
    p_actor_user_id
  )
  returning id into v_transaction_id;

  if v_request.request_type = 'reversal' then
    if v_request.target_ledger_transaction_id is null then
      raise exception 'reversal_target_required';
    end if;

    insert into public.ledger_entries (
      ledger_transaction_id,
      ledger_account_id,
      entry_side,
      amount_minor,
      entry_order
    )
    select
      v_transaction_id,
      le.ledger_account_id,
      case when le.entry_side = 'debit' then 'credit' else 'debit' end,
      le.amount_minor,
      le.entry_order
    from public.ledger_entries le
    where le.ledger_transaction_id = v_request.target_ledger_transaction_id
    order by le.entry_order;

    update public.ledger_transactions
    set reverses_transaction_id = v_request.target_ledger_transaction_id
    where id = v_transaction_id;
  else
    select id
      into v_debtor_payable_account_id
    from public.ledger_accounts
    where owner_user_id = v_request.debtor_user_id
      and counterparty_user_id = v_request.creditor_user_id
      and account_kind = 'payable'
      and currency_code = 'COP';

    select id
      into v_creditor_receivable_account_id
    from public.ledger_accounts
    where owner_user_id = v_request.creditor_user_id
      and counterparty_user_id = v_request.debtor_user_id
      and account_kind = 'receivable'
      and currency_code = 'COP';

    if v_debtor_payable_account_id is null or v_creditor_receivable_account_id is null then
      raise exception 'ledger_accounts_not_initialized';
    end if;

    if v_request.request_type = 'debt' then
      insert into public.ledger_entries (
        ledger_transaction_id,
        ledger_account_id,
        entry_side,
        amount_minor,
        entry_order
      )
      values
        (v_transaction_id, v_creditor_receivable_account_id, 'debit', v_request.amount_minor, 1),
        (v_transaction_id, v_debtor_payable_account_id, 'credit', v_request.amount_minor, 2);
    else
      insert into public.ledger_entries (
        ledger_transaction_id,
        ledger_account_id,
        entry_side,
        amount_minor,
        entry_order
      )
      values
        (v_transaction_id, v_creditor_receivable_account_id, 'credit', v_request.amount_minor, 1),
        (v_transaction_id, v_debtor_payable_account_id, 'debit', v_request.amount_minor, 2);
    end if;
  end if;

  update public.financial_requests
  set status = 'accepted',
      resolved_at = timezone('utc', now())
  where id = v_request.id;

  perform public.refresh_pair_net_edge_for_pair(
    v_request.debtor_user_id,
    v_request.creditor_user_id,
    v_transaction_id
  );

  v_current_graph_snapshot_hash := public.compute_graph_snapshot_hash();
  perform public.mark_outdated_settlement_proposals_stale(v_current_graph_snapshot_hash);

  perform public.append_audit_event(
    p_actor_user_id,
    'ledger_transaction',
    v_transaction_id,
    'financial_request_accepted',
    v_request.id,
    jsonb_build_object('request_type', v_request.request_type, 'request_id', v_request.id)
  );

  v_response := jsonb_build_object(
    'requestId', v_request.id,
    'ledgerTransactionId', v_transaction_id,
    'status', 'accepted'
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

  v_current_hash := public.compute_graph_snapshot_hash();
  perform public.mark_outdated_settlement_proposals_stale(v_current_hash);

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

create or replace view public.v_relationship_history as
select
  fr.relationship_id,
  fr.id as item_id,
  'financial_request'::text as item_kind,
  fr.status::text as status,
  fr.request_type::text as subtype,
  fr.creator_user_id,
  fr.responder_user_id,
  fr.debtor_user_id,
  fr.creditor_user_id,
  fr.amount_minor,
  fr.description,
  fr.created_at as happened_at,
  'user'::text as source_type,
  fr.id as origin_request_id,
  null::uuid as origin_settlement_proposal_id
from public.financial_requests fr
union all
select
  relationship.id as relationship_id,
  tx_pair.ledger_transaction_id as item_id,
  'ledger_transaction'::text as item_kind,
  'posted'::text as status,
  tx_pair.transaction_type,
  tx_pair.created_by_user_id as creator_user_id,
  fr.responder_user_id,
  tx_pair.debtor_user_id,
  tx_pair.creditor_user_id,
  tx_pair.amount_minor,
  tx_pair.description,
  tx_pair.created_at as happened_at,
  tx_pair.source_type,
  tx_pair.origin_request_id,
  tx_pair.origin_settlement_proposal_id
from (
  select
    lt.id as ledger_transaction_id,
    lt.transaction_type::text as transaction_type,
    lt.source_type::text as source_type,
    lt.description,
    lt.created_by_user_id,
    lt.created_at,
    (min(la.owner_user_id::text) filter (where la.account_kind = 'payable'))::uuid as debtor_user_id,
    (min(la.owner_user_id::text) filter (where la.account_kind = 'receivable'))::uuid as creditor_user_id,
    max(le.amount_minor) as amount_minor,
    (min(least(la.owner_user_id, la.counterparty_user_id)::text))::uuid as user_low_id,
    (min(greatest(la.owner_user_id, la.counterparty_user_id)::text))::uuid as user_high_id,
    (min(lt.origin_request_id::text))::uuid as origin_request_id,
    (min(lt.origin_settlement_proposal_id::text))::uuid as origin_settlement_proposal_id
  from public.ledger_transactions lt
  join public.ledger_entries le on le.ledger_transaction_id = lt.id
  join public.ledger_accounts la on la.id = le.ledger_account_id
  group by lt.id, lt.transaction_type, lt.source_type, lt.description, lt.created_by_user_id, lt.created_at
) as tx_pair
join public.relationships relationship
  on relationship.user_low_id = tx_pair.user_low_id
 and relationship.user_high_id = tx_pair.user_high_id
left join public.financial_requests fr on fr.id = tx_pair.origin_request_id;
