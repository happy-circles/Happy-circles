do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'settlement_edge_reservation_status'
  ) then
    create type public.settlement_edge_reservation_status as enum (
      'active',
      'released',
      'consumed'
    );
  end if;
end
$$;

create table if not exists public.settlement_edge_reservations (
  id uuid primary key default gen_random_uuid(),
  settlement_proposal_id uuid not null references public.settlement_proposals (id) on delete cascade,
  movement_index integer not null check (movement_index > 0),
  user_low_id uuid not null references public.user_profiles (id),
  user_high_id uuid not null references public.user_profiles (id),
  debtor_user_id uuid not null references public.user_profiles (id),
  creditor_user_id uuid not null references public.user_profiles (id),
  currency_code text not null default 'COP' check (currency_code = 'COP'),
  amount_minor bigint not null check (amount_minor > 0),
  status public.settlement_edge_reservation_status not null default 'active',
  release_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  released_at timestamptz,
  consumed_at timestamptz,
  constraint settlement_edge_reservations_pair_order_chk check (user_low_id < user_high_id),
  constraint settlement_edge_reservations_direction_chk check (
    debtor_user_id <> creditor_user_id
    and user_low_id = least(debtor_user_id, creditor_user_id)
    and user_high_id = greatest(debtor_user_id, creditor_user_id)
  ),
  constraint settlement_edge_reservations_status_timestamps_chk check (
    (status = 'active' and released_at is null and consumed_at is null)
    or (status = 'released' and released_at is not null and consumed_at is null)
    or (status = 'consumed' and consumed_at is not null and released_at is null)
  )
);

create unique index if not exists settlement_edge_reservations_active_movement_idx
  on public.settlement_edge_reservations (settlement_proposal_id, movement_index)
  where status = 'active';

create index if not exists settlement_edge_reservations_active_edge_idx
  on public.settlement_edge_reservations (
    currency_code,
    user_low_id,
    user_high_id,
    debtor_user_id,
    creditor_user_id,
    created_at,
    id
  )
  where status = 'active';

create index if not exists settlement_edge_reservations_proposal_idx
  on public.settlement_edge_reservations (settlement_proposal_id, status, created_at);

alter table public.settlement_edge_reservations enable row level security;

revoke all on public.settlement_edge_reservations from public, anon, authenticated;
grant all on public.settlement_edge_reservations to service_role;

drop index if exists public.settlement_proposals_one_open_per_graph_idx;

create index if not exists settlement_proposals_open_result_hash_idx
  on public.settlement_proposals (result_hash, status, created_at desc)
  where status in ('pending_approvals', 'approved')
    and result_hash is not null;

create or replace function public.cycle_settlement_reservation_rows(
  p_movements_json jsonb,
  p_currency_code text default 'COP'
)
returns table (
  movement_index integer,
  user_low_id uuid,
  user_high_id uuid,
  debtor_user_id uuid,
  creditor_user_id uuid,
  currency_code text,
  amount_minor bigint
)
language sql
stable
set search_path = public
as $$
  select
    movement.ordinality::integer as movement_index,
    least(
      (movement.value ->> 'creditor_user_id')::uuid,
      (movement.value ->> 'debtor_user_id')::uuid
    ) as user_low_id,
    greatest(
      (movement.value ->> 'creditor_user_id')::uuid,
      (movement.value ->> 'debtor_user_id')::uuid
    ) as user_high_id,
    (movement.value ->> 'creditor_user_id')::uuid as debtor_user_id,
    (movement.value ->> 'debtor_user_id')::uuid as creditor_user_id,
    coalesce(nullif(p_currency_code, ''), 'COP') as currency_code,
    (movement.value ->> 'amount_minor')::bigint as amount_minor
  from jsonb_array_elements(coalesce(p_movements_json, '[]'::jsonb)) with ordinality as movement(value, ordinality)
  where jsonb_typeof(movement.value) = 'object';
$$;

