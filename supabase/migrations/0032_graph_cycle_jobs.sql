do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'graph_cycle_job_status'
      and n.nspname = 'public'
  ) then
    create type public.graph_cycle_job_status as enum (
      'pending',
      'processing',
      'completed',
      'failed',
      'superseded'
    );
  end if;
end
$$;

create table if not exists public.graph_cycle_jobs (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (length(source_type) > 0),
  source_id uuid not null,
  actor_user_id uuid not null references public.user_profiles (id),
  anchor_user_id uuid not null references public.user_profiles (id),
  user_low_id uuid not null references public.user_profiles (id),
  user_high_id uuid not null references public.user_profiles (id),
  currency_code text not null default 'COP' check (currency_code = 'COP'),
  status public.graph_cycle_job_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  result_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  constraint graph_cycle_jobs_user_order check (user_low_id < user_high_id)
);

drop trigger if exists graph_cycle_jobs_set_updated_at on public.graph_cycle_jobs;
create trigger graph_cycle_jobs_set_updated_at
before update on public.graph_cycle_jobs
for each row
execute function public.tg_set_updated_at();

create unique index if not exists graph_cycle_jobs_source_pair_idx
  on public.graph_cycle_jobs (source_type, source_id, user_low_id, user_high_id, currency_code);

create index if not exists graph_cycle_jobs_pending_idx
  on public.graph_cycle_jobs (status, created_at)
  where status = 'pending';

create index if not exists graph_cycle_jobs_actor_idx
  on public.graph_cycle_jobs (actor_user_id, created_at desc);

alter table public.graph_cycle_jobs enable row level security;

alter table public.settlement_proposals
  add column if not exists anchor_user_low_id uuid references public.user_profiles (id),
  add column if not exists anchor_user_high_id uuid references public.user_profiles (id),
  add column if not exists currency_code text not null default 'COP' check (currency_code = 'COP'),
  add column if not exists source_graph_cycle_job_id uuid references public.graph_cycle_jobs (id);

create index if not exists settlement_proposals_anchor_status_idx
  on public.settlement_proposals (anchor_user_low_id, anchor_user_high_id, currency_code, status);

create index if not exists ledger_entries_account_idx
  on public.ledger_entries (ledger_account_id);

create index if not exists pair_net_edges_cache_debtor_idx
  on public.pair_net_edges_cache (debtor_user_id, currency_code)
  where amount_minor > 0;

create index if not exists pair_net_edges_cache_creditor_idx
  on public.pair_net_edges_cache (creditor_user_id, currency_code)
  where amount_minor > 0;

create index if not exists pair_net_edges_cache_active_pair_idx
  on public.pair_net_edges_cache (user_low_id, user_high_id, currency_code)
  where amount_minor > 0;

create or replace view public.v_user_balance_summary as
select
  up.id as user_id,
  coalesce(sum(case when edge.creditor_user_id = up.id then edge.amount_minor else 0 end), 0)
    - coalesce(sum(case when edge.debtor_user_id = up.id then edge.amount_minor else 0 end), 0) as net_balance_minor,
  coalesce(sum(case when edge.debtor_user_id = up.id then edge.amount_minor else 0 end), 0) as total_i_owe_minor,
  coalesce(sum(case when edge.creditor_user_id = up.id then edge.amount_minor else 0 end), 0) as total_owed_to_me_minor
from public.user_profiles up
left join public.pair_net_edges_cache edge
  on edge.amount_minor > 0
 and (
    edge.debtor_user_id = up.id
    or edge.creditor_user_id = up.id
 )
group by up.id;

create or replace view public.v_open_debts as
select
  relationship.id as relationship_id,
  edge.user_low_id,
  edge.user_high_id,
  edge.debtor_user_id,
  edge.creditor_user_id,
  edge.amount_minor,
  edge.currency_code
from public.relationships relationship
join public.pair_net_edges_cache edge
  on edge.user_low_id = relationship.user_low_id
 and edge.user_high_id = relationship.user_high_id
 and edge.amount_minor > 0
where relationship.status = 'active';

alter view public.v_user_balance_summary set (security_invoker = true);
alter view public.v_open_debts set (security_invoker = true);

