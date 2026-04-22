do $$
begin
  create type public.transaction_category as enum (
    'food_drinks',
    'transport',
    'entertainment',
    'services',
    'home',
    'other',
    'cycle'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.financial_requests
  add column if not exists category public.transaction_category not null default 'other';

alter table public.ledger_transactions
  add column if not exists category public.transaction_category not null default 'other';

update public.ledger_transactions
set category = 'cycle'
where transaction_type = 'cycle_settlement';

drop function if exists public.create_balance_request(
  uuid,
  text,
  public.request_type,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  uuid,
  uuid
);

create or replace function public.create_balance_request(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_type public.request_type,
  p_responder_user_id uuid,
  p_debtor_user_id uuid,
  p_creditor_user_id uuid,
  p_amount_minor bigint,
  p_description text,
  p_parent_request_id uuid default null,
  p_target_ledger_transaction_id uuid default null,
  p_category public.transaction_category default 'other'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_relationship public.relationships%rowtype;
  v_request_id uuid;
  v_response jsonb;
begin
  if p_amount_minor <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  if p_category = 'cycle' then
    raise exception 'cycle_category_reserved';
  end if;

  if least(p_actor_user_id, p_responder_user_id) <> least(p_debtor_user_id, p_creditor_user_id)
    or greatest(p_actor_user_id, p_responder_user_id) <> greatest(p_debtor_user_id, p_creditor_user_id) then
    raise exception 'request_participants_must_match_relationship_pair';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_balance_request', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_balance_request'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_relationship
  from public.relationships
  where user_low_id = least(p_actor_user_id, p_responder_user_id)
    and user_high_id = greatest(p_actor_user_id, p_responder_user_id)
    and status = 'active';

  if not found then
    raise exception 'active_relationship_required';
  end if;

  insert into public.financial_requests (
    relationship_id,
    request_type,
    status,
    creator_user_id,
    responder_user_id,
    debtor_user_id,
    creditor_user_id,
    amount_minor,
    currency_code,
    description,
    category,
    parent_request_id,
    target_ledger_transaction_id
  )
  values (
    v_relationship.id,
    p_request_type,
    'pending',
    p_actor_user_id,
    p_responder_user_id,
    p_debtor_user_id,
    p_creditor_user_id,
    p_amount_minor,
    'COP',
    p_description,
    p_category,
    p_parent_request_id,
    p_target_ledger_transaction_id
  )
  returning id into v_request_id;

  perform public.append_audit_event(
    p_actor_user_id,
    'financial_request',
    v_request_id,
    'financial_request_created',
    v_request_id,
    jsonb_build_object(
      'request_kind', p_request_type,
      'amount_minor', p_amount_minor,
      'responder_user_id', p_responder_user_id,
      'category', p_category
    )
  );

  v_response := jsonb_build_object(
    'requestId', v_request_id,
    'status', 'pending'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

drop function if exists public.amend_financial_request(
  uuid,
  text,
  uuid,
  bigint,
  text
);

create or replace function public.amend_financial_request(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_id uuid,
  p_amount_minor bigint,
  p_description text,
  p_category public.transaction_category default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_request public.financial_requests%rowtype;
  v_amended_request_id uuid;
  v_response jsonb;
  v_category public.transaction_category;
begin
  if p_amount_minor <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'amend_financial_request', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'amend_financial_request'
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

  v_category := coalesce(p_category, v_request.category, 'other'::public.transaction_category);
  if v_category = 'cycle' then
    raise exception 'cycle_category_reserved';
  end if;

  update public.financial_requests
  set status = 'amended',
      resolved_at = timezone('utc', now())
  where id = v_request.id;

  insert into public.financial_requests (
    relationship_id,
    request_type,
    status,
    creator_user_id,
    responder_user_id,
    debtor_user_id,
    creditor_user_id,
    amount_minor,
    currency_code,
    description,
    category,
    parent_request_id,
    target_ledger_transaction_id
  )
  values (
    v_request.relationship_id,
    v_request.request_type,
    'pending',
    p_actor_user_id,
    v_request.creator_user_id,
    v_request.debtor_user_id,
    v_request.creditor_user_id,
    p_amount_minor,
    'COP',
    p_description,
    v_category,
    v_request.id,
    v_request.target_ledger_transaction_id
  )
  returning id into v_amended_request_id;

  perform public.append_audit_event(
    p_actor_user_id,
    'financial_request',
    v_request.id,
    'financial_request_amended',
    v_amended_request_id,
    jsonb_build_object(
      'amended_request_id', v_amended_request_id,
      'amount_minor', p_amount_minor,
      'category', v_category
    )
  );

  v_response := jsonb_build_object(
    'originalRequestId', v_request.id,
    'amendedRequestId', v_amended_request_id,
    'status', 'pending'
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
    category,
    created_by_user_id
  )
  values (
    case v_request.request_type
      when 'balance_increase'::public.request_type then 'balance_increase_acceptance'::public.ledger_transaction_type
      when 'transaction_reversal'::public.request_type then 'transaction_reversal_acceptance'::public.ledger_transaction_type
    end,
    'user'::public.ledger_source_type,
    'COP',
    v_request.id,
    v_request.description,
    v_request.category,
    p_actor_user_id
  )
  returning id into v_transaction_id;

  if v_request.request_type = 'transaction_reversal' then
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
      case
        when le.entry_side = 'debit' then 'credit'::public.ledger_entry_side
        else 'debit'::public.ledger_entry_side
      end,
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
        'debit'::public.ledger_entry_side,
        v_request.amount_minor,
        1
      ),
      (
        v_transaction_id,
        v_debtor_payable_account_id,
        'credit'::public.ledger_entry_side,
        v_request.amount_minor,
        2
      );
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
    jsonb_build_object(
      'request_kind', v_request.request_type,
      'request_id', v_request.id,
      'category', v_request.category
    )
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
      category,
      created_by_user_id
    )
    values (
      'cycle_settlement'::public.ledger_transaction_type,
      'system'::public.ledger_source_type,
      'COP',
      p_proposal_id,
      'Cycle settlement system movement',
      'cycle',
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
        'debit'::public.ledger_entry_side,
        (v_movement ->> 'amount_minor')::bigint,
        1
      ),
      (
        v_transaction_id,
        v_debtor_payable_account_id,
        'credit'::public.ledger_entry_side,
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
    jsonb_build_object('proposal_id', p_proposal_id, 'category', 'cycle')
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

drop view if exists public.v_relationship_history;

create or replace view public.v_relationship_history as
select
  fr.relationship_id,
  fr.id as item_id,
  'financial_request'::text as item_kind,
  fr.status::text as status,
  fr.request_type::text as subtype,
  'user'::text as source_type,
  fr.creator_user_id,
  fr.responder_user_id,
  fr.debtor_user_id,
  fr.creditor_user_id,
  fr.amount_minor,
  fr.description,
  fr.category::text as category,
  fr.id as origin_request_id,
  null::uuid as origin_settlement_proposal_id,
  fr.created_at as happened_at
from public.financial_requests fr
union all
select
  relationship.id as relationship_id,
  tx_pair.ledger_transaction_id as item_id,
  'ledger_transaction'::text as item_kind,
  'posted'::text as status,
  tx_pair.transaction_type,
  tx_pair.source_type,
  tx_pair.created_by_user_id as creator_user_id,
  fr.responder_user_id,
  tx_pair.debtor_user_id,
  tx_pair.creditor_user_id,
  tx_pair.amount_minor,
  tx_pair.description,
  tx_pair.category::text as category,
  tx_pair.origin_request_id,
  tx_pair.origin_settlement_proposal_id,
  tx_pair.created_at as happened_at
from (
  select
    lt.id as ledger_transaction_id,
    lt.transaction_type::text as transaction_type,
    lt.source_type::text as source_type,
    lt.description,
    lt.category,
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
  group by lt.id, lt.transaction_type, lt.source_type, lt.description, lt.category, lt.created_by_user_id, lt.created_at
) as tx_pair
join public.relationships relationship
  on relationship.user_low_id = tx_pair.user_low_id
 and relationship.user_high_id = tx_pair.user_high_id
left join public.financial_requests fr on fr.id = tx_pair.origin_request_id;

grant select on public.v_relationship_history to authenticated;
alter view public.v_relationship_history set (security_invoker = true);