create or replace function public.active_settlement_edge_reservations()
returns table (
  id uuid,
  settlement_proposal_id uuid,
  movement_index integer,
  user_low_id uuid,
  user_high_id uuid,
  debtor_user_id uuid,
  creditor_user_id uuid,
  currency_code text,
  amount_minor bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    reservation.id,
    reservation.settlement_proposal_id,
    reservation.movement_index,
    reservation.user_low_id,
    reservation.user_high_id,
    reservation.debtor_user_id,
    reservation.creditor_user_id,
    reservation.currency_code,
    reservation.amount_minor,
    reservation.created_at
  from public.settlement_edge_reservations reservation
  join public.settlement_proposals proposal
    on proposal.id = reservation.settlement_proposal_id
   and proposal.status in ('pending_approvals', 'approved')
  where reservation.status = 'active';
$$;

create or replace function public.release_cycle_settlement_reservations(
  p_proposal_id uuid,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.settlement_edge_reservations
  set status = 'released',
      release_reason = left(coalesce(p_reason, 'released'), 200),
      released_at = timezone('utc', now())
  where settlement_proposal_id = p_proposal_id
    and status = 'active';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.consume_cycle_settlement_reservations(
  p_proposal_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.settlement_edge_reservations
  set status = 'consumed',
      consumed_at = timezone('utc', now())
  where settlement_proposal_id = p_proposal_id
    and status = 'active';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.tg_release_settlement_reservations_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('pending_approvals', 'approved')
    and old.status in ('pending_approvals', 'approved') then
    perform public.release_cycle_settlement_reservations(
      new.id,
      'proposal_status_' || new.status::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists release_settlement_reservations_on_status on public.settlement_proposals;
create trigger release_settlement_reservations_on_status
after update of status on public.settlement_proposals
for each row
when (old.status is distinct from new.status)
execute function public.tg_release_settlement_reservations_on_status();

create or replace function public.compute_available_graph_component_snapshot(
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
  with recursive reserved as (
    select
      reservation.debtor_user_id,
      reservation.creditor_user_id,
      reservation.currency_code,
      sum(reservation.amount_minor)::bigint as amount_minor
    from public.active_settlement_edge_reservations() reservation
    group by reservation.debtor_user_id, reservation.creditor_user_id, reservation.currency_code
  ),
  available_edges as (
    select
      edge.user_low_id,
      edge.user_high_id,
      edge.debtor_user_id,
      edge.creditor_user_id,
      (edge.amount_minor - coalesce(reserved.amount_minor, 0))::bigint as amount_minor,
      edge.currency_code
    from public.pair_net_edges_cache edge
    left join reserved
      on reserved.debtor_user_id = edge.debtor_user_id
     and reserved.creditor_user_id = edge.creditor_user_id
     and reserved.currency_code = edge.currency_code
    where edge.currency_code = coalesce(nullif(p_currency_code, ''), 'COP')
      and edge.amount_minor > 0
      and edge.debtor_user_id is not null
      and edge.creditor_user_id is not null
      and edge.amount_minor - coalesce(reserved.amount_minor, 0) > 0
  ),
  recursive_anchor as (
    select
      user_low_id,
      user_high_id,
      debtor_user_id,
      creditor_user_id,
      amount_minor,
      currency_code
    from available_edges
    where user_low_id = least(p_left_user_id, p_right_user_id)
      and user_high_id = greatest(p_left_user_id, p_right_user_id)
    limit 1
  ),
  component(user_id) as (
    select debtor_user_id from recursive_anchor
    union
    select creditor_user_id from recursive_anchor
    union
    select
      case
        when edge.user_low_id = component.user_id then edge.user_high_id
        else edge.user_low_id
      end
    from component
    join available_edges edge
      on edge.user_low_id = component.user_id
      or edge.user_high_id = component.user_id
  ),
  component_edges as (
    select
      edge.user_low_id,
      edge.user_high_id,
      edge.debtor_user_id,
      edge.creditor_user_id,
      edge.amount_minor,
      edge.currency_code
    from available_edges edge
    where edge.debtor_user_id in (select user_id from component)
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
      when not exists (select 1 from recursive_anchor) then
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
            from recursive_anchor
          )
        )
    end;
$$;

create or replace function public.compute_available_graph_component_snapshot_hash(
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
  select public.compute_available_graph_component_snapshot(
    p_left_user_id,
    p_right_user_id,
    coalesce(nullif(p_currency_code, ''), 'COP')
  ) ->> 'graphSnapshotHash';
$$;

create or replace function public.compute_available_graph_snapshot_hash()
returns text
language sql
stable
security definer
set search_path = public
as $$
  with reserved as (
    select
      reservation.debtor_user_id,
      reservation.creditor_user_id,
      reservation.currency_code,
      sum(reservation.amount_minor)::bigint as amount_minor
    from public.active_settlement_edge_reservations() reservation
    group by reservation.debtor_user_id, reservation.creditor_user_id, reservation.currency_code
  ),
  ordered_edges as (
    select
      edge.debtor_user_id::text as debtor_user_id,
      edge.creditor_user_id::text as creditor_user_id,
      (edge.amount_minor - coalesce(reserved.amount_minor, 0))::text as amount_minor
    from public.pair_net_edges_cache edge
    left join reserved
      on reserved.debtor_user_id = edge.debtor_user_id
     and reserved.creditor_user_id = edge.creditor_user_id
     and reserved.currency_code = edge.currency_code
    where edge.amount_minor > 0
      and edge.debtor_user_id is not null
      and edge.creditor_user_id is not null
      and edge.amount_minor - coalesce(reserved.amount_minor, 0) > 0
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

create or replace function public.lock_cycle_settlement_reservation_pairs(
  p_movements_json jsonb,
  p_currency_code text default 'COP',
  p_extra_proposal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct user_low_id, user_high_id, currency_code
    from (
      select
        row_data.user_low_id,
        row_data.user_high_id,
        row_data.currency_code
      from public.cycle_settlement_reservation_rows(
        p_movements_json,
        coalesce(nullif(p_currency_code, ''), 'COP')
      ) row_data
      union
      select
        reservation.user_low_id,
        reservation.user_high_id,
        reservation.currency_code
      from public.settlement_edge_reservations reservation
      where reservation.settlement_proposal_id = p_extra_proposal_id
        and reservation.status = 'active'
    ) pairs
    order by user_low_id, user_high_id, currency_code
  loop
    perform public.lock_graph_pair(v_pair.user_low_id, v_pair.user_high_id, v_pair.currency_code);
  end loop;
end;
$$;

create or replace function public.validate_cycle_reservation_capacity(
  p_movements_json jsonb,
  p_currency_code text default 'COP',
  p_exclude_proposal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_current_amount_minor bigint;
  v_reserved_amount_minor bigint;
begin
  for v_request in
    select
      row_data.user_low_id,
      row_data.user_high_id,
      row_data.debtor_user_id,
      row_data.creditor_user_id,
      row_data.currency_code,
      sum(row_data.amount_minor)::bigint as amount_minor
    from public.cycle_settlement_reservation_rows(
      p_movements_json,
      coalesce(nullif(p_currency_code, ''), 'COP')
    ) row_data
    group by
      row_data.user_low_id,
      row_data.user_high_id,
      row_data.debtor_user_id,
      row_data.creditor_user_id,
      row_data.currency_code
  loop
    select coalesce(edge.amount_minor, 0)
      into v_current_amount_minor
    from public.pair_net_edges_cache edge
    where edge.user_low_id = v_request.user_low_id
      and edge.user_high_id = v_request.user_high_id
      and edge.debtor_user_id = v_request.debtor_user_id
      and edge.creditor_user_id = v_request.creditor_user_id
      and edge.currency_code = v_request.currency_code;

    v_current_amount_minor := coalesce(v_current_amount_minor, 0);

    select coalesce(sum(reservation.amount_minor), 0)::bigint
      into v_reserved_amount_minor
    from public.active_settlement_edge_reservations() reservation
    where reservation.user_low_id = v_request.user_low_id
      and reservation.user_high_id = v_request.user_high_id
      and reservation.debtor_user_id = v_request.debtor_user_id
      and reservation.creditor_user_id = v_request.creditor_user_id
      and reservation.currency_code = v_request.currency_code
      and (
        p_exclude_proposal_id is null
        or reservation.settlement_proposal_id <> p_exclude_proposal_id
      );

    if v_request.amount_minor > v_current_amount_minor - v_reserved_amount_minor then
      raise exception 'cycle_reserved_capacity_exceeded';
    end if;
  end loop;
end;
$$;

create or replace function public.reserve_cycle_settlement_edges(
  p_proposal_id uuid,
  p_movements_json jsonb,
  p_currency_code text default 'COP',
  p_replaces_proposal_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.lock_cycle_settlement_reservation_pairs(
    p_movements_json,
    coalesce(nullif(p_currency_code, ''), 'COP'),
    p_replaces_proposal_id
  );

  perform public.validate_cycle_reservation_capacity(
    p_movements_json,
    coalesce(nullif(p_currency_code, ''), 'COP'),
    p_replaces_proposal_id
  );

  if p_replaces_proposal_id is not null then
    perform public.release_cycle_settlement_reservations(
      p_replaces_proposal_id,
      'replaced_by_' || p_proposal_id::text
    );
  end if;

  perform public.release_cycle_settlement_reservations(
    p_proposal_id,
    're_reserved'
  );

  insert into public.settlement_edge_reservations (
    settlement_proposal_id,
    movement_index,
    user_low_id,
    user_high_id,
    debtor_user_id,
    creditor_user_id,
    currency_code,
    amount_minor
  )
  select
    p_proposal_id,
    row_data.movement_index,
    row_data.user_low_id,
    row_data.user_high_id,
    row_data.debtor_user_id,
    row_data.creditor_user_id,
    row_data.currency_code,
    row_data.amount_minor
  from public.cycle_settlement_reservation_rows(
    p_movements_json,
    coalesce(nullif(p_currency_code, ''), 'COP')
  ) row_data;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.enqueue_graph_cycle_jobs_for_proposal_reservations(
  p_source_type text,
  p_source_id uuid,
  p_actor_user_id uuid,
  p_anchor_user_id uuid,
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation record;
  v_job jsonb;
  v_jobs jsonb := '[]'::jsonb;
begin
  for v_reservation in
    select distinct
      reservation.user_low_id,
      reservation.user_high_id,
      reservation.currency_code
    from public.settlement_edge_reservations reservation
    where reservation.settlement_proposal_id = p_proposal_id
    order by reservation.user_low_id, reservation.user_high_id, reservation.currency_code
  loop
    v_job := public.enqueue_graph_cycle_job(
      p_source_type,
      p_source_id,
      p_actor_user_id,
      p_anchor_user_id,
      v_reservation.user_low_id,
      v_reservation.user_high_id,
      v_reservation.currency_code
    );

    if v_job ->> 'status' = 'queued' then
      v_jobs := v_jobs || jsonb_build_array(v_job);
    end if;
  end loop;

  return v_jobs;
end;
$$;

create or replace function public.reconcile_pair_reservation_capacity(
  p_user_low_id uuid,
  p_user_high_id uuid,
  p_currency_code text default 'COP'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation record;
  v_current_debtor_user_id uuid;
  v_current_creditor_user_id uuid;
  v_current_amount_minor bigint := 0;
  v_group_debtor_user_id uuid;
  v_group_creditor_user_id uuid;
  v_group_capacity_minor bigint := 0;
  v_running_amount_minor bigint := 0;
  v_staled_proposal_ids uuid[] := '{}'::uuid[];
  v_count integer := 0;
begin
  perform public.lock_graph_pair(
    p_user_low_id,
    p_user_high_id,
    coalesce(nullif(p_currency_code, ''), 'COP')
  );

  select
    edge.debtor_user_id,
    edge.creditor_user_id,
    edge.amount_minor
    into v_current_debtor_user_id,
         v_current_creditor_user_id,
         v_current_amount_minor
  from public.pair_net_edges_cache edge
  where edge.user_low_id = p_user_low_id
    and edge.user_high_id = p_user_high_id
    and edge.currency_code = coalesce(nullif(p_currency_code, ''), 'COP');

  v_current_amount_minor := coalesce(v_current_amount_minor, 0);

  for v_reservation in
    select *
    from public.active_settlement_edge_reservations() reservation
    where reservation.user_low_id = p_user_low_id
      and reservation.user_high_id = p_user_high_id
      and reservation.currency_code = coalesce(nullif(p_currency_code, ''), 'COP')
    order by
      reservation.debtor_user_id,
      reservation.creditor_user_id,
      reservation.created_at,
      reservation.id
  loop
    if v_reservation.settlement_proposal_id = any(v_staled_proposal_ids) then
      continue;
    end if;

    if v_group_debtor_user_id is distinct from v_reservation.debtor_user_id
      or v_group_creditor_user_id is distinct from v_reservation.creditor_user_id then
      v_group_debtor_user_id := v_reservation.debtor_user_id;
      v_group_creditor_user_id := v_reservation.creditor_user_id;
      v_running_amount_minor := 0;

      if v_current_debtor_user_id = v_group_debtor_user_id
        and v_current_creditor_user_id = v_group_creditor_user_id then
        v_group_capacity_minor := v_current_amount_minor;
      else
        v_group_capacity_minor := 0;
      end if;
    end if;

    if v_running_amount_minor + v_reservation.amount_minor <= v_group_capacity_minor then
      v_running_amount_minor := v_running_amount_minor + v_reservation.amount_minor;
    else
      perform public.mark_happy_circle_proposal_stale(
        null,
        v_reservation.settlement_proposal_id,
        'reserved_capacity_lost'::public.settlement_stale_reason
      );
      v_staled_proposal_ids := array_append(
        v_staled_proposal_ids,
        v_reservation.settlement_proposal_id
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.reconcile_all_reservation_capacity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
  v_count integer := 0;
begin
  for v_pair in
    select distinct user_low_id, user_high_id, currency_code
    from public.active_settlement_edge_reservations()
    order by user_low_id, user_high_id, currency_code
  loop
    v_count := v_count + public.reconcile_pair_reservation_capacity(
      v_pair.user_low_id,
      v_pair.user_high_id,
      v_pair.currency_code
    );
  end loop;

  return v_count;
end;
$$;

create or replace function public.reconcile_touched_reservation_capacity(
  p_touched_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
  v_count integer := 0;
begin
  if p_touched_user_ids is null or cardinality(p_touched_user_ids) = 0 then
    return 0;
  end if;

  for v_pair in
    select distinct user_low_id, user_high_id, currency_code
    from public.active_settlement_edge_reservations() reservation
    where reservation.debtor_user_id = any(p_touched_user_ids)
       or reservation.creditor_user_id = any(p_touched_user_ids)
    order by user_low_id, user_high_id, currency_code
  loop
    v_count := v_count + public.reconcile_pair_reservation_capacity(
      v_pair.user_low_id,
      v_pair.user_high_id,
      v_pair.currency_code
    );
  end loop;

  return v_count;
end;
$$;

create or replace function public.validate_cycle_reservation_capacity_for_execution(
  p_proposal_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal public.settlement_proposals%rowtype;
  v_expected_count integer;
  v_active_count integer;
  v_mismatch_count integer;
  v_pair record;
begin
  select *
    into v_proposal
  from public.settlement_proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'settlement_proposal_not_found';
  end if;

  v_expected_count := jsonb_array_length(v_proposal.movements_json);

  select count(*)::integer
    into v_active_count
  from public.settlement_edge_reservations
  where settlement_proposal_id = p_proposal_id
    and status = 'active';

  if v_active_count <> v_expected_count then
    return false;
  end if;

  select count(*)::integer
    into v_mismatch_count
  from (
    select
      row_data.movement_index,
      row_data.user_low_id,
      row_data.user_high_id,
      row_data.debtor_user_id,
      row_data.creditor_user_id,
      row_data.currency_code,
      row_data.amount_minor
    from public.cycle_settlement_reservation_rows(
      v_proposal.movements_json,
      v_proposal.currency_code
    ) row_data
    except
    select
      reservation.movement_index,
      reservation.user_low_id,
      reservation.user_high_id,
      reservation.debtor_user_id,
      reservation.creditor_user_id,
      reservation.currency_code,
      reservation.amount_minor
    from public.settlement_edge_reservations reservation
    where reservation.settlement_proposal_id = p_proposal_id
      and reservation.status = 'active'
  ) mismatches;

  if v_mismatch_count > 0 then
    return false;
  end if;

  for v_pair in
    select distinct user_low_id, user_high_id, currency_code
    from public.settlement_edge_reservations
    where settlement_proposal_id = p_proposal_id
      and status = 'active'
    order by user_low_id, user_high_id, currency_code
  loop
    perform public.reconcile_pair_reservation_capacity(
      v_pair.user_low_id,
      v_pair.user_high_id,
      v_pair.currency_code
    );
  end loop;

  select *
    into v_proposal
  from public.settlement_proposals
  where id = p_proposal_id;

  if v_proposal.status not in ('pending_approvals', 'approved') then
    return false;
  end if;

  select count(*)::integer
    into v_active_count
  from public.settlement_edge_reservations
  where settlement_proposal_id = p_proposal_id
    and status = 'active';

  return v_active_count = v_expected_count;
end;
$$;

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

    perform public.release_cycle_settlement_reservations(
      p_proposal_id,
      coalesce(p_reason::text, 'stale')
    );
    return;
  end if;

  if v_proposal.status not in ('pending_approvals', 'approved') then
    perform public.release_cycle_settlement_reservations(
      p_proposal_id,
      'proposal_status_' || v_proposal.status::text
    );
    return;
  end if;

  update public.settlement_proposals
  set status = 'stale',
      stale_reason = p_reason,
      updated_at = timezone('utc', now())
  where id = p_proposal_id;

  perform public.release_cycle_settlement_reservations(
    p_proposal_id,
    coalesce(p_reason::text, 'stale')
  );

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
  v_count := v_count + public.reconcile_touched_reservation_capacity(p_touched_user_ids);

  for v_proposal_id in
    select proposal.id
    from public.settlement_proposals proposal
    where proposal.status in ('pending_approvals', 'approved')
      and not exists (
        select 1
        from public.settlement_edge_reservations reservation
        where reservation.settlement_proposal_id = proposal.id
      )
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

  for v_proposal_id in
    select proposal.id
    from public.settlement_proposals proposal
    where proposal.status in ('pending_approvals', 'approved')
      and exists (
        select 1
        from public.settlement_edge_reservations reservation
        where reservation.settlement_proposal_id = proposal.id
      )
      and not exists (
        select 1
        from public.settlement_edge_reservations reservation
        where reservation.settlement_proposal_id = proposal.id
          and reservation.status = 'active'
      )
    order by proposal.updated_at desc, proposal.id
  loop
    perform public.mark_happy_circle_proposal_stale(
      null,
      v_proposal_id,
      'reserved_capacity_lost'::public.settlement_stale_reason
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.mark_outdated_settlement_proposals_stale(
  p_current_graph_snapshot_hash text
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
  v_count := v_count + public.reconcile_all_reservation_capacity();

  for v_proposal_id in
    select proposal.id
    from public.settlement_proposals proposal
    where proposal.status in ('pending_approvals', 'approved')
      and proposal.graph_snapshot_hash <> p_current_graph_snapshot_hash
      and not exists (
        select 1
        from public.settlement_edge_reservations reservation
        where reservation.settlement_proposal_id = proposal.id
      )
    order by proposal.updated_at desc, proposal.id
  loop
    perform public.mark_happy_circle_proposal_stale(
      null,
      v_proposal_id,
      'balance_changed'::public.settlement_stale_reason
    );
    v_count := v_count + 1;
  end loop;

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
  v_snapshot jsonb;
  v_job public.graph_cycle_jobs%rowtype;
begin
  if p_left_user_id = p_right_user_id then
    raise exception 'invalid_graph_cycle_anchor';
  end if;

  v_low_id := least(p_left_user_id, p_right_user_id);
  v_high_id := greatest(p_left_user_id, p_right_user_id);

  v_snapshot := public.compute_available_graph_component_snapshot(
    v_low_id,
    v_high_id,
    coalesce(nullif(p_currency_code, ''), 'COP')
  );

  if v_snapshot ->> 'status' <> 'ok' then
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
    coalesce(nullif(p_currency_code, ''), 'COP'),
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
  v_edge record;
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

  with reserved as (
    select
      reservation.debtor_user_id,
      reservation.creditor_user_id,
      reservation.currency_code,
      sum(reservation.amount_minor)::bigint as amount_minor
    from public.active_settlement_edge_reservations() reservation
    group by reservation.debtor_user_id, reservation.creditor_user_id, reservation.currency_code
  )
  select
    edge.user_low_id,
    edge.user_high_id,
    edge.debtor_user_id,
    edge.creditor_user_id,
    edge.currency_code,
    (edge.amount_minor - coalesce(reserved.amount_minor, 0))::bigint as amount_minor
    into v_edge
  from public.pair_net_edges_cache edge
  left join reserved
    on reserved.debtor_user_id = edge.debtor_user_id
   and reserved.creditor_user_id = edge.creditor_user_id
   and reserved.currency_code = edge.currency_code
  where edge.amount_minor > 0
    and edge.currency_code = 'COP'
    and edge.amount_minor - coalesce(reserved.amount_minor, 0) > 0
    and (
      edge.debtor_user_id = p_actor_user_id
      or edge.creditor_user_id = p_actor_user_id
    )
  order by amount_minor desc, edge.user_low_id, edge.user_high_id
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

  v_snapshot := public.compute_available_graph_component_snapshot(
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
  v_residual_jobs jsonb := '[]'::jsonb;
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
    v_current_hash := public.compute_available_graph_component_snapshot_hash(
      p_anchor_user_low_id,
      p_anchor_user_high_id,
      coalesce(nullif(p_currency_code, ''), 'COP')
    );
  else
    v_current_hash := public.compute_available_graph_snapshot_hash();
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
    coalesce(nullif(p_currency_code, ''), 'COP')
  );

  v_participant_set_hash := public.compute_happy_circle_participant_set_hash(
    p_participant_user_ids
  );
  v_result_hash := public.compute_settlement_result_hash(
    p_movements_json,
    p_participant_user_ids,
    coalesce(nullif(p_currency_code, ''), 'COP')
  );

  perform pg_advisory_xact_lock(hashtextextended('settlement_result|' || v_result_hash, 0));

  select *
    into v_existing_open_proposal
  from public.settlement_proposals
  where result_hash = v_result_hash
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
  where result_hash = v_result_hash
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
      coalesce(nullif(p_currency_code, ''), 'COP'),
      p_source_graph_cycle_job_id
    )
    returning id into v_proposal_id;

    perform public.reserve_cycle_settlement_edges(
      v_proposal_id,
      p_movements_json,
      coalesce(nullif(p_currency_code, ''), 'COP'),
      null
    );

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
          coalesce(nullif(p_currency_code, ''), 'COP')
        ),
        'manual'
      );
    end loop;

    v_residual_jobs := public.enqueue_graph_cycle_jobs_for_proposal_reservations(
      'settlement_reservation_created',
      v_proposal_id,
      p_actor_user_id,
      p_actor_user_id,
      v_proposal_id
    );

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
        'result_hash', v_result_hash,
        'reservation_count', jsonb_array_length(p_movements_json),
        'residual_auto_cycle_jobs', v_residual_jobs
      )
    );

    v_response := jsonb_build_object(
      'proposalId', v_proposal_id,
      'status', 'pending_approvals',
      'happyCircleCaseId', null,
      'versionNumber', null,
      'residualAutoCycleJobs', v_residual_jobs
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
    and v_old_proposal.currency_code = coalesce(nullif(p_currency_code, ''), 'COP') then
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

        perform public.reserve_cycle_settlement_edges(
          v_old_proposal.id,
          p_movements_json,
          coalesce(nullif(p_currency_code, ''), 'COP'),
          null
        );

        update public.happy_circle_cases
        set status = 'active',
            current_proposal_id = v_old_proposal.id,
            participant_set_hash = v_participant_set_hash,
            completed_at = null,
            updated_at = timezone('utc', now())
        where id = v_case_id;

        v_residual_jobs := public.enqueue_graph_cycle_jobs_for_proposal_reservations(
          'settlement_reservation_revalidated',
          v_old_proposal.id,
          p_actor_user_id,
          p_actor_user_id,
          v_old_proposal.id
        );

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
            'graph_snapshot_hash', p_graph_snapshot_hash,
            'residual_auto_cycle_jobs', v_residual_jobs
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
            'revalidated', true,
            'residualAutoCycleJobs', v_residual_jobs
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
      and currency_code = coalesce(nullif(p_currency_code, ''), 'COP')
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
          coalesce(nullif(p_currency_code, ''), 'COP'),
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
            'currency_code', coalesce(nullif(p_currency_code, ''), 'COP')
          )
        );
      exception
        when unique_violation then
          select *
            into v_case
          from public.happy_circle_cases
          where anchor_user_low_id = p_anchor_user_low_id
            and anchor_user_high_id = p_anchor_user_high_id
            and currency_code = coalesce(nullif(p_currency_code, ''), 'COP')
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
      coalesce(nullif(p_currency_code, ''), 'COP'),
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
      where result_hash = v_result_hash
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

  perform public.reserve_cycle_settlement_edges(
    v_proposal_id,
    p_movements_json,
    coalesce(nullif(p_currency_code, ''), 'COP'),
    v_replaces_proposal_id
  );

  foreach v_participant_user_id in array p_participant_user_ids
  loop
    v_approval_scope_hash := public.compute_cycle_participant_approval_scope_hash(
      p_movements_json,
      v_participant_user_id,
      coalesce(nullif(p_currency_code, ''), 'COP')
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

  v_residual_jobs := public.enqueue_graph_cycle_jobs_for_proposal_reservations(
    'settlement_reservation_created',
    v_proposal_id,
    p_actor_user_id,
    p_actor_user_id,
    v_proposal_id
  );

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
      'approvals_pending', v_approvals_pending,
      'reservation_count', jsonb_array_length(p_movements_json),
      'residual_auto_cycle_jobs', v_residual_jobs
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
      'approvalsPending', v_approvals_pending,
      'residualAutoCycleJobs', v_residual_jobs
    );
  end if;

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
  v_has_reservation_rows boolean := false;
  v_capacity_valid boolean := false;
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
        'staleReason', 'reserved_capacity_lost',
        'autoCycleJob', v_job,
        'nextAutoCycleJob', v_job
      );
    end if;
  else
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

  if v_has_reservation_rows then
    perform public.consume_cycle_settlement_reservations(p_proposal_id);
  end if;

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
  v_has_reservation_rows boolean := false;
  v_capacity_valid boolean := false;
  v_residual_jobs jsonb := '[]'::jsonb;
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
$$;

revoke all on function public.compute_available_graph_component_snapshot(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.compute_available_graph_component_snapshot_hash(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.compute_available_graph_snapshot_hash()
  from public, anon, authenticated;
revoke all on function public.cycle_settlement_reservation_rows(jsonb, text)
  from public, anon, authenticated;
revoke all on function public.active_settlement_edge_reservations()
  from public, anon, authenticated;
revoke all on function public.release_cycle_settlement_reservations(uuid, text)
  from public, anon, authenticated;
revoke all on function public.consume_cycle_settlement_reservations(uuid)
  from public, anon, authenticated;
revoke all on function public.lock_cycle_settlement_reservation_pairs(jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.validate_cycle_reservation_capacity(jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.reserve_cycle_settlement_edges(uuid, jsonb, text, uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_pair_reservation_capacity(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.reconcile_all_reservation_capacity()
  from public, anon, authenticated;
revoke all on function public.reconcile_touched_reservation_capacity(uuid[])
  from public, anon, authenticated;
revoke all on function public.validate_cycle_reservation_capacity_for_execution(uuid)
  from public, anon, authenticated;
revoke all on function public.enqueue_graph_cycle_jobs_for_proposal_reservations(text, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.compute_available_graph_component_snapshot(uuid, uuid, text)
  to service_role;
grant execute on function public.compute_available_graph_component_snapshot_hash(uuid, uuid, text)
  to service_role;
grant execute on function public.compute_available_graph_snapshot_hash()
  to service_role;
grant execute on function public.cycle_settlement_reservation_rows(jsonb, text)
  to service_role;
grant execute on function public.active_settlement_edge_reservations()
  to service_role;
grant execute on function public.release_cycle_settlement_reservations(uuid, text)
  to service_role;
grant execute on function public.consume_cycle_settlement_reservations(uuid)
  to service_role;
grant execute on function public.lock_cycle_settlement_reservation_pairs(jsonb, text, uuid)
  to service_role;
grant execute on function public.validate_cycle_reservation_capacity(jsonb, text, uuid)
  to service_role;
grant execute on function public.reserve_cycle_settlement_edges(uuid, jsonb, text, uuid)
  to service_role;
grant execute on function public.reconcile_pair_reservation_capacity(uuid, uuid, text)
  to service_role;
grant execute on function public.reconcile_all_reservation_capacity()
  to service_role;
grant execute on function public.reconcile_touched_reservation_capacity(uuid[])
  to service_role;
grant execute on function public.validate_cycle_reservation_capacity_for_execution(uuid)
  to service_role;
grant execute on function public.enqueue_graph_cycle_jobs_for_proposal_reservations(text, uuid, uuid, uuid, uuid)
  to service_role;
