do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'settlement_participant_decision_source'
  ) then
    create type public.settlement_participant_decision_source as enum ('manual', 'carried');
  end if;
end
$$;

create or replace function public.compute_cycle_participant_approval_scope_hash(
  p_movements_json jsonb,
  p_participant_user_id uuid,
  p_currency_code text default 'COP'
)
returns text
language sql
immutable
set search_path = public
as $$
  with movement_values as (
    select
      (movement.value ->> 'debtor_user_id')::uuid::text as debtor_user_id,
      (movement.value ->> 'creditor_user_id')::uuid::text as creditor_user_id,
      ((movement.value ->> 'amount_minor')::bigint)::text as amount_minor
    from jsonb_array_elements(coalesce(p_movements_json, '[]'::jsonb)) as movement(value)
    where jsonb_typeof(movement.value) = 'object'
  ),
  personal_scope as (
    select
      coalesce(nullif(p_currency_code, ''), 'COP') as currency_code,
      p_participant_user_id::text as participant_user_id,
      coalesce(
        (
          select string_agg(
            creditor_user_id || ':' || amount_minor,
            ';'
            order by creditor_user_id, amount_minor
          )
          from movement_values
          where debtor_user_id = p_participant_user_id::text
        ),
        ''
      ) as outgoing_key,
      coalesce(
        (
          select string_agg(
            debtor_user_id || ':' || amount_minor,
            ';'
            order by debtor_user_id, amount_minor
          )
          from movement_values
          where creditor_user_id = p_participant_user_id::text
        ),
        ''
      ) as incoming_key
  )
  select encode(
    extensions.digest(
      currency_code || '|' || participant_user_id || '|out:' || outgoing_key || '|in:' || incoming_key,
      'sha256'
    ),
    'hex'
  )
  from personal_scope;
$$;

alter table public.settlement_proposal_participants
  add column if not exists approval_scope_hash text,
  add column if not exists decision_source public.settlement_participant_decision_source not null default 'manual',
  add column if not exists carried_from_participant_id uuid references public.settlement_proposal_participants (id) on delete set null,
  add column if not exists carried_at timestamptz;

update public.settlement_proposal_participants participant
set approval_scope_hash = public.compute_cycle_participant_approval_scope_hash(
  proposal.movements_json,
  participant.participant_user_id,
  proposal.currency_code
)
from public.settlement_proposals proposal
where proposal.id = participant.settlement_proposal_id
  and participant.approval_scope_hash is null;

alter table public.settlement_proposal_participants
  alter column approval_scope_hash set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'settlement_proposal_participants_carried_source_chk'
  ) then
    alter table public.settlement_proposal_participants
      add constraint settlement_proposal_participants_carried_source_chk
      check (
        (
          decision_source = 'manual'
          and carried_from_participant_id is null
          and carried_at is null
        )
        or
        (
          decision_source = 'carried'
          and decision = 'approved'
          and carried_from_participant_id is not null
          and carried_at is not null
        )
      );
  end if;
end
$$;

