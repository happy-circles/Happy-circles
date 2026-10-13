-- Bind user-facing financial commands to the semantic payload of their first
-- committed attempt. Existing ledger, request and proposal rows are untouched.
-- Legacy rows are upgraded lazily only when their original payload can be
-- reconstructed from the stored response and the command's durable result.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create function app_private.financial_command_hash(p_payload jsonb)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
$$;

create function app_private.financial_legacy_payload(
  p_actor_user_id uuid, p_operation_name text, p_response jsonb, p_receipt_created_at timestamptz
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_payload jsonb;
begin
  if p_operation_name = 'create_balance_request' then
    select jsonb_build_object(
      'requestType', request.request_type, 'responderUserId', request.responder_user_id,
      'debtorUserId', request.debtor_user_id, 'creditorUserId', request.creditor_user_id,
      'amountMinor', request.amount_minor, 'description', request.description,
      'parentRequestId', request.parent_request_id,
      'targetLedgerTransactionId', request.target_ledger_transaction_id, 'category', request.category
    ) into v_payload
    from public.financial_requests request
    where request.id::text = p_response ->> 'requestId'
      and request.creator_user_id = p_actor_user_id;
  elsif p_operation_name in ('accept_financial_request', 'reject_financial_request') then
    select jsonb_build_object('requestId', request.id) into v_payload
    from public.financial_requests request
    where request.id::text = p_response ->> 'requestId'
      and request.responder_user_id = p_actor_user_id
      and p_response ->> 'status' = case p_operation_name
        when 'accept_financial_request' then 'accepted' else 'rejected' end;
  elsif p_operation_name = 'amend_financial_request' then
    select jsonb_build_object(
      'requestId', original.id, 'amountMinor', amended.amount_minor,
      'description', amended.description, 'category', amended.category
    ) into v_payload
    from public.financial_requests original
    join public.financial_requests amended on amended.parent_request_id = original.id
    where original.id::text = p_response ->> 'originalRequestId'
      and amended.id::text = p_response ->> 'amendedRequestId'
      and original.responder_user_id = p_actor_user_id
      and amended.creator_user_id = p_actor_user_id;
  elsif p_operation_name = 'decide_cycle_settlement' then
    -- A stale result produced before recording the participant's choice has no
    -- evidence of that choice. Never infer it from the new caller's payload.
    select jsonb_build_object('proposalId', participant.settlement_proposal_id,
      'decision', participant.decision) into v_payload
    from public.settlement_proposal_participants participant
    where participant.settlement_proposal_id::text = p_response ->> 'proposalId'
      and participant.participant_user_id = p_actor_user_id
      and participant.decision in ('approved', 'rejected')
      and participant.decision_source = 'manual'
      and exists (
        select 1 from public.audit_events event
        where event.actor_user_id = p_actor_user_id and event.entity_type = 'settlement_proposal'
          and event.entity_id = participant.settlement_proposal_id
          -- Both records used the same transaction timestamp in the legacy
          -- command. A later decision cannot explain an earlier stale receipt.
          and event.created_at = p_receipt_created_at
          and event.event_name = case participant.decision
            when 'approved' then 'settlement_approved' else 'settlement_rejected' end
      )
      and not exists (
        select 1 from public.audit_events event
        where event.actor_user_id = p_actor_user_id and event.entity_type = 'settlement_proposal'
          and event.entity_id = participant.settlement_proposal_id
          and event.event_name = case participant.decision
            when 'approved' then 'settlement_rejected' else 'settlement_approved' end
      );
  elsif p_operation_name = 'execute_cycle_settlement' then
    select jsonb_build_object('proposalId', participant.settlement_proposal_id) into v_payload
    from public.settlement_proposal_participants participant
    where participant.settlement_proposal_id::text = p_response ->> 'proposalId'
      and participant.participant_user_id = p_actor_user_id;
  end if;
  return v_payload;
end;
$$;

create function app_private.assert_financial_idempotency(
  p_idempotency public.idempotency_keys, p_payload jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := app_private.financial_command_hash(p_payload);
  v_legacy_payload jsonb;
begin
  -- Callers hold the existing actor/operation/key row lock. Fresh inserts
  -- already contain their hash, so NULL here always identifies legacy state.
  if p_idempotency.request_hash is not null then
    if p_idempotency.request_hash is distinct from v_hash then
      raise exception 'idempotency_key_reused';
    end if;
    return;
  end if;
  if p_idempotency.response_json is null then
    raise exception 'idempotency_legacy_unverifiable';
  end if;
  v_legacy_payload := app_private.financial_legacy_payload(
    p_idempotency.actor_user_id, p_idempotency.operation_name,
    p_idempotency.response_json, p_idempotency.created_at
  );
  if v_legacy_payload is null then
    raise exception 'idempotency_legacy_unverifiable';
  end if;
  if app_private.financial_command_hash(v_legacy_payload) is distinct from v_hash then
    raise exception 'idempotency_key_reused';
  end if;
  update public.idempotency_keys set request_hash = v_hash
    where id = p_idempotency.id and request_hash is null;
end;
$$;

revoke all on function app_private.financial_command_hash(jsonb),
  app_private.financial_legacy_payload(uuid, text, jsonb, timestamptz),
  app_private.assert_financial_idempotency(public.idempotency_keys, jsonb)
  from public, anon, authenticated, service_role;


-- Preserve the existing command, request/graph lock order, and retired-reversal guards.
CREATE OR REPLACE FUNCTION public.create_balance_request(p_actor_user_id uuid, p_idempotency_key text, p_request_type request_type, p_responder_user_id uuid, p_debtor_user_id uuid, p_creditor_user_id uuid, p_amount_minor bigint, p_description text, p_parent_request_id uuid DEFAULT NULL::uuid, p_target_ledger_transaction_id uuid DEFAULT NULL::uuid, p_category transaction_category DEFAULT 'other'::transaction_category)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_command_payload jsonb;
  v_relationship public.relationships%rowtype;
  v_request_id uuid;
  v_response jsonb;
begin
  if p_request_type = 'transaction_reversal'::public.request_type then
    raise exception 'transaction_reversal_disabled';
  end if;

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

  v_command_payload := jsonb_build_object(
    'requestType', p_request_type, 'responderUserId', p_responder_user_id,
    'debtorUserId', p_debtor_user_id, 'creditorUserId', p_creditor_user_id,
    'amountMinor', p_amount_minor, 'description', p_description,
    'parentRequestId', p_parent_request_id,
    'targetLedgerTransactionId', p_target_ledger_transaction_id, 'category', p_category
  );

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key, request_hash)
  values (p_actor_user_id, 'create_balance_request', p_idempotency_key,
    app_private.financial_command_hash(v_command_payload))
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_balance_request'
    and idempotency_key = p_idempotency_key
  for update;

  perform app_private.assert_financial_idempotency(v_idempotency, v_command_payload);

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
$function$;

-- Preserve the existing command, request/graph lock order, and retired-reversal guards.
CREATE OR REPLACE FUNCTION public.accept_financial_request(p_actor_user_id uuid, p_idempotency_key text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_command_payload jsonb;
  v_request public.financial_requests%rowtype;
  v_transaction_id uuid;
  v_debtor_payable_account_id uuid;
  v_creditor_receivable_account_id uuid;
  v_auto_cycle_job jsonb;
  v_response jsonb;
begin
  -- Reject retired commands before an idempotent response can be replayed.
  if exists (
    select 1 from public.financial_requests request
    where request.id = p_request_id
      and request.request_type = 'transaction_reversal'::public.request_type
  ) then
    raise exception 'transaction_reversal_disabled';
  end if;

  v_command_payload := jsonb_build_object('requestId', p_request_id);

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key, request_hash)
  values (p_actor_user_id, 'accept_financial_request', p_idempotency_key,
    app_private.financial_command_hash(v_command_payload))
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'accept_financial_request'
    and idempotency_key = p_idempotency_key
  for update;

  perform app_private.assert_financial_idempotency(v_idempotency, v_command_payload);

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

  -- Recheck the locked row without changing the existing lock order.
  if v_request.request_type = 'transaction_reversal'::public.request_type then
    raise exception 'transaction_reversal_disabled';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'financial_request_not_pending';
  end if;
  perform app_private.lock_current_financial_request(p_request_id,null);

  perform public.lock_graph_pair(v_request.debtor_user_id, v_request.creditor_user_id, 'COP');

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

  perform public.mark_touched_settlement_proposals_stale(
    array[v_request.debtor_user_id, v_request.creditor_user_id]
  );

  v_auto_cycle_job := public.enqueue_graph_cycle_job(
    'financial_request_accepted',
    v_request.id,
    p_actor_user_id,
    p_actor_user_id,
    v_request.debtor_user_id,
    v_request.creditor_user_id,
    'COP'
  );

  perform public.append_audit_event(
    p_actor_user_id,
    'ledger_transaction',
    v_transaction_id,
    'financial_request_accepted',
    v_request.id,
    jsonb_build_object(
      'request_kind', v_request.request_type,
      'request_id', v_request.id,
      'category', v_request.category,
      'auto_cycle_job', v_auto_cycle_job
    )
  );

  v_response := jsonb_build_object(
    'requestId', v_request.id,
    'ledgerTransactionId', v_transaction_id,
    'status', 'accepted',
    'autoCycleJob', v_auto_cycle_job
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$function$;

-- Preserve the existing command, request/graph lock order, and retired-reversal guards.
CREATE OR REPLACE FUNCTION public.reject_financial_request(p_actor_user_id uuid, p_idempotency_key text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_command_payload jsonb;
  v_request public.financial_requests%rowtype;
  v_response jsonb;
begin
  v_command_payload := jsonb_build_object('requestId', p_request_id);

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key, request_hash)
  values (p_actor_user_id, 'reject_financial_request', p_idempotency_key,
    app_private.financial_command_hash(v_command_payload))
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'reject_financial_request'
    and idempotency_key = p_idempotency_key
  for update;

  perform app_private.assert_financial_idempotency(v_idempotency, v_command_payload);

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
  perform app_private.lock_current_financial_request(p_request_id,null);

  update public.financial_requests
  set status = 'rejected',
      resolved_at = timezone('utc', now())
  where id = v_request.id;

  perform public.append_audit_event(
    p_actor_user_id,
    'financial_request',
    v_request.id,
    'financial_request_rejected',
    v_request.id,
    jsonb_build_object('request_kind', v_request.request_type)
  );

  v_response := jsonb_build_object(
    'requestId', v_request.id,
    'status', 'rejected'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$function$;

-- Preserve the existing command, request/graph lock order, and retired-reversal guards.
CREATE OR REPLACE FUNCTION public.amend_financial_request(p_actor_user_id uuid, p_idempotency_key text, p_request_id uuid, p_amount_minor bigint, p_description text, p_category transaction_category DEFAULT NULL::transaction_category)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_command_payload jsonb;
  v_request public.financial_requests%rowtype;
  v_amended_request_id uuid;
  v_response jsonb;
  v_category public.transaction_category;
begin
  -- Reject retired commands before an idempotent response can be replayed.
  if exists (
    select 1 from public.financial_requests request
    where request.id = p_request_id
      and request.request_type = 'transaction_reversal'::public.request_type
  ) then
    raise exception 'transaction_reversal_disabled';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  v_command_payload := jsonb_build_object(
    'requestId', p_request_id, 'amountMinor', p_amount_minor, 'description', p_description,
    'category', coalesce(p_category, (select request.category from public.financial_requests request
      where request.id = p_request_id), 'other'::public.transaction_category)
  );

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key, request_hash)
  values (p_actor_user_id, 'amend_financial_request', p_idempotency_key,
    app_private.financial_command_hash(v_command_payload))
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'amend_financial_request'
    and idempotency_key = p_idempotency_key
  for update;

  perform app_private.assert_financial_idempotency(v_idempotency, v_command_payload);

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

  -- Recheck the locked row without changing the existing lock order.
  if v_request.request_type = 'transaction_reversal'::public.request_type then
    raise exception 'transaction_reversal_disabled';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'financial_request_not_pending';
  end if;
  perform app_private.lock_current_financial_request(p_request_id,null);

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
$function$;

-- Preserve the existing command, request/graph lock order, and retired-reversal guards.
CREATE OR REPLACE FUNCTION public.decide_cycle_settlement(p_actor_user_id uuid, p_idempotency_key text, p_proposal_id uuid, p_decision settlement_participant_decision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_command_payload jsonb;
  v_proposal public.settlement_proposals%rowtype;
  v_participant public.settlement_proposal_participants%rowtype;
  v_response jsonb;
  v_all_approved boolean;
  v_current_hash text;
  v_recovery_job jsonb;
  v_approvals_pending integer;
  v_has_reservation_rows boolean := false;
  v_capacity_valid boolean := false;
  v_residual_jobs jsonb := '[]'::jsonb;
begin
  v_command_payload := jsonb_build_object('proposalId', p_proposal_id, 'decision', p_decision);

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key, request_hash)
  values (p_actor_user_id, 'decide_cycle_settlement', p_idempotency_key,
    app_private.financial_command_hash(v_command_payload))
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'decide_cycle_settlement'
    and idempotency_key = p_idempotency_key
  for update;

  perform app_private.assert_financial_idempotency(v_idempotency, v_command_payload);

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_settlement_decision';
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

  select *
    into v_participant
  from public.settlement_proposal_participants
  where settlement_proposal_id = p_proposal_id
    and participant_user_id = p_actor_user_id
  for update;

  if not found then
    raise exception 'settlement_participant_not_found';
  end if;

  if v_participant.decision <> 'pending' then
    raise exception 'settlement_participant_already_decided';
  end if;

  select exists (
    select 1
    from public.settlement_edge_reservations reservation
    where reservation.settlement_proposal_id = p_proposal_id
  )
    into v_has_reservation_rows;

  if v_has_reservation_rows then
    v_capacity_valid := public.validate_cycle_reservation_capacity_for_execution(p_proposal_id);

    if not v_capacity_valid then
      perform public.mark_happy_circle_proposal_stale(
        p_actor_user_id,
        p_proposal_id,
        'reserved_capacity_lost'::public.settlement_stale_reason
      );

      if v_proposal.anchor_user_low_id is not null and v_proposal.anchor_user_high_id is not null then
        v_recovery_job := public.enqueue_graph_cycle_job(
          'stale_settlement_proposal',
          p_proposal_id,
          p_actor_user_id,
          p_actor_user_id,
          v_proposal.anchor_user_low_id,
          v_proposal.anchor_user_high_id,
          v_proposal.currency_code
        );
      end if;

      v_response := jsonb_build_object(
        'proposalId', p_proposal_id,
        'status', 'stale',
        'staleReason', 'reserved_capacity_lost',
        'autoCycleJob', v_recovery_job
      );

      update public.idempotency_keys
      set response_json = v_response
      where id = v_idempotency.id;

      return v_response;
    end if;
  else
    if v_proposal.anchor_user_low_id is not null and v_proposal.anchor_user_high_id is not null then
      v_current_hash := public.compute_graph_component_snapshot_hash(
        v_proposal.anchor_user_low_id,
        v_proposal.anchor_user_high_id,
        v_proposal.currency_code
      );
    else
      v_current_hash := public.compute_graph_snapshot_hash();
    end if;

    if v_current_hash is null or v_current_hash <> v_proposal.graph_snapshot_hash then
      perform public.mark_happy_circle_proposal_stale(
        p_actor_user_id,
        p_proposal_id,
        'balance_changed'::public.settlement_stale_reason
      );

      if v_proposal.anchor_user_low_id is not null and v_proposal.anchor_user_high_id is not null then
        v_recovery_job := public.enqueue_graph_cycle_job(
          'stale_settlement_proposal',
          p_proposal_id,
          p_actor_user_id,
          p_actor_user_id,
          v_proposal.anchor_user_low_id,
          v_proposal.anchor_user_high_id,
          v_proposal.currency_code
        );
      end if;

      v_response := jsonb_build_object(
        'proposalId', p_proposal_id,
        'status', 'stale',
        'staleReason', 'balance_changed',
        'autoCycleJob', v_recovery_job
      );

      update public.idempotency_keys
      set response_json = v_response
      where id = v_idempotency.id;

      return v_response;
    end if;
  end if;

  update public.settlement_proposal_participants
  set decision = p_decision,
      decision_source = 'manual',
      decided_at = timezone('utc', now())
  where id = v_participant.id;

  if p_decision = 'rejected' then
    update public.settlement_proposals
    set status = 'rejected',
        updated_at = timezone('utc', now())
    where id = p_proposal_id;

    if v_proposal.happy_circle_case_id is not null then
      update public.happy_circle_cases
      set status = 'closed',
          current_proposal_id = p_proposal_id,
          updated_at = timezone('utc', now())
      where id = v_proposal.happy_circle_case_id
        and current_proposal_id = p_proposal_id;
    end if;

    v_residual_jobs := public.enqueue_graph_cycle_jobs_for_proposal_reservations(
      'settlement_reservation_released',
      p_proposal_id,
      p_actor_user_id,
      p_actor_user_id,
      p_proposal_id
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'settlement_proposal',
      p_proposal_id,
      'settlement_rejected',
      null,
      jsonb_build_object('residual_auto_cycle_jobs', v_residual_jobs)
    );

    v_response := jsonb_build_object(
      'proposalId', p_proposal_id,
      'status', 'rejected',
      'happyCircleCaseId', v_proposal.happy_circle_case_id,
      'versionNumber', v_proposal.version_number,
      'residualAutoCycleJobs', v_residual_jobs
    );
  else
    select not exists (
      select 1
      from public.settlement_proposal_participants
      where settlement_proposal_id = p_proposal_id
        and decision <> 'approved'
    )
    into v_all_approved;

    perform public.append_audit_event(
      p_actor_user_id,
      'settlement_proposal',
      p_proposal_id,
      'settlement_approved',
      null,
      jsonb_build_object('fully_approved', coalesce(v_all_approved, false))
    );

    if v_all_approved then
      if v_proposal.happy_circle_case_id is not null then
        perform public.append_audit_event(
          p_actor_user_id,
          'happy_circle_case',
          v_proposal.happy_circle_case_id,
          'happy_circle_case.version_approved',
          null,
          jsonb_build_object(
            'proposal_id', p_proposal_id,
            'version_number', v_proposal.version_number
          )
        );
      end if;

      update public.settlement_proposals
      set status = 'approved',
          updated_at = timezone('utc', now())
      where id = p_proposal_id;

      v_response := public.apply_cycle_settlement_execution(p_actor_user_id, p_proposal_id);
    else
      select count(*)
        into v_approvals_pending
      from public.settlement_proposal_participants
      where settlement_proposal_id = p_proposal_id
        and decision = 'pending';

      v_response := jsonb_build_object(
        'proposalId', p_proposal_id,
        'status', 'pending_approvals',
        'happyCircleCaseId', v_proposal.happy_circle_case_id,
        'versionNumber', v_proposal.version_number,
        'approvalsPending', v_approvals_pending
      );
    end if;
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$function$;

-- Preserve the existing command, request/graph lock order, and retired-reversal guards.
CREATE OR REPLACE FUNCTION public.execute_cycle_settlement(p_actor_user_id uuid, p_idempotency_key text, p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_command_payload jsonb;
  v_proposal public.settlement_proposals%rowtype;
  v_execution_id uuid;
  v_response jsonb;
begin
  v_command_payload := jsonb_build_object('proposalId', p_proposal_id);

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key, request_hash)
  values (p_actor_user_id, 'execute_cycle_settlement', p_idempotency_key,
    app_private.financial_command_hash(v_command_payload))
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'execute_cycle_settlement'
    and idempotency_key = p_idempotency_key
  for update;

  perform app_private.assert_financial_idempotency(v_idempotency, v_command_payload);

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

  if not exists (
    select 1
    from public.settlement_proposal_participants
    where settlement_proposal_id = p_proposal_id
      and participant_user_id = p_actor_user_id
  ) then
    raise exception 'actor_not_participant';
  end if;

  if v_proposal.status = 'executed' then
    select id
      into v_execution_id
    from public.settlement_executions
    where settlement_proposal_id = p_proposal_id;

    if v_execution_id is null then
      raise exception 'settlement_execution_not_found';
    end if;

    v_response := jsonb_build_object(
      'proposalId', p_proposal_id,
      'executionId', v_execution_id,
      'status', 'executed',
      'nextAutoCycleJobs', '[]'::jsonb,
      'nextAutoCycleJob', null
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
  end if;

  if v_proposal.status = 'pending_approvals'
    and not exists (
      select 1
      from public.settlement_proposal_participants
      where settlement_proposal_id = p_proposal_id
        and decision <> 'approved'
    ) then
    update public.settlement_proposals
    set status = 'approved',
        updated_at = timezone('utc', now())
    where id = p_proposal_id;
  end if;

  v_response := public.apply_cycle_settlement_execution(p_actor_user_id, p_proposal_id);

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$function$;
