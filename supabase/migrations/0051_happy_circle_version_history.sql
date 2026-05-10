do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'happy_circle_case_status'
  ) then
    create type public.happy_circle_case_status as enum ('active', 'completed', 'closed');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'settlement_stale_reason'
  ) then
    create type public.settlement_stale_reason as enum (
      'balance_changed',
      'related_execution_changed_balance',
      'participant_set_changed'
    );
  end if;
end
$$;

create or replace function public.compute_happy_circle_participant_set_hash(
  p_participant_user_ids uuid[]
)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(
    extensions.digest(
      coalesce(
        string_agg(participant_id::text, '|' order by participant_id::text),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
  from (
    select distinct participant_id
    from unnest(coalesce(p_participant_user_ids, '{}'::uuid[])) as participant_id
  ) ordered_participants;
$$;

create table if not exists public.happy_circle_cases (
  id uuid primary key default gen_random_uuid(),
  anchor_user_low_id uuid not null references public.user_profiles (id),
  anchor_user_high_id uuid not null references public.user_profiles (id),
  currency_code text not null default 'COP',
  participant_set_hash text not null,
  status public.happy_circle_case_status not null default 'active',
  current_proposal_id uuid references public.settlement_proposals (id) on delete set null,
  created_by_user_id uuid not null references public.user_profiles (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint happy_circle_cases_anchor_order_chk check (anchor_user_low_id < anchor_user_high_id),
  constraint happy_circle_cases_currency_chk check (currency_code = 'COP'),
  constraint happy_circle_cases_participant_hash_chk check (length(participant_set_hash) > 0)
);

drop trigger if exists set_happy_circle_cases_updated_at on public.happy_circle_cases;
create trigger set_happy_circle_cases_updated_at
before update on public.happy_circle_cases
for each row execute function public.tg_set_updated_at();

alter table public.settlement_proposals
  add column if not exists happy_circle_case_id uuid references public.happy_circle_cases (id) on delete set null,
  add column if not exists version_number integer,
  add column if not exists replaces_proposal_id uuid references public.settlement_proposals (id) on delete set null,
  add column if not exists replaced_by_proposal_id uuid references public.settlement_proposals (id) on delete set null,
  add column if not exists stale_reason public.settlement_stale_reason;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'settlement_proposals_version_number_chk'
  ) then
    alter table public.settlement_proposals
      add constraint settlement_proposals_version_number_chk
      check (version_number is null or version_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'settlement_proposals_lineage_not_self_chk'
  ) then
    alter table public.settlement_proposals
      add constraint settlement_proposals_lineage_not_self_chk
      check (
        (replaces_proposal_id is null or replaces_proposal_id <> id)
        and (replaced_by_proposal_id is null or replaced_by_proposal_id <> id)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'settlement_proposals_stale_reason_status_chk'
  ) then
    alter table public.settlement_proposals
      add constraint settlement_proposals_stale_reason_status_chk
      check (stale_reason is null or status = 'stale');
  end if;
end
$$;

create unique index if not exists happy_circle_cases_active_identity_idx
  on public.happy_circle_cases (
    anchor_user_low_id,
    anchor_user_high_id,
    currency_code,
    participant_set_hash
  )
  where status = 'active';

create index if not exists happy_circle_cases_current_proposal_id_idx
  on public.happy_circle_cases (current_proposal_id);

create unique index if not exists settlement_proposals_case_version_idx
  on public.settlement_proposals (happy_circle_case_id, version_number)
  where happy_circle_case_id is not null and version_number is not null;

create index if not exists settlement_proposals_happy_circle_case_id_idx
  on public.settlement_proposals (happy_circle_case_id);

create index if not exists settlement_proposals_replaces_proposal_id_idx
  on public.settlement_proposals (replaces_proposal_id);

create index if not exists settlement_proposals_replaced_by_proposal_id_idx
  on public.settlement_proposals (replaced_by_proposal_id);

create or replace function public.tg_validate_settlement_proposal_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_related_case_id uuid;
begin
  if new.replaces_proposal_id is not null then
    select happy_circle_case_id
      into v_related_case_id
    from public.settlement_proposals
    where id = new.replaces_proposal_id;

    if v_related_case_id is null
      or new.happy_circle_case_id is null
      or v_related_case_id <> new.happy_circle_case_id then
      raise exception 'settlement_replaces_proposal_must_share_case';
    end if;
  end if;

  if new.replaced_by_proposal_id is not null then
    select happy_circle_case_id
      into v_related_case_id
    from public.settlement_proposals
    where id = new.replaced_by_proposal_id;

    if v_related_case_id is null
      or new.happy_circle_case_id is null
      or v_related_case_id <> new.happy_circle_case_id then
      raise exception 'settlement_replaced_by_proposal_must_share_case';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_settlement_proposal_lineage on public.settlement_proposals;
create trigger validate_settlement_proposal_lineage
before insert or update of happy_circle_case_id, replaces_proposal_id, replaced_by_proposal_id
on public.settlement_proposals
for each row execute function public.tg_validate_settlement_proposal_lineage();

with proposal_identity as (
  select
    proposal.id,
    proposal.anchor_user_low_id,
    proposal.anchor_user_high_id,
    coalesce(proposal.currency_code, 'COP') as currency_code,
    public.compute_happy_circle_participant_set_hash(
      array_agg(participant.participant_user_id order by participant.participant_user_id)
    ) as participant_set_hash,
    proposal.created_by_user_id,
    proposal.created_at,
    proposal.updated_at,
    proposal.status
  from public.settlement_proposals proposal
  join public.settlement_proposal_participants participant
    on participant.settlement_proposal_id = proposal.id
  where proposal.happy_circle_case_id is null
    and proposal.anchor_user_low_id is not null
    and proposal.anchor_user_high_id is not null
  group by proposal.id
),
grouped_identity as (
  select distinct on (
    anchor_user_low_id,
    anchor_user_high_id,
    currency_code,
    participant_set_hash
  )
    anchor_user_low_id,
    anchor_user_high_id,
    currency_code,
    participant_set_hash,
    first_value(created_by_user_id) over identity_window as created_by_user_id,
    min(created_at) over identity_window as created_at,
    first_value(id) over latest_window as current_proposal_id,
    first_value(status) over latest_window as latest_status,
    first_value(updated_at) over latest_window as latest_updated_at
  from proposal_identity
  window
    identity_window as (
      partition by anchor_user_low_id, anchor_user_high_id, currency_code, participant_set_hash
      order by created_at asc, id asc
      rows between unbounded preceding and unbounded following
    ),
    latest_window as (
      partition by anchor_user_low_id, anchor_user_high_id, currency_code, participant_set_hash
      order by updated_at desc, id desc
      rows between unbounded preceding and unbounded following
    )
)
insert into public.happy_circle_cases (
  anchor_user_low_id,
  anchor_user_high_id,
  currency_code,
  participant_set_hash,
  status,
  current_proposal_id,
  created_by_user_id,
  created_at,
  updated_at,
  completed_at
)
select
  grouped_identity.anchor_user_low_id,
  grouped_identity.anchor_user_high_id,
  grouped_identity.currency_code,
  grouped_identity.participant_set_hash,
  case
    when grouped_identity.latest_status = 'executed' then 'completed'::public.happy_circle_case_status
    when grouped_identity.latest_status = 'rejected' then 'closed'::public.happy_circle_case_status
    else 'active'::public.happy_circle_case_status
  end,
  grouped_identity.current_proposal_id,
  grouped_identity.created_by_user_id,
  grouped_identity.created_at,
  grouped_identity.latest_updated_at,
  case
    when grouped_identity.latest_status = 'executed' then grouped_identity.latest_updated_at
    else null
  end
from grouped_identity
where not exists (
  select 1
  from public.happy_circle_cases existing_case
  where existing_case.anchor_user_low_id = grouped_identity.anchor_user_low_id
    and existing_case.anchor_user_high_id = grouped_identity.anchor_user_high_id
    and existing_case.currency_code = grouped_identity.currency_code
    and existing_case.participant_set_hash = grouped_identity.participant_set_hash
);

with proposal_identity as (
  select
    proposal.id,
    proposal.anchor_user_low_id,
    proposal.anchor_user_high_id,
    coalesce(proposal.currency_code, 'COP') as currency_code,
    public.compute_happy_circle_participant_set_hash(
      array_agg(participant.participant_user_id order by participant.participant_user_id)
    ) as participant_set_hash,
    proposal.created_at
  from public.settlement_proposals proposal
  join public.settlement_proposal_participants participant
    on participant.settlement_proposal_id = proposal.id
  where proposal.happy_circle_case_id is null
    and proposal.anchor_user_low_id is not null
    and proposal.anchor_user_high_id is not null
  group by proposal.id
),
numbered_proposals as (
  select
    proposal_identity.*,
    row_number() over (
      partition by
        proposal_identity.anchor_user_low_id,
        proposal_identity.anchor_user_high_id,
        proposal_identity.currency_code,
        proposal_identity.participant_set_hash
      order by proposal_identity.created_at asc, proposal_identity.id asc
    ) as version_number
  from proposal_identity
)
update public.settlement_proposals proposal
set happy_circle_case_id = circle_case.id,
    version_number = numbered_proposals.version_number
from numbered_proposals
join public.happy_circle_cases circle_case
  on circle_case.anchor_user_low_id = numbered_proposals.anchor_user_low_id
 and circle_case.anchor_user_high_id = numbered_proposals.anchor_user_high_id
 and circle_case.currency_code = numbered_proposals.currency_code
 and circle_case.participant_set_hash = numbered_proposals.participant_set_hash
where proposal.id = numbered_proposals.id;

with replacement_links as (
  select
    old_proposal.id as old_proposal_id,
    new_proposal.id as new_proposal_id
  from public.graph_cycle_jobs job
  join public.settlement_proposals old_proposal
    on old_proposal.id = job.source_id
  join public.settlement_proposals new_proposal
    on new_proposal.source_graph_cycle_job_id = job.id
  where job.source_type = 'stale_settlement_proposal'
    and old_proposal.happy_circle_case_id is not null
    and old_proposal.happy_circle_case_id = new_proposal.happy_circle_case_id
)
update public.settlement_proposals old_proposal
set replaced_by_proposal_id = replacement_links.new_proposal_id,
    stale_reason = coalesce(old_proposal.stale_reason, 'balance_changed'::public.settlement_stale_reason),
    updated_at = timezone('utc', now())
from replacement_links
where old_proposal.id = replacement_links.old_proposal_id
  and old_proposal.replaced_by_proposal_id is null
  and old_proposal.status = 'stale';

with replacement_links as (
  select
    old_proposal.id as old_proposal_id,
    new_proposal.id as new_proposal_id
  from public.graph_cycle_jobs job
  join public.settlement_proposals old_proposal
    on old_proposal.id = job.source_id
  join public.settlement_proposals new_proposal
    on new_proposal.source_graph_cycle_job_id = job.id
  where job.source_type = 'stale_settlement_proposal'
    and old_proposal.happy_circle_case_id is not null
    and old_proposal.happy_circle_case_id = new_proposal.happy_circle_case_id
)
update public.settlement_proposals new_proposal
set replaces_proposal_id = replacement_links.old_proposal_id,
    updated_at = timezone('utc', now())
from replacement_links
where new_proposal.id = replacement_links.new_proposal_id
  and new_proposal.replaces_proposal_id is null;

update public.settlement_proposals
set stale_reason = 'balance_changed'::public.settlement_stale_reason
where status = 'stale'
  and stale_reason is null;

create or replace function public.mark_happy_circle_proposal_stale(
  p_actor_user_id uuid,
  p_proposal_id uuid,
  p_reason public.settlement_stale_reason default 'balance_changed'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.settlement_proposals%rowtype;
begin
  select *
    into v_proposal
  from public.settlement_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'settlement_proposal_not_found';
  end if;

  if v_proposal.status = 'stale' then
    if v_proposal.stale_reason is null then
      update public.settlement_proposals
      set stale_reason = p_reason,
          updated_at = timezone('utc', now())
      where id = p_proposal_id;
    end if;
    return;
  end if;

  if v_proposal.status not in ('pending_approvals', 'approved') then
    return;
  end if;

  update public.settlement_proposals
  set status = 'stale',
      stale_reason = p_reason,
      updated_at = timezone('utc', now())
  where id = p_proposal_id;

  perform public.append_audit_event(
    p_actor_user_id,
    'happy_circle_case',
    coalesce(v_proposal.happy_circle_case_id, p_proposal_id),
    'happy_circle_case.version_stale',
    null,
    jsonb_build_object(
      'proposal_id', p_proposal_id,
      'reason', p_reason::text,
      'version_number', v_proposal.version_number
    )
  );
end;
$$;

create or replace function public.mark_touched_settlement_proposals_stale(
  p_touched_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_proposal_id uuid;
begin
  for v_proposal_id in
    select proposal.id
    from public.settlement_proposals proposal
    where proposal.status in ('pending_approvals', 'approved')
      and exists (
        select 1
        from public.settlement_proposal_participants participant
        where participant.settlement_proposal_id = proposal.id
          and participant.participant_user_id = any(p_touched_user_ids)
      )
    order by proposal.updated_at desc, proposal.id
  loop
    perform public.mark_happy_circle_proposal_stale(
      null,
      v_proposal_id,
      'related_execution_changed_balance'::public.settlement_stale_reason
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
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
  v_existing_open_proposal public.settlement_proposals%rowtype;
  v_existing_rejected_proposal public.settlement_proposals%rowtype;
  v_response jsonb;
  v_participant_user_id uuid;
  v_participant_set_hash text;
  v_case public.happy_circle_cases%rowtype;
  v_case_id uuid;
  v_version_number integer;
  v_source_job public.graph_cycle_jobs%rowtype;
  v_old_proposal public.settlement_proposals%rowtype;
  v_replaces_proposal_id uuid;
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
        'reason', v_replacement_reason::text
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
      'replaces_proposal_id', v_replaces_proposal_id
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
      'replaces_proposal_id', v_replaces_proposal_id
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
    perform public.mark_happy_circle_proposal_stale(
      p_actor_user_id,
      p_proposal_id,
      'balance_changed'::public.settlement_stale_reason
    );

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
      'staleReason', 'balance_changed',
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

  update public.settlement_proposals
  set status = 'executed',
      stale_reason = null,
      executed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_proposal_id;

  if v_proposal.happy_circle_case_id is not null then
    update public.happy_circle_cases
    set status = 'completed',
        current_proposal_id = p_proposal_id,
        completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = v_proposal.happy_circle_case_id;

    perform public.append_audit_event(
      p_actor_user_id,
      'happy_circle_case',
      v_proposal.happy_circle_case_id,
      'happy_circle_case.version_executed',
      null,
      jsonb_build_object(
        'proposal_id', p_proposal_id,
        'execution_id', v_execution_id,
        'version_number', v_proposal.version_number
      )
    );
  end if;

  perform public.mark_touched_settlement_proposals_stale(v_participant_user_ids);

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
    'happyCircleCaseId', v_proposal.happy_circle_case_id,
    'versionNumber', v_proposal.version_number,
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

  update public.settlement_proposal_participants
  set decision = p_decision,
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
      'status', 'rejected',
      'happyCircleCaseId', v_proposal.happy_circle_case_id,
      'versionNumber', v_proposal.version_number
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
$$;

alter table public.happy_circle_cases enable row level security;

drop policy if exists happy_circle_cases_select_participant on public.happy_circle_cases;
create policy happy_circle_cases_select_participant
on public.happy_circle_cases
for select
to authenticated
using (
  exists (
    select 1
    from public.settlement_proposals proposal
    join public.settlement_proposal_participants participant
      on participant.settlement_proposal_id = proposal.id
    where proposal.happy_circle_case_id = happy_circle_cases.id
      and participant.participant_user_id = (select auth.uid())
  )
);

drop policy if exists happy_circle_cases_client_deny_write on public.happy_circle_cases;
create policy happy_circle_cases_client_deny_write
on public.happy_circle_cases
for all
to anon, authenticated
using (false)
with check (false);

grant select on public.happy_circle_cases to authenticated;

drop policy if exists audit_events_select_relevant on public.audit_events;
create policy audit_events_select_relevant
on public.audit_events
for select
to authenticated
using (
  actor_user_id = (select auth.uid())
  or (
    entity_type = 'friendship_invite'
    and exists (
      select 1
      from public.friendship_invites invite
      where invite.id = audit_events.entity_id
        and (
          (select auth.uid()) = invite.inviter_user_id
          or (select auth.uid()) = invite.target_user_id
          or (select auth.uid()) = invite.claimant_user_id
        )
    )
  )
  or (
    entity_type = 'financial_request'
    and exists (
      select 1
      from public.financial_requests fr
      where fr.id = audit_events.entity_id
        and (
          fr.creator_user_id = (select auth.uid())
          or fr.responder_user_id = (select auth.uid())
          or fr.debtor_user_id = (select auth.uid())
          or fr.creditor_user_id = (select auth.uid())
        )
    )
  )
  or (
    entity_type = 'settlement_proposal'
    and exists (
      select 1
      from public.settlement_proposal_participants spp
      where spp.settlement_proposal_id = audit_events.entity_id
        and spp.participant_user_id = (select auth.uid())
    )
  )
  or (
    entity_type = 'happy_circle_case'
    and exists (
      select 1
      from public.settlement_proposals proposal
      join public.settlement_proposal_participants participant
        on participant.settlement_proposal_id = proposal.id
      where proposal.happy_circle_case_id = audit_events.entity_id
        and participant.participant_user_id = (select auth.uid())
    )
  )
);

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
        'compute_happy_circle_participant_set_hash',
        'decide_cycle_settlement',
        'mark_happy_circle_proposal_stale',
        'mark_touched_settlement_proposals_stale',
        'propose_cycle_settlement',
        'tg_validate_settlement_proposal_lineage'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.function_signature);
    execute format('grant execute on function %s to service_role', v_function.function_signature);
  end loop;
end;
$$;