create index if not exists settlement_proposal_participants_carried_from_idx
  on public.settlement_proposal_participants (carried_from_participant_id)
  where carried_from_participant_id is not null;

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
  v_existing_open_proposal public.settlement_proposals%rowtype;
  v_existing_rejected_proposal public.settlement_proposals%rowtype;
  v_response jsonb;
  v_participant_user_id uuid;
  v_participant_set_hash text;
  v_result_hash text;
  v_old_result_hash text;
  v_case public.happy_circle_cases%rowtype;
  v_case_id uuid;
  v_version_number integer;
  v_source_job public.graph_cycle_jobs%rowtype;
  v_old_proposal public.settlement_proposals%rowtype;
  v_old_participant public.settlement_proposal_participants%rowtype;
  v_replaces_proposal_id uuid;
  v_revalidated_status public.settlement_proposal_status;
  v_old_all_approved boolean;
  v_replacement_reason public.settlement_stale_reason := 'balance_changed';
  v_approval_scope_hash text;
  v_participant_decision public.settlement_participant_decision;
  v_decision_source public.settlement_participant_decision_source;
  v_decided_at timestamptz;
  v_carried_from_participant_id uuid;
  v_carried_at timestamptz;
  v_carried_count integer := 0;
  v_approvals_pending integer := 0;
  v_added_participant_user_ids uuid[] := '{}'::uuid[];
  v_removed_participant_user_ids uuid[] := '{}'::uuid[];
  v_old_cycle_amount_minor bigint;
  v_new_cycle_amount_minor bigint;
  v_participant_count_before integer := 0;
  v_participant_count_after integer := 0;
  v_execution_actor_user_id uuid;
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

  v_participant_set_hash := public.compute_happy_circle_participant_set_hash(
    p_participant_user_ids
  );
  v_result_hash := public.compute_settlement_result_hash(
    p_movements_json,
    p_participant_user_ids,
    coalesce(p_currency_code, 'COP')
  );

  select *
    into v_existing_open_proposal
  from public.settlement_proposals
  where graph_snapshot_hash = p_graph_snapshot_hash
    and status in ('pending_approvals', 'approved')
  order by created_at desc
  limit 1
  for update;

  if found then
    v_response := jsonb_build_object(
      'proposalId', v_existing_open_proposal.id,
      'status', v_existing_open_proposal.status::text,
      'happyCircleCaseId', v_existing_open_proposal.happy_circle_case_id,
      'versionNumber', v_existing_open_proposal.version_number
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
  end if;

  select *
    into v_existing_rejected_proposal
  from public.settlement_proposals
  where graph_snapshot_hash = p_graph_snapshot_hash
    and status = 'rejected'
  order by created_at desc
  limit 1;

  if found then
    v_response := jsonb_build_object(
      'proposalId', v_existing_rejected_proposal.id,
      'status', 'rejected',
      'happyCircleCaseId', v_existing_rejected_proposal.happy_circle_case_id,
      'versionNumber', v_existing_rejected_proposal.version_number
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
  end if;

  if p_anchor_user_low_id is null or p_anchor_user_high_id is null then
    insert into public.settlement_proposals (
      created_by_user_id,
      status,
      graph_snapshot_hash,
      graph_snapshot,
      movements_json,
      result_hash,
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
      v_result_hash,
      p_anchor_user_low_id,
      p_anchor_user_high_id,
      coalesce(p_currency_code, 'COP'),
      p_source_graph_cycle_job_id
    )
    returning id into v_proposal_id;

    foreach v_participant_user_id in array p_participant_user_ids
    loop
      insert into public.settlement_proposal_participants (
        settlement_proposal_id,
        participant_user_id,
        decision,
        approval_scope_hash,
        decision_source
      )
      values (
        v_proposal_id,
        v_participant_user_id,
        'pending',
        public.compute_cycle_participant_approval_scope_hash(
          p_movements_json,
          v_participant_user_id,
          coalesce(p_currency_code, 'COP')
        ),
        'manual'
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
        'anchor_user_high_id', p_anchor_user_high_id,
        'result_hash', v_result_hash
      )
    );

    v_response := jsonb_build_object(
      'proposalId', v_proposal_id,
      'status', 'pending_approvals',
      'happyCircleCaseId', null,
      'versionNumber', null
    );

    update public.idempotency_keys
    set response_json = v_response
    where id = v_idempotency.id;

    return v_response;
  end if;

  if p_source_graph_cycle_job_id is not null then
    select *
      into v_source_job
    from public.graph_cycle_jobs
    where id = p_source_graph_cycle_job_id;

    if found and v_source_job.source_type = 'stale_settlement_proposal' then
      select *
        into v_old_proposal
      from public.settlement_proposals
      where id = v_source_job.source_id
      for update;
    end if;
  end if;

  if v_old_proposal.id is not null
    and v_old_proposal.happy_circle_case_id is not null
    and v_old_proposal.anchor_user_low_id = p_anchor_user_low_id
    and v_old_proposal.anchor_user_high_id = p_anchor_user_high_id
    and v_old_proposal.currency_code = coalesce(p_currency_code, 'COP') then
    select *
      into v_case
    from public.happy_circle_cases
    where id = v_old_proposal.happy_circle_case_id
    for update;

    if found and v_case.status = 'active' then
      v_case_id := v_case.id;
      v_replaces_proposal_id := v_old_proposal.id;

      select coalesce(
        v_old_proposal.result_hash,
        public.compute_settlement_result_hash(
          v_old_proposal.movements_json,
          coalesce(
            array_agg(participant.participant_user_id order by participant.participant_user_id),
            '{}'::uuid[]
          ),
          v_old_proposal.currency_code
        )
      )
        into v_old_result_hash
      from public.settlement_proposal_participants participant
      where participant.settlement_proposal_id = v_old_proposal.id;

      if v_old_result_hash = v_result_hash then
        select coalesce(bool_and(participant.decision = 'approved'), false)
          into v_old_all_approved
        from public.settlement_proposal_participants participant
        where participant.settlement_proposal_id = v_old_proposal.id;

        v_revalidated_status := case
          when v_old_all_approved then 'approved'::public.settlement_proposal_status
          else 'pending_approvals'::public.settlement_proposal_status
        end;

        update public.settlement_proposals
        set status = v_revalidated_status,
            graph_snapshot_hash = p_graph_snapshot_hash,
            graph_snapshot = p_graph_snapshot,
            movements_json = p_movements_json,
            result_hash = v_result_hash,
            stale_reason = null,
            replaced_by_proposal_id = null,
            updated_at = timezone('utc', now())
        where id = v_old_proposal.id;

        update public.happy_circle_cases
        set status = 'active',
            current_proposal_id = v_old_proposal.id,
            participant_set_hash = v_participant_set_hash,
            completed_at = null,
            updated_at = timezone('utc', now())
        where id = v_case_id;

        perform public.append_audit_event(
          p_actor_user_id,
          'happy_circle_case',
          v_case_id,
          'happy_circle_case.version_revalidated',
          null,
          jsonb_build_object(
            'proposal_id', v_old_proposal.id,
            'version_number', v_old_proposal.version_number,
            'result_hash', v_result_hash,
            'graph_snapshot_hash', p_graph_snapshot_hash
          )
        );

        if v_old_all_approved then
          select participant.participant_user_id
            into v_execution_actor_user_id
          from public.settlement_proposal_participants participant
          where participant.settlement_proposal_id = v_old_proposal.id
            and participant.participant_user_id = p_actor_user_id
          limit 1;

          if v_execution_actor_user_id is null then
            select participant.participant_user_id
              into v_execution_actor_user_id
            from public.settlement_proposal_participants participant
            where participant.settlement_proposal_id = v_old_proposal.id
            order by participant.participant_user_id
            limit 1;
          end if;

          v_response := public.apply_cycle_settlement_execution(
            v_execution_actor_user_id,
            v_old_proposal.id
          );

          if v_response ->> 'status' = 'executed' then
            perform public.append_audit_event(
              p_actor_user_id,
              'settlement_proposal',
              v_old_proposal.id,
              'settlement_auto_executed_after_revalidation',
              null,
              jsonb_build_object(
                'happy_circle_case_id', v_case_id,
                'version_number', v_old_proposal.version_number,
                'revalidated', true
              )
            );
          end if;
        else
          v_response := jsonb_build_object(
            'proposalId', v_old_proposal.id,
            'status', v_revalidated_status::text,
            'happyCircleCaseId', v_case_id,
            'versionNumber', v_old_proposal.version_number,
            'revalidated', true
          );
        end if;

        update public.idempotency_keys
        set response_json = v_response
        where id = v_idempotency.id;

        return v_response;
      end if;
    end if;
  end if;

  if v_case_id is null then
    select *
      into v_case
    from public.happy_circle_cases
    where anchor_user_low_id = p_anchor_user_low_id
      and anchor_user_high_id = p_anchor_user_high_id
      and currency_code = coalesce(p_currency_code, 'COP')
      and participant_set_hash = v_participant_set_hash
      and status = 'active'
    order by created_at desc
    limit 1
    for update;

    if found then
      v_case_id := v_case.id;
    else
      begin
        insert into public.happy_circle_cases (
          anchor_user_low_id,
          anchor_user_high_id,
          currency_code,
          participant_set_hash,
          status,
          created_by_user_id
        )
        values (
          p_anchor_user_low_id,
          p_anchor_user_high_id,
          coalesce(p_currency_code, 'COP'),
          v_participant_set_hash,
          'active',
          p_actor_user_id
        )
        returning * into v_case;

        v_case_id := v_case.id;

        perform public.append_audit_event(
          p_actor_user_id,
          'happy_circle_case',
          v_case_id,
          'happy_circle_case.created',
          null,
          jsonb_build_object(
            'anchor_user_low_id', p_anchor_user_low_id,
            'anchor_user_high_id', p_anchor_user_high_id,
            'currency_code', coalesce(p_currency_code, 'COP')
          )
        );
      exception
        when unique_violation then
          select *
            into v_case
          from public.happy_circle_cases
          where anchor_user_low_id = p_anchor_user_low_id
            and anchor_user_high_id = p_anchor_user_high_id
            and currency_code = coalesce(p_currency_code, 'COP')
            and participant_set_hash = v_participant_set_hash
            and status = 'active'
          order by created_at desc
          limit 1
          for update;

          if not found then
            raise;
          end if;

          v_case_id := v_case.id;
      end;
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1
    into v_version_number
  from public.settlement_proposals
  where happy_circle_case_id = v_case_id;

  begin
    insert into public.settlement_proposals (
      created_by_user_id,
      status,
      graph_snapshot_hash,
      graph_snapshot,
      movements_json,
      result_hash,
      anchor_user_low_id,
      anchor_user_high_id,
      currency_code,
      source_graph_cycle_job_id,
      happy_circle_case_id,
      version_number,
      replaces_proposal_id
    )
    values (
      p_actor_user_id,
      'pending_approvals',
      p_graph_snapshot_hash,
      p_graph_snapshot,
      p_movements_json,
      v_result_hash,
      p_anchor_user_low_id,
      p_anchor_user_high_id,
      coalesce(p_currency_code, 'COP'),
      p_source_graph_cycle_job_id,
      v_case_id,
      v_version_number,
      v_replaces_proposal_id
    )
    returning id into v_proposal_id;
  exception
    when unique_violation then
      select *
        into v_existing_open_proposal
      from public.settlement_proposals
      where graph_snapshot_hash = p_graph_snapshot_hash
        and status in ('pending_approvals', 'approved')
      order by created_at desc
      limit 1
      for update;

      if not found then
        raise;
      end if;

      v_response := jsonb_build_object(
        'proposalId', v_existing_open_proposal.id,
        'status', v_existing_open_proposal.status::text,
        'happyCircleCaseId', v_existing_open_proposal.happy_circle_case_id,
        'versionNumber', v_existing_open_proposal.version_number
      );

      update public.idempotency_keys
      set response_json = v_response
      where id = v_idempotency.id;

      return v_response;
  end;

  foreach v_participant_user_id in array p_participant_user_ids
  loop
    v_approval_scope_hash := public.compute_cycle_participant_approval_scope_hash(
      p_movements_json,
      v_participant_user_id,
      coalesce(p_currency_code, 'COP')
    );
    v_participant_decision := 'pending';
    v_decision_source := 'manual';
    v_decided_at := null;
    v_carried_from_participant_id := null;
    v_carried_at := null;

    if v_replaces_proposal_id is not null then
      select *
        into v_old_participant
      from public.settlement_proposal_participants
      where settlement_proposal_id = v_replaces_proposal_id
        and participant_user_id = v_participant_user_id
      limit 1;

      if found
        and v_old_participant.decision = 'approved'
        and v_old_participant.approval_scope_hash = v_approval_scope_hash then
        v_participant_decision := 'approved';
        v_decision_source := 'carried';
        v_decided_at := v_old_participant.decided_at;
        v_carried_from_participant_id := v_old_participant.id;
        v_carried_at := timezone('utc', now());
        v_carried_count := v_carried_count + 1;
      end if;
    end if;

    insert into public.settlement_proposal_participants (
      settlement_proposal_id,
      participant_user_id,
      decision,
      decided_at,
      approval_scope_hash,
      decision_source,
      carried_from_participant_id,
      carried_at
    )
    values (
      v_proposal_id,
      v_participant_user_id,
      v_participant_decision,
      v_decided_at,
      v_approval_scope_hash,
      v_decision_source,
      v_carried_from_participant_id,
      v_carried_at
    );
  end loop;

  if v_replaces_proposal_id is not null then
    select coalesce(array_agg(new_participant.participant_user_id order by new_participant.participant_user_id), '{}'::uuid[])
      into v_added_participant_user_ids
    from public.settlement_proposal_participants new_participant
    where new_participant.settlement_proposal_id = v_proposal_id
      and not exists (
        select 1
        from public.settlement_proposal_participants old_participant
        where old_participant.settlement_proposal_id = v_replaces_proposal_id
          and old_participant.participant_user_id = new_participant.participant_user_id
      );

    select coalesce(array_agg(old_participant.participant_user_id order by old_participant.participant_user_id), '{}'::uuid[])
      into v_removed_participant_user_ids
    from public.settlement_proposal_participants old_participant
    where old_participant.settlement_proposal_id = v_replaces_proposal_id
      and not exists (
        select 1
        from public.settlement_proposal_participants new_participant
        where new_participant.settlement_proposal_id = v_proposal_id
          and new_participant.participant_user_id = old_participant.participant_user_id
      );

    select (movement.value ->> 'amount_minor')::bigint
      into v_old_cycle_amount_minor
    from jsonb_array_elements(v_old_proposal.movements_json) with ordinality as movement(value, ordinal)
    order by movement.ordinal
    limit 1;

    select (movement.value ->> 'amount_minor')::bigint
      into v_new_cycle_amount_minor
    from jsonb_array_elements(p_movements_json) with ordinality as movement(value, ordinal)
    order by movement.ordinal
    limit 1;

    select count(*)
      into v_participant_count_before
    from public.settlement_proposal_participants old_participant
    where old_participant.settlement_proposal_id = v_replaces_proposal_id;

    v_participant_count_after := cardinality(p_participant_user_ids);

    perform public.mark_happy_circle_proposal_stale(
      p_actor_user_id,
      v_replaces_proposal_id,
      v_replacement_reason
    );

    update public.settlement_proposals
    set replaced_by_proposal_id = v_proposal_id,
        stale_reason = v_replacement_reason,
        updated_at = timezone('utc', now())
    where id = v_replaces_proposal_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'happy_circle_case',
      v_case_id,
      'happy_circle_case.version_replaced',
      null,
      jsonb_build_object(
        'old_proposal_id', v_replaces_proposal_id,
        'new_proposal_id', v_proposal_id,
        'reason', v_replacement_reason::text,
        'old_result_hash', v_old_result_hash,
        'new_result_hash', v_result_hash
      )
    );
  end if;

  update public.happy_circle_cases
  set status = 'active',
      current_proposal_id = v_proposal_id,
      participant_set_hash = v_participant_set_hash,
      completed_at = null,
      updated_at = timezone('utc', now())
  where id = v_case_id;

  select count(*)
    into v_approvals_pending
  from public.settlement_proposal_participants
  where settlement_proposal_id = v_proposal_id
    and decision = 'pending';

  perform public.append_audit_event(
    p_actor_user_id,
    'settlement_proposal',
    v_proposal_id,
    'settlement_proposed',
    null,
    jsonb_build_object(
      'participants', p_participant_user_ids,
      'anchor_user_low_id', p_anchor_user_low_id,
      'anchor_user_high_id', p_anchor_user_high_id,
      'happy_circle_case_id', v_case_id,
      'version_number', v_version_number,
      'replaces_proposal_id', v_replaces_proposal_id,
      'result_hash', v_result_hash,
      'carried_approval_count', v_carried_count,
      'approvals_pending', v_approvals_pending
    )
  );

  perform public.append_audit_event(
    p_actor_user_id,
    'happy_circle_case',
    v_case_id,
    'happy_circle_case.version_created',
    null,
    jsonb_build_object(
      'proposal_id', v_proposal_id,
      'version_number', v_version_number,
      'replaces_proposal_id', v_replaces_proposal_id,
      'result_hash', v_result_hash
    )
  );

  if v_replaces_proposal_id is not null then
    perform public.append_audit_event(
      p_actor_user_id,
      'happy_circle_case',
      v_case_id,
      'happy_circle_case.version_morphed',
      null,
      jsonb_build_object(
        'old_proposal_id', v_replaces_proposal_id,
        'new_proposal_id', v_proposal_id,
        'carried_approval_count', v_carried_count,
        'pending_count', v_approvals_pending,
        'old_cycle_amount_minor', v_old_cycle_amount_minor,
        'new_cycle_amount_minor', v_new_cycle_amount_minor,
        'amount_changed', v_old_cycle_amount_minor is distinct from v_new_cycle_amount_minor,
        'participant_count_before', v_participant_count_before,
        'participant_count_after', v_participant_count_after,
        'added_participant_count', cardinality(v_added_participant_user_ids),
        'removed_participant_count', cardinality(v_removed_participant_user_ids),
        'added_participants', v_added_participant_user_ids,
        'removed_participants', v_removed_participant_user_ids
      )
    );

    if v_carried_count > 0 then
      perform public.append_audit_event(
        p_actor_user_id,
        'settlement_proposal',
        v_proposal_id,
        'settlement_approval_carried',
        null,
        jsonb_build_object(
          'from_proposal_id', v_replaces_proposal_id,
          'carried_approval_count', v_carried_count
        )
      );
    end if;
  end if;

  if v_approvals_pending = 0 then
    update public.settlement_proposals
    set status = 'approved',
        updated_at = timezone('utc', now())
    where id = v_proposal_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'settlement_proposal',
      v_proposal_id,
      'settlement_approved',
      null,
      jsonb_build_object(
        'fully_approved', true,
        'approval_source', 'carried',
        'carried_approval_count', v_carried_count
      )
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'happy_circle_case',
      v_case_id,
      'happy_circle_case.version_approved',
      null,
      jsonb_build_object(
        'proposal_id', v_proposal_id,
        'version_number', v_version_number,
        'approval_source', 'carried'
      )
    );

    select participant.participant_user_id
      into v_execution_actor_user_id
    from public.settlement_proposal_participants participant
    where participant.settlement_proposal_id = v_proposal_id
      and participant.participant_user_id = p_actor_user_id
    limit 1;

    if v_execution_actor_user_id is null then
      select participant.participant_user_id
        into v_execution_actor_user_id
      from public.settlement_proposal_participants participant
      where participant.settlement_proposal_id = v_proposal_id
      order by participant.participant_user_id
      limit 1;
    end if;

    v_response := public.apply_cycle_settlement_execution(v_execution_actor_user_id, v_proposal_id);

    if v_response ->> 'status' = 'executed' then
      perform public.append_audit_event(
        p_actor_user_id,
        'settlement_proposal',
        v_proposal_id,
        'settlement_auto_executed_after_revalidation',
        null,
        jsonb_build_object(
          'happy_circle_case_id', v_case_id,
          'version_number', v_version_number,
          'carried_approval_count', v_carried_count
        )
      );
    end if;
  else
    v_response := jsonb_build_object(
      'proposalId', v_proposal_id,
      'status', 'pending_approvals',
      'happyCircleCaseId', v_case_id,
      'versionNumber', v_version_number,
      'replacesProposalId', v_replaces_proposal_id,
      'carriedApprovalCount', v_carried_count,
      'approvalsPending', v_approvals_pending
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

revoke all on function public.compute_cycle_participant_approval_scope_hash(jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.compute_cycle_participant_approval_scope_hash(jsonb, uuid, text)
  to service_role;
