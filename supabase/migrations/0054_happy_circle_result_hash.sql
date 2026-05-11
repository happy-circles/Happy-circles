create or replace function public.compute_settlement_result_hash(
  p_movements_json jsonb,
  p_participant_user_ids uuid[],
  p_currency_code text default 'COP'
)
returns text
language sql
immutable
set search_path = public
as $$
  with participant_values as (
    select participant_id::text as participant_id
    from unnest(coalesce(p_participant_user_ids, '{}'::uuid[])) as participant(participant_id)
    where participant_id is not null
    group by participant_id
  ),
  movement_values as (
    select
      (movement.value ->> 'debtor_user_id')::uuid::text as debtor_user_id,
      (movement.value ->> 'creditor_user_id')::uuid::text as creditor_user_id,
      ((movement.value ->> 'amount_minor')::bigint)::text as amount_minor
    from jsonb_array_elements(coalesce(p_movements_json, '[]'::jsonb)) as movement(value)
    where jsonb_typeof(movement.value) = 'object'
  ),
  canonical as (
    select
      coalesce(nullif(p_currency_code, ''), 'COP') as currency_code,
      coalesce(
        (
          select string_agg(participant_id, ',' order by participant_id)
          from participant_values
        ),
        ''
      ) as participants_key,
      coalesce(
        (
          select string_agg(
            debtor_user_id || '>' || creditor_user_id || ':' || amount_minor,
            ';'
            order by debtor_user_id, creditor_user_id, amount_minor
          )
          from movement_values
        ),
        ''
      ) as movements_key
  )
  select encode(
    extensions.digest(
      currency_code || '|' || participants_key || '|' || movements_key,
      'sha256'
    ),
    'hex'
  )
  from canonical;
$$;

alter table public.settlement_proposals
  add column if not exists result_hash text;

update public.settlement_proposals proposal
set result_hash = public.compute_settlement_result_hash(
  proposal.movements_json,
  coalesce(
    (
      select array_agg(participant.participant_user_id order by participant.participant_user_id)
      from public.settlement_proposal_participants participant
      where participant.settlement_proposal_id = proposal.id
    ),
    '{}'::uuid[]
  ),
  proposal.currency_code
)
where proposal.result_hash is null;

create index if not exists settlement_proposals_case_result_hash_idx
  on public.settlement_proposals (happy_circle_case_id, result_hash)
  where happy_circle_case_id is not null
    and result_hash is not null;

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
  v_replaces_proposal_id uuid;
  v_revalidated_status public.settlement_proposal_status;
  v_old_all_approved boolean;
  v_replacement_reason public.settlement_stale_reason := 'balance_changed';
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

    if found
      and v_case.status = 'active'
      and v_case.participant_set_hash = v_participant_set_hash then
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

        v_response := jsonb_build_object(
          'proposalId', v_old_proposal.id,
          'status', v_revalidated_status::text,
          'happyCircleCaseId', v_case_id,
          'versionNumber', v_old_proposal.version_number,
          'revalidated', true
        );

        update public.idempotency_keys
        set response_json = v_response
        where id = v_idempotency.id;

        return v_response;
      end if;
    else
      perform public.mark_happy_circle_proposal_stale(
        p_actor_user_id,
        v_old_proposal.id,
        'participant_set_changed'::public.settlement_stale_reason
      );

      if v_old_proposal.happy_circle_case_id is not null then
        update public.happy_circle_cases
        set status = 'closed',
            current_proposal_id = v_old_proposal.id,
            updated_at = timezone('utc', now())
        where id = v_old_proposal.happy_circle_case_id
          and status = 'active'
          and current_proposal_id = v_old_proposal.id;
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

  if v_replaces_proposal_id is not null then
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
      completed_at = null,
      updated_at = timezone('utc', now())
  where id = v_case_id;

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
      'result_hash', v_result_hash
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

  v_response := jsonb_build_object(
    'proposalId', v_proposal_id,
    'status', 'pending_approvals',
    'happyCircleCaseId', v_case_id,
    'versionNumber', v_version_number,
    'replacesProposalId', v_replaces_proposal_id
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;
