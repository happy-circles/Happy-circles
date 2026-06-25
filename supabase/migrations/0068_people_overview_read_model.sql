create index if not exists relationships_active_user_low_idx
  on public.relationships (user_low_id)
  where status = 'active';

create index if not exists relationships_active_user_high_idx
  on public.relationships (user_high_id)
  where status = 'active';

create index if not exists financial_requests_pending_relationship_idx
  on public.financial_requests (relationship_id)
  where status = 'pending';

create or replace function public.get_people_overview_rows(p_actor_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_path text,
  avatar_updated_at timestamptz,
  net_amount_minor bigint,
  direction text,
  pending_count integer,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with active_relationships as (
    select
      relationship.id as relationship_id,
      case
        when relationship.user_low_id = p_actor_user_id then relationship.user_high_id
        else relationship.user_low_id
      end as counterparty_user_id,
      relationship.created_at,
      relationship.updated_at
    from public.relationships relationship
    where relationship.status = 'active'
      and (
        relationship.user_low_id = p_actor_user_id
        or relationship.user_high_id = p_actor_user_id
      )
  ),
  pending_counts as (
    select
      request.relationship_id,
      count(*)::integer as pending_count
    from public.financial_requests request
    join active_relationships relationship
      on relationship.relationship_id = request.relationship_id
    where request.status = 'pending'
    group by request.relationship_id
  ),
  latest_activity as (
    select distinct on (history.relationship_id)
      history.relationship_id,
      history.happened_at
    from public.v_relationship_history history
    join active_relationships relationship
      on relationship.relationship_id = history.relationship_id
    order by history.relationship_id, history.happened_at desc
  )
  select
    relationship.counterparty_user_id as user_id,
    coalesce(nullif(btrim(profile.display_name), ''), 'Persona') as display_name,
    profile.avatar_path,
    profile.updated_at as avatar_updated_at,
    coalesce(debt.amount_minor, 0)::bigint as net_amount_minor,
    case
      when debt.amount_minor is null or debt.amount_minor = 0 then 'settled'
      when debt.debtor_user_id = p_actor_user_id then 'i_owe'
      when debt.creditor_user_id = p_actor_user_id then 'owes_me'
      else 'settled'
    end as direction,
    coalesce(pending.pending_count, 0)::integer as pending_count,
    coalesce(
      activity.happened_at,
      relationship.updated_at,
      relationship.created_at
    ) as last_activity_at
  from active_relationships relationship
  join public.user_profiles profile
    on profile.id = relationship.counterparty_user_id
  left join public.v_open_debts debt
    on debt.relationship_id = relationship.relationship_id
  left join pending_counts pending
    on pending.relationship_id = relationship.relationship_id
  left join latest_activity activity
    on activity.relationship_id = relationship.relationship_id
  order by display_name, relationship.counterparty_user_id;
$$;

revoke all on function public.get_people_overview_rows(uuid) from public, anon, authenticated;
grant execute on function public.get_people_overview_rows(uuid) to service_role;
