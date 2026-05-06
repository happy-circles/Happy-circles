drop function if exists public.complete_graph_cycle_job(uuid, jsonb);
drop function if exists public.fail_graph_cycle_job(uuid, text);

create or replace function public.requeue_stale_graph_cycle_jobs(
  p_timeout_seconds integer default 300,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timeout_seconds integer := coalesce(p_timeout_seconds, 300);
  v_limit integer := coalesce(p_limit, 50);
  v_requeued_count integer := 0;
  v_failed_count integer := 0;
begin
  if v_timeout_seconds < 0 then
    raise exception 'invalid_graph_cycle_job_timeout';
  end if;

  if v_limit <= 0 or v_limit > 500 then
    raise exception 'invalid_graph_cycle_job_requeue_limit';
  end if;

  with stale_jobs as (
    select id
    from public.graph_cycle_jobs
    where status = 'processing'
      and locked_at is not null
      and locked_at <= timezone('utc', now()) - make_interval(secs => v_timeout_seconds)
      and attempts < max_attempts
    order by locked_at, created_at
    limit v_limit
    for update skip locked
  ),
  requeued as (
    update public.graph_cycle_jobs job
    set status = 'pending',
        locked_at = null,
        locked_by = null,
        last_error = 'worker_timeout_requeued',
        updated_at = timezone('utc', now())
    from stale_jobs
    where job.id = stale_jobs.id
    returning job.id
  )
  select count(*) into v_requeued_count
  from requeued;

  with exhausted_jobs as (
    select id
    from public.graph_cycle_jobs
    where status = 'processing'
      and locked_at is not null
      and locked_at <= timezone('utc', now()) - make_interval(secs => v_timeout_seconds)
      and attempts >= max_attempts
    order by locked_at, created_at
    limit v_limit
    for update skip locked
  ),
  failed as (
    update public.graph_cycle_jobs job
    set status = 'failed',
        locked_at = null,
        locked_by = null,
        last_error = 'worker_timeout_max_attempts_exceeded',
        processed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    from exhausted_jobs
    where job.id = exhausted_jobs.id
    returning job.id
  )
  select count(*) into v_failed_count
  from failed;

  return jsonb_build_object(
    'status', 'ok',
    'requeuedCount', v_requeued_count,
    'failedCount', v_failed_count
  );
end;
$$;

create or replace function public.claim_graph_cycle_job(
  p_worker_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.graph_cycle_jobs%rowtype;
begin
  perform public.requeue_stale_graph_cycle_jobs(300, 50);

  select *
    into v_job
  from public.graph_cycle_jobs
  where status = 'pending'
  order by created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.graph_cycle_jobs
  set status = 'processing',
      attempts = attempts + 1,
      locked_at = timezone('utc', now()),
      locked_by = coalesce(nullif(p_worker_id, ''), 'graph-cycle-worker'),
      last_error = null,
      updated_at = timezone('utc', now())
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'id', v_job.id,
    'sourceType', v_job.source_type,
    'sourceId', v_job.source_id,
    'actorUserId', v_job.actor_user_id,
    'anchorUserId', v_job.anchor_user_id,
    'userLowId', v_job.user_low_id,
    'userHighId', v_job.user_high_id,
    'currencyCode', v_job.currency_code,
    'attempts', v_job.attempts
  );
end;
$$;

create or replace function public.complete_graph_cycle_job(
  p_job_id uuid,
  p_worker_id text,
  p_result_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.graph_cycle_jobs%rowtype;
  v_worker_id text := coalesce(nullif(p_worker_id, ''), 'graph-cycle-worker');
begin
  update public.graph_cycle_jobs
  set status = 'completed',
      result_json = p_result_json,
      processed_at = timezone('utc', now()),
      locked_at = null,
      locked_by = null,
      last_error = null,
      updated_at = timezone('utc', now())
  where id = p_job_id
    and status = 'processing'
    and locked_by = v_worker_id
  returning * into v_job;

  if not found then
    if exists (select 1 from public.graph_cycle_jobs where id = p_job_id) then
      raise exception 'graph_cycle_job_not_owned_by_worker';
    end if;

    raise exception 'graph_cycle_job_not_found';
  end if;

  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'result', v_job.result_json
  );
end;
$$;

create or replace function public.fail_graph_cycle_job(
  p_job_id uuid,
  p_worker_id text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.graph_cycle_jobs%rowtype;
  v_worker_id text := coalesce(nullif(p_worker_id, ''), 'graph-cycle-worker');
begin
  update public.graph_cycle_jobs
  set status = case
        when attempts >= max_attempts then 'failed'::public.graph_cycle_job_status
        else 'pending'::public.graph_cycle_job_status
      end,
      last_error = left(coalesce(p_error, 'unknown_error'), 1000),
      locked_at = null,
      locked_by = null,
      processed_at = case
        when attempts >= max_attempts then timezone('utc', now())
        else processed_at
      end,
      updated_at = timezone('utc', now())
  where id = p_job_id
    and status = 'processing'
    and locked_by = v_worker_id
  returning * into v_job;

  if not found then
    if exists (select 1 from public.graph_cycle_jobs where id = p_job_id) then
      raise exception 'graph_cycle_job_not_owned_by_worker';
    end if;

    raise exception 'graph_cycle_job_not_found';
  end if;

  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'attempts', v_job.attempts
  );
end;
$$;

create or replace function public.validate_cycle_settlement_payload(
  p_graph_snapshot jsonb,
  p_movements_json jsonb,
  p_participant_user_ids uuid[],
  p_anchor_user_low_id uuid default null,
  p_anchor_user_high_id uuid default null,
  p_currency_code text default 'COP'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency_code text := coalesce(nullif(p_currency_code, ''), 'COP');
  v_expected_participants uuid[];
  v_derived_participants uuid[];
  v_debtors uuid[] := '{}'::uuid[];
  v_creditors uuid[] := '{}'::uuid[];
  v_distinct_debtors uuid[];
  v_distinct_creditors uuid[];
  v_movement record;
  v_debtor_user_id uuid;
  v_creditor_user_id uuid;
  v_amount_minor bigint;
  v_cycle_amount_minor bigint;
  v_movement_count integer;
  v_graph_edge_found boolean;
  v_anchor_used boolean := false;
  v_cursor uuid;
  v_start uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_next_index integer;
  v_step integer;
begin
  if v_currency_code <> 'COP' then
    raise exception 'invalid_cycle_currency';
  end if;

  if (p_anchor_user_low_id is null) <> (p_anchor_user_high_id is null) then
    raise exception 'invalid_cycle_anchor';
  end if;

  if p_anchor_user_low_id is not null and p_anchor_user_low_id >= p_anchor_user_high_id then
    raise exception 'invalid_cycle_anchor';
  end if;

  if p_graph_snapshot is null or jsonb_typeof(p_graph_snapshot) is distinct from 'array' or jsonb_array_length(p_graph_snapshot) = 0 then
    raise exception 'invalid_cycle_graph_snapshot';
  end if;

  if p_movements_json is null or jsonb_typeof(p_movements_json) is distinct from 'array' or jsonb_array_length(p_movements_json) = 0 then
    raise exception 'invalid_settlement_movements';
  end if;

  if p_participant_user_ids is null or cardinality(p_participant_user_ids) = 0 then
    raise exception 'invalid_cycle_participants';
  end if;

  if exists (select 1 from unnest(p_participant_user_ids) as participant(value) where value is null) then
    raise exception 'invalid_cycle_participants';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
    into v_expected_participants
  from unnest(p_participant_user_ids) as participant(value);

  if cardinality(v_expected_participants) <> cardinality(p_participant_user_ids) then
    raise exception 'duplicate_cycle_participants';
  end if;

  v_movement_count := jsonb_array_length(p_movements_json);

  for v_movement in
    select value, ordinality
    from jsonb_array_elements(p_movements_json) with ordinality
  loop
    if jsonb_typeof(v_movement.value) is distinct from 'object' then
      raise exception 'invalid_settlement_movement';
    end if;

    if not (v_movement.value ? 'debtor_user_id')
      or not (v_movement.value ? 'creditor_user_id')
      or not (v_movement.value ? 'amount_minor') then
      raise exception 'invalid_settlement_movement';
    end if;

    v_debtor_user_id := (v_movement.value ->> 'debtor_user_id')::uuid;
    v_creditor_user_id := (v_movement.value ->> 'creditor_user_id')::uuid;
    v_amount_minor := (v_movement.value ->> 'amount_minor')::bigint;

    if v_debtor_user_id = v_creditor_user_id then
      raise exception 'invalid_cycle_self_movement';
    end if;

    if v_amount_minor <= 0 then
      raise exception 'invalid_cycle_amount';
    end if;

    if v_cycle_amount_minor is null then
      v_cycle_amount_minor := v_amount_minor;
    elsif v_cycle_amount_minor <> v_amount_minor then
      raise exception 'inconsistent_cycle_movement_amounts';
    end if;

    select exists (
      select 1
      from jsonb_array_elements(p_graph_snapshot) as edge(value)
      where jsonb_typeof(edge.value) = 'object'
        and (edge.value ->> 'debtor_user_id')::uuid = v_creditor_user_id
        and (edge.value ->> 'creditor_user_id')::uuid = v_debtor_user_id
        and (edge.value ->> 'currency_code') = v_currency_code
        and (edge.value ->> 'amount_minor')::bigint >= v_amount_minor
    )
      into v_graph_edge_found;

    if not v_graph_edge_found then
      raise exception 'cycle_movement_does_not_reverse_snapshot_edge';
    end if;

    if p_anchor_user_low_id is not null
      and least(v_debtor_user_id, v_creditor_user_id) = p_anchor_user_low_id
      and greatest(v_debtor_user_id, v_creditor_user_id) = p_anchor_user_high_id then
      v_anchor_used := true;
    end if;

    v_debtors := array_append(v_debtors, v_debtor_user_id);
    v_creditors := array_append(v_creditors, v_creditor_user_id);
  end loop;

  if v_movement_count <> cardinality(v_expected_participants) then
    raise exception 'cycle_participant_movement_mismatch';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
    into v_distinct_debtors
  from unnest(v_debtors) as debtor(value);

  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
    into v_distinct_creditors
  from unnest(v_creditors) as creditor(value);

  if cardinality(v_distinct_debtors) <> cardinality(v_debtors)
    or cardinality(v_distinct_creditors) <> cardinality(v_creditors) then
    raise exception 'cycle_has_duplicate_direction_participants';
  end if;

  if v_distinct_debtors <> v_expected_participants
    or v_distinct_creditors <> v_expected_participants then
    raise exception 'cycle_participants_do_not_match_movements';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
    into v_derived_participants
  from (
    select unnest(v_debtors) as value
    union all
    select unnest(v_creditors) as value
  ) participants;

  if v_derived_participants <> v_expected_participants then
    raise exception 'cycle_participants_do_not_match_movements';
  end if;

  if p_anchor_user_low_id is not null and not v_anchor_used then
    raise exception 'cycle_anchor_not_in_movements';
  end if;

  v_start := v_debtors[1];
  v_cursor := v_start;

  for v_step in 1..v_movement_count
  loop
    if v_cursor = any(v_seen) then
      raise exception 'cycle_is_not_simple';
    end if;

    v_seen := array_append(v_seen, v_cursor);

    select index_value
      into v_next_index
    from generate_subscripts(v_debtors, 1) as index_value
    where v_debtors[index_value] = v_cursor
    limit 1;

    if v_next_index is null then
      raise exception 'cycle_is_not_closed';
    end if;

    v_cursor := v_creditors[v_next_index];
  end loop;

  if v_cursor <> v_start or cardinality(v_seen) <> v_movement_count then
    raise exception 'cycle_is_not_closed';
  end if;

  return jsonb_build_object(
    'status', 'valid',
    'amountMinor', v_cycle_amount_minor,
    'movementCount', v_movement_count,
    'participantCount', cardinality(v_expected_participants)
  );
end;
$$;

create or replace function public.propose_cycle_settlement(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_graph_snapshot_hash text,
  p_graph_snapshot jsonb,
  p_movements_json jsonb,
  p_participant_user_ids uuid[],
  p_anchor_user_low_id uuid default null,
  p_anchor_user_high_id uuid default null,
  p_currency_code text default 'COP',
  p_source_graph_cycle_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_current_hash text;
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

  if p_anchor_user_low_id is not null and p_anchor_user_high_id is not null then
    v_current_hash := public.compute_graph_component_snapshot_hash(
      p_anchor_user_low_id,
      p_anchor_user_high_id,
      coalesce(p_currency_code, 'COP')
    );
  else
    v_current_hash := public.compute_graph_snapshot_hash();
  end if;

  if v_current_hash is null or p_graph_snapshot_hash <> v_current_hash then
    raise exception 'graph_snapshot_mismatch';
  end if;

  perform public.validate_cycle_settlement_payload(
    p_graph_snapshot,
    p_movements_json,
    p_participant_user_ids,
    p_anchor_user_low_id,
    p_anchor_user_high_id,
    coalesce(p_currency_code, 'COP')
  );

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

  begin
    insert into public.settlement_proposals (
      created_by_user_id,
      status,
      graph_snapshot_hash,
      graph_snapshot,
      movements_json,
      anchor_user_low_id,
      anchor_user_high_id,
      currency_code,
      source_graph_cycle_job_id
    )
    values (
      p_actor_user_id,
      'pending_approvals',
      p_graph_snapshot_hash,
      p_graph_snapshot,
      p_movements_json,
      p_anchor_user_low_id,
      p_anchor_user_high_id,
      coalesce(p_currency_code, 'COP'),
      p_source_graph_cycle_job_id
    )
    returning id into v_proposal_id;
  exception
    when unique_violation then
      select id
        into v_existing_open_proposal_id
      from public.settlement_proposals
      where graph_snapshot_hash = p_graph_snapshot_hash
        and status in ('pending_approvals', 'approved')
      order by created_at desc
      limit 1
      for update;

      if v_existing_open_proposal_id is null then
        raise;
      end if;

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
  end;

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
    jsonb_build_object(
      'participants', p_participant_user_ids,
      'anchor_user_low_id', p_anchor_user_low_id,
      'anchor_user_high_id', p_anchor_user_high_id
    )
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

create or replace function public.apply_cycle_settlement_execution(
  p_actor_user_id uuid,
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.settlement_proposals%rowtype;
  v_execution_id uuid;
  v_movement jsonb;
  v_pair record;
  v_transaction_id uuid;
  v_debtor_payable_account_id uuid;
  v_creditor_receivable_account_id uuid;
  v_current_hash text;
  v_next_jobs jsonb := '[]'::jsonb;
  v_job jsonb;
  v_response jsonb;
  v_participant_user_ids uuid[];
begin
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

  select coalesce(array_agg(participant_user_id order by participant_user_id), '{}'::uuid[])
    into v_participant_user_ids
  from public.settlement_proposal_participants
  where settlement_proposal_id = p_proposal_id;

  if not (p_actor_user_id = any(v_participant_user_ids)) then
    raise exception 'actor_not_participant';
  end if;

  perform public.validate_cycle_settlement_payload(
    v_proposal.graph_snapshot,
    v_proposal.movements_json,
    v_participant_user_ids,
    v_proposal.anchor_user_low_id,
    v_proposal.anchor_user_high_id,
    v_proposal.currency_code
  );

  for v_pair in
    select distinct
      least((movement.value ->> 'debtor_user_id')::uuid, (movement.value ->> 'creditor_user_id')::uuid) as user_low_id,
      greatest((movement.value ->> 'debtor_user_id')::uuid, (movement.value ->> 'creditor_user_id')::uuid) as user_high_id
    from jsonb_array_elements(v_proposal.movements_json) movement
    order by user_low_id, user_high_id
  loop
    perform public.lock_graph_pair(v_pair.user_low_id, v_pair.user_high_id, v_proposal.currency_code);
  end loop;

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
    update public.settlement_proposals
    set status = 'stale',
        updated_at = timezone('utc', now())
    where id = p_proposal_id;

    if v_proposal.anchor_user_low_id is not null and v_proposal.anchor_user_high_id is not null then
      v_job := public.enqueue_graph_cycle_job(
        'stale_settlement_proposal',
        p_proposal_id,
        p_actor_user_id,
        p_actor_user_id,
        v_proposal.anchor_user_low_id,
        v_proposal.anchor_user_high_id,
        v_proposal.currency_code
      );
    end if;

    return jsonb_build_object(
      'proposalId', p_proposal_id,
      'status', 'stale',
      'autoCycleJob', v_job,
      'nextAutoCycleJob', v_job
    );
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
      and currency_code = v_proposal.currency_code;

    select id
      into v_creditor_receivable_account_id
    from public.ledger_accounts
    where owner_user_id = (v_movement ->> 'creditor_user_id')::uuid
      and counterparty_user_id = (v_movement ->> 'debtor_user_id')::uuid
      and account_kind = 'receivable'
      and currency_code = v_proposal.currency_code;

    if v_debtor_payable_account_id is null or v_creditor_receivable_account_id is null then
      raise exception 'ledger_accounts_not_initialized';
    end if;

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
      v_proposal.currency_code,
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

    v_job := public.enqueue_graph_cycle_job(
      'cycle_settlement_executed',
      p_proposal_id,
      p_actor_user_id,
      p_actor_user_id,
      (v_movement ->> 'debtor_user_id')::uuid,
      (v_movement ->> 'creditor_user_id')::uuid,
      v_proposal.currency_code
    );

    if v_job ->> 'status' = 'queued' then
      v_next_jobs := v_next_jobs || jsonb_build_array(v_job);
    end if;
  end loop;

  perform public.mark_touched_settlement_proposals_stale(v_participant_user_ids);

  update public.settlement_proposals
  set status = 'executed',
      executed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_proposal_id;

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
    'status', 'executed',
    'nextAutoCycleJobs', v_next_jobs,
    'nextAutoCycleJob', case
      when jsonb_array_length(v_next_jobs) > 0 then v_next_jobs -> 0
      else null
    end
  );

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
  v_participant public.settlement_proposal_participants%rowtype;
  v_response jsonb;
  v_all_approved boolean;
  v_current_hash text;
  v_recovery_job jsonb;
  v_approvals_pending integer;
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
    update public.settlement_proposals
    set status = 'stale',
        updated_at = timezone('utc', now())
    where id = p_proposal_id;

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
      'autoCycleJob', v_recovery_job
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
  end if;

  update public.settlement_proposal_participants
  set decision = p_decision,
      decided_at = timezone('utc', now())
  where id = v_participant.id;

  if p_decision = 'rejected' then
    update public.settlement_proposals
    set status = 'rejected',
        updated_at = timezone('utc', now())
    where id = p_proposal_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'settlement_proposal',
      p_proposal_id,
      'settlement_rejected',
      null,
      '{}'::jsonb
    );

    v_response := jsonb_build_object(
      'proposalId', p_proposal_id,
      'status', 'rejected'
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
        'approvalsPending', v_approvals_pending
      );
    end if;
  end if;

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
$$;

do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as function_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'apply_cycle_settlement_execution',
        'claim_graph_cycle_job',
        'complete_graph_cycle_job',
        'decide_cycle_settlement',
        'execute_cycle_settlement',
        'fail_graph_cycle_job',
        'propose_cycle_settlement',
        'requeue_stale_graph_cycle_jobs',
        'validate_cycle_settlement_payload'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.function_signature);
    execute format('grant execute on function %s to service_role', v_function.function_signature);
  end loop;
end;
$$;
