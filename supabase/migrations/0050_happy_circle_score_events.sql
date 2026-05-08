create table if not exists public.happy_circle_score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  settlement_proposal_id uuid not null references public.settlement_proposals (id) on delete restrict,
  score_delta integer not null check (score_delta > 0),
  participant_count integer not null check (participant_count > 0),
  awarded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint happy_circle_score_events_score_matches_participants check (score_delta = participant_count)
);

comment on table public.happy_circle_score_events is
  'Private reputation events: participants earn happy faces when a Happy Circle is executed.';

create unique index if not exists happy_circle_score_events_unique_award_idx
  on public.happy_circle_score_events (settlement_proposal_id, user_id);

create index if not exists happy_circle_score_events_user_awarded_at_idx
  on public.happy_circle_score_events (user_id, awarded_at desc);

alter table public.happy_circle_score_events enable row level security;

drop policy if exists happy_circle_score_events_select_self on public.happy_circle_score_events;
create policy happy_circle_score_events_select_self
on public.happy_circle_score_events
for select
to authenticated
using (auth.uid() = user_id);

grant select on public.happy_circle_score_events to authenticated;

create or replace function public.award_happy_circle_score(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.settlement_proposal_status;
  v_participant_count integer;
  v_inserted_count integer;
begin
  select status
    into v_status
  from public.settlement_proposals
  where id = p_proposal_id;

  if not found then
    raise exception 'settlement_proposal_not_found';
  end if;

  if v_status <> 'executed' then
    return jsonb_build_object(
      'proposalId', p_proposal_id,
      'status', 'skipped',
      'reason', 'settlement_not_executed'
    );
  end if;

  select count(*)
    into v_participant_count
  from public.settlement_proposal_participants
  where settlement_proposal_id = p_proposal_id;

  if v_participant_count <= 0 then
    raise exception 'invalid_score_participants';
  end if;

  with inserted as (
    insert into public.happy_circle_score_events (
      user_id,
      settlement_proposal_id,
      score_delta,
      participant_count,
      awarded_at
    )
    select
      participant.participant_user_id,
      proposal.id,
      v_participant_count,
      v_participant_count,
      coalesce(proposal.executed_at, timezone('utc', now()))
    from public.settlement_proposals proposal
    join public.settlement_proposal_participants participant
      on participant.settlement_proposal_id = proposal.id
    where proposal.id = p_proposal_id
      and proposal.status = 'executed'
    on conflict (settlement_proposal_id, user_id) do nothing
    returning id
  )
  select count(*)
    into v_inserted_count
  from inserted;

  return jsonb_build_object(
    'proposalId', p_proposal_id,
    'status', 'awarded',
    'participantCount', v_participant_count,
    'insertedCount', v_inserted_count
  );
end;
$$;

revoke all on function public.award_happy_circle_score(uuid) from public, anon, authenticated;
grant execute on function public.award_happy_circle_score(uuid) to service_role;

insert into public.happy_circle_score_events (
  user_id,
  settlement_proposal_id,
  score_delta,
  participant_count,
  awarded_at
)
select
  participant.participant_user_id,
  proposal.id,
  participant_counts.participant_count,
  participant_counts.participant_count,
  coalesce(proposal.executed_at, proposal.updated_at, proposal.created_at)
from public.settlement_proposals proposal
join (
  select
    settlement_proposal_id,
    count(*)::integer as participant_count
  from public.settlement_proposal_participants
  group by settlement_proposal_id
) participant_counts
  on participant_counts.settlement_proposal_id = proposal.id
join public.settlement_proposal_participants participant
  on participant.settlement_proposal_id = proposal.id
where proposal.status = 'executed'
on conflict (settlement_proposal_id, user_id) do nothing;

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

  perform public.award_happy_circle_score(p_proposal_id);

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
