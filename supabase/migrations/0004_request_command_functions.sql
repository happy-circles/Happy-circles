create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_relationship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invitee_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_existing_relationship_id uuid;
  v_invite_id uuid;
  v_response jsonb;
begin
  if p_actor_user_id = p_invitee_user_id then
    raise exception 'cannot_invite_self';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_relationship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_relationship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(p_actor_user_id, p_invitee_user_id)
    and user_high_id = greatest(p_actor_user_id, p_invitee_user_id)
    and status = 'active';

  if v_existing_relationship_id is not null then
    raise exception 'relationship_already_exists';
  end if;

  insert into public.relationship_invites (inviter_user_id, invitee_user_id, status)
  values (p_actor_user_id, p_invitee_user_id, 'pending')
  returning id into v_invite_id;

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship_invite',
    v_invite_id,
    'relationship_invited',
    null,
    jsonb_build_object('invitee_user_id', p_invitee_user_id)
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite_id,
    'status', 'pending'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.accept_relationship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.relationship_invites%rowtype;
  v_relationship_id uuid;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'accept_relationship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'accept_relationship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.relationship_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'relationship_invite_not_found';
  end if;

  if v_invite.invitee_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  insert into public.relationships (user_low_id, user_high_id, status)
  values (
    least(v_invite.inviter_user_id, v_invite.invitee_user_id),
    greatest(v_invite.inviter_user_id, v_invite.invitee_user_id),
    'active'
  )
  on conflict (user_low_id, user_high_id)
  do update set status = 'active'
  returning id into v_relationship_id;

  update public.relationship_invites
  set status = 'accepted'
  where id = v_invite.id;

  perform public.ensure_relationship_accounts(v_relationship_id);

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship',
    v_relationship_id,
    'relationship_accepted',
    null,
    jsonb_build_object('invite_id', v_invite.id)
  );

  v_response := jsonb_build_object(
    'relationshipId', v_relationship_id,
    'status', 'active'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.create_financial_request(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_type public.request_type,
  p_responder_user_id uuid,
  p_debtor_user_id uuid,
  p_creditor_user_id uuid,
  p_amount_minor bigint,
  p_description text,
  p_parent_request_id uuid default null,
  p_target_ledger_transaction_id uuid default null
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

  if least(p_actor_user_id, p_responder_user_id) <> least(p_debtor_user_id, p_creditor_user_id)
    or greatest(p_actor_user_id, p_responder_user_id) <> greatest(p_debtor_user_id, p_creditor_user_id) then
    raise exception 'request_participants_must_match_relationship_pair';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_financial_request', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_financial_request'
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
      'request_type', p_request_type,
      'amount_minor', p_amount_minor,
      'responder_user_id', p_responder_user_id
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

create or replace function public.reject_financial_request(
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
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'reject_financial_request', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'reject_financial_request'
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
    jsonb_build_object('request_type', v_request.request_type)
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
$$;

create or replace function public.counteroffer_financial_request(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_request_id uuid,
  p_amount_minor bigint,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_request public.financial_requests%rowtype;
  v_counter_request_id uuid;
  v_response jsonb;
begin
  if p_amount_minor <= 0 then
    raise exception 'amount_must_be_positive';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'counteroffer_financial_request', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'counteroffer_financial_request'
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

  update public.financial_requests
  set status = 'countered',
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
    v_request.id,
    v_request.target_ledger_transaction_id
  )
  returning id into v_counter_request_id;

  perform public.append_audit_event(
    p_actor_user_id,
    'financial_request',
    v_request.id,
    'financial_request_countered',
    v_counter_request_id,
    jsonb_build_object('counter_request_id', v_counter_request_id, 'amount_minor', p_amount_minor)
  );

  v_response := jsonb_build_object(
    'originalRequestId', v_request.id,
    'counterRequestId', v_counter_request_id,
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