create or replace function public.graph_pair_lock_key(
  p_left_user_id uuid,
  p_right_user_id uuid,
  p_currency_code text default 'COP'
)
returns bigint
language sql
immutable
as $$
  select hashtextextended(
    'graph_pair|' || least(p_left_user_id, p_right_user_id)::text || '|'
      || greatest(p_left_user_id, p_right_user_id)::text || '|'
      || coalesce(p_currency_code, 'COP'),
    0
  );
$$;

create or replace function public.lock_graph_pair(
  p_left_user_id uuid,
  p_right_user_id uuid,
  p_currency_code text default 'COP'
)
returns void
language sql
volatile
as $$
  select pg_advisory_xact_lock(
    public.graph_pair_lock_key(p_left_user_id, p_right_user_id, p_currency_code)
  );
$$;

create or replace function public.compute_graph_component_snapshot(
  p_left_user_id uuid,
  p_right_user_id uuid,
  p_currency_code text default 'COP'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recursive anchor as (
    select
      user_low_id,
      user_high_id,
      debtor_user_id,
      creditor_user_id,
      amount_minor,
      currency_code
    from public.pair_net_edges_cache
    where user_low_id = least(p_left_user_id, p_right_user_id)
      and user_high_id = greatest(p_left_user_id, p_right_user_id)
      and currency_code = coalesce(p_currency_code, 'COP')
      and amount_minor > 0
      and debtor_user_id is not null
      and creditor_user_id is not null
    limit 1
  ),
  component(user_id) as (
    select debtor_user_id from anchor
    union
    select creditor_user_id from anchor
    union
    select
      case
        when edge.user_low_id = component.user_id then edge.user_high_id
        else edge.user_low_id
      end
    from component
    join public.pair_net_edges_cache edge
      on edge.currency_code = coalesce(p_currency_code, 'COP')
     and edge.amount_minor > 0
     and (
        edge.user_low_id = component.user_id
        or edge.user_high_id = component.user_id
     )
  ),
  component_edges as (
    select
      edge.user_low_id,
      edge.user_high_id,
      edge.debtor_user_id,
      edge.creditor_user_id,
      edge.amount_minor,
      edge.currency_code
    from public.pair_net_edges_cache edge
    where edge.currency_code = coalesce(p_currency_code, 'COP')
      and edge.amount_minor > 0
      and edge.debtor_user_id in (select user_id from component)
      and edge.creditor_user_id in (select user_id from component)
  ),
  normalized as (
    select
      debtor_user_id::text as debtor_user_id,
      creditor_user_id::text as creditor_user_id,
      amount_minor::text as amount_minor,
      jsonb_build_object(
        'user_low_id', user_low_id,
        'user_high_id', user_high_id,
        'debtor_user_id', debtor_user_id,
        'creditor_user_id', creditor_user_id,
        'amount_minor', amount_minor,
        'currency_code', currency_code
      ) as edge_json
    from component_edges
  )
  select
    case
      when not exists (select 1 from anchor) then
        jsonb_build_object(
          'status', 'no_anchor_edge',
          'graphSnapshotHash', null,
          'graphSnapshot', '[]'::jsonb,
          'anchorEdge', null
        )
      else
        jsonb_build_object(
          'status', 'ok',
          'graphSnapshotHash', (
            select encode(
              extensions.digest(
                coalesce(
                  string_agg(
                    debtor_user_id || '|' || creditor_user_id || '|' || amount_minor,
                    ';'
                    order by debtor_user_id, creditor_user_id, amount_minor
                  ),
                  ''
                ),
                'sha256'
              ),
              'hex'
            )
            from normalized
          ),
          'graphSnapshot', coalesce(
            (
              select jsonb_agg(edge_json order by debtor_user_id, creditor_user_id, amount_minor)
              from normalized
            ),
            '[]'::jsonb
          ),
          'anchorEdge', (
            select jsonb_build_object(
              'user_low_id', user_low_id,
              'user_high_id', user_high_id,
              'debtor_user_id', debtor_user_id,
              'creditor_user_id', creditor_user_id,
              'amount_minor', amount_minor,
              'currency_code', currency_code
            )
            from anchor
          )
        )
    end;
$$;

create or replace function public.compute_graph_component_snapshot_hash(
  p_left_user_id uuid,
  p_right_user_id uuid,
  p_currency_code text default 'COP'
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.compute_graph_component_snapshot(
    p_left_user_id,
    p_right_user_id,
    coalesce(p_currency_code, 'COP')
  ) ->> 'graphSnapshotHash';
$$;

create or replace function public.compute_graph_snapshot_hash()
returns text
language sql
security definer
set search_path = public
as $$
  with ordered_edges as (
    select
      debtor_user_id::text as debtor_user_id,
      creditor_user_id::text as creditor_user_id,
      amount_minor::text as amount_minor
    from public.pair_net_edges_cache
    where amount_minor > 0
      and debtor_user_id is not null
      and creditor_user_id is not null
    order by debtor_user_id, creditor_user_id, amount_minor
  )
  select encode(
    extensions.digest(
      coalesce(
        string_agg(
          debtor_user_id || '|' || creditor_user_id || '|' || amount_minor,
          ';'
          order by debtor_user_id, creditor_user_id, amount_minor
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  )
  from ordered_edges;
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
  v_count integer;
begin
  update public.settlement_proposals proposal
  set status = 'stale',
      updated_at = timezone('utc', now())
  where proposal.status in ('pending_approvals', 'approved')
    and exists (
      select 1
      from public.settlement_proposal_participants participant
      where participant.settlement_proposal_id = proposal.id
        and participant.participant_user_id = any(p_touched_user_ids)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.enqueue_graph_cycle_job(
  p_source_type text,
  p_source_id uuid,
  p_actor_user_id uuid,
  p_anchor_user_id uuid,
  p_left_user_id uuid,
  p_right_user_id uuid,
  p_currency_code text default 'COP'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low_id uuid;
  v_high_id uuid;
  v_existing_edge public.pair_net_edges_cache%rowtype;
  v_job public.graph_cycle_jobs%rowtype;
begin
  if p_left_user_id = p_right_user_id then
    raise exception 'invalid_graph_cycle_anchor';
  end if;

  v_low_id := least(p_left_user_id, p_right_user_id);
  v_high_id := greatest(p_left_user_id, p_right_user_id);

  select *
    into v_existing_edge
  from public.pair_net_edges_cache
  where user_low_id = v_low_id
    and user_high_id = v_high_id
    and currency_code = coalesce(p_currency_code, 'COP')
    and amount_minor > 0;

  if not found then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_anchor_edge'
    );
  end if;

  insert into public.graph_cycle_jobs (
    source_type,
    source_id,
    actor_user_id,
    anchor_user_id,
    user_low_id,
    user_high_id,
    currency_code,
    status
  )
  values (
    p_source_type,
    p_source_id,
    p_actor_user_id,
    p_anchor_user_id,
    v_low_id,
    v_high_id,
    coalesce(p_currency_code, 'COP'),
    'pending'
  )
  on conflict (source_type, source_id, user_low_id, user_high_id, currency_code)
  do update set
    actor_user_id = excluded.actor_user_id,
    anchor_user_id = excluded.anchor_user_id,
    status = case
      when public.graph_cycle_jobs.status in ('failed', 'superseded') then 'pending'::public.graph_cycle_job_status
      else public.graph_cycle_jobs.status
    end,
    last_error = case
      when public.graph_cycle_jobs.status in ('failed', 'superseded') then null
      else public.graph_cycle_jobs.last_error
    end,
    processed_at = case
      when public.graph_cycle_jobs.status in ('failed', 'superseded') then null
      else public.graph_cycle_jobs.processed_at
    end
  returning * into v_job;

  return jsonb_build_object(
    'status', case
      when v_job.status in ('pending', 'processing') then 'queued'
      else v_job.status::text
    end,
    'jobId', v_job.id
  );
end;
$$;

create or replace function public.enqueue_manual_graph_cycle_job(
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_edge public.pair_net_edges_cache%rowtype;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'enqueue_manual_graph_cycle_job', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'enqueue_manual_graph_cycle_job'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_edge
  from public.pair_net_edges_cache
  where amount_minor > 0
    and currency_code = 'COP'
    and (
      debtor_user_id = p_actor_user_id
      or creditor_user_id = p_actor_user_id
    )
  order by amount_minor desc, user_low_id, user_high_id
  limit 1;

  if not found then
    v_response := jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_anchor_edge'
    );
  else
    v_response := public.enqueue_graph_cycle_job(
      'manual_scan',
      v_idempotency.id,
      p_actor_user_id,
      p_actor_user_id,
      v_edge.user_low_id,
      v_edge.user_high_id,
      v_edge.currency_code
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
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
      last_error = null
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

create or replace function public.get_graph_cycle_job_context(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.graph_cycle_jobs%rowtype;
  v_snapshot jsonb;
begin
  select *
    into v_job
  from public.graph_cycle_jobs
  where id = p_job_id;

  if not found then
    raise exception 'graph_cycle_job_not_found';
  end if;

  v_snapshot := public.compute_graph_component_snapshot(
    v_job.user_low_id,
    v_job.user_high_id,
    v_job.currency_code
  );

  return jsonb_build_object(
    'job', jsonb_build_object(
      'id', v_job.id,
      'actorUserId', v_job.actor_user_id,
      'anchorUserId', v_job.anchor_user_id,
      'userLowId', v_job.user_low_id,
      'userHighId', v_job.user_high_id,
      'currencyCode', v_job.currency_code,
      'attempts', v_job.attempts
    ),
    'context', v_snapshot
  );
end;
$$;

create or replace function public.complete_graph_cycle_job(
  p_job_id uuid,
  p_result_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.graph_cycle_jobs%rowtype;
begin
  update public.graph_cycle_jobs
  set status = 'completed',
      result_json = p_result_json,
      processed_at = timezone('utc', now()),
      locked_at = null,
      locked_by = null,
      last_error = null
  where id = p_job_id
  returning * into v_job;

  if not found then
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
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.graph_cycle_jobs%rowtype;
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
      end
  where id = p_job_id
  returning * into v_job;

  if not found then
    raise exception 'graph_cycle_job_not_found';
  end if;

  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'attempts', v_job.attempts
  );
end;
$$;

create or replace function public.supersede_graph_cycle_job(
  p_job_id uuid,
  p_result_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.graph_cycle_jobs%rowtype;
begin
  update public.graph_cycle_jobs
  set status = 'superseded',
      result_json = p_result_json,
      processed_at = timezone('utc', now()),
      locked_at = null,
      locked_by = null
  where id = p_job_id
  returning * into v_job;

  if not found then
    raise exception 'graph_cycle_job_not_found';
  end if;

  return jsonb_build_object(
    'jobId', v_job.id,
    'status', v_job.status,
    'result', v_job.result_json
  );
end;
$$;

drop function if exists public.propose_cycle_settlement(uuid, text, text, jsonb, jsonb, uuid[]);

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

  if jsonb_typeof(p_movements_json) <> 'array' or jsonb_array_length(p_movements_json) = 0 then
    raise exception 'invalid_settlement_movements';
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
  v_recovery_job jsonb;
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
  where settlement_proposal_id = p_proposal_id
    and participant_user_id = p_actor_user_id;

  if not found then
    raise exception 'settlement_participant_not_found';
  end if;

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
      set status = 'approved',
          updated_at = timezone('utc', now())
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
  v_auto_cycle_job jsonb;
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
  v_pair record;
  v_transaction_id uuid;
  v_debtor_payable_account_id uuid;
  v_creditor_receivable_account_id uuid;
  v_current_hash text;
  v_next_jobs jsonb := '[]'::jsonb;
  v_job jsonb;
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

    v_response := jsonb_build_object(
      'proposalId', p_proposal_id,
      'status', 'stale',
      'nextAutoCycleJob', v_job
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

    v_job := public.enqueue_graph_cycle_job(
      'cycle_settlement_executed',
      p_proposal_id,
      p_actor_user_id,
      p_actor_user_id,
      (v_movement ->> 'debtor_user_id')::uuid,
      (v_movement ->> 'creditor_user_id')::uuid,
      'COP'
    );

    if v_job ->> 'status' = 'queued' then
      v_next_jobs := v_next_jobs || jsonb_build_array(v_job);
    end if;
  end loop;

  perform public.mark_touched_settlement_proposals_stale(
    (
      select array_agg(distinct participant_user_id)
      from public.settlement_proposal_participants
      where settlement_proposal_id = p_proposal_id
    )
  );

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

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;
