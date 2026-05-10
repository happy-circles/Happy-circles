alter table public.analytics_event_catalog
  add column if not exists event_family text not null default 'session',
  add column if not exists event_kind text not null default 'outcome',
  add column if not exists feature_key text not null default 'session',
  add column if not exists allowed_metadata_keys text[] not null default array[]::text[],
  add column if not exists deprecated_at timestamptz;

alter table public.analytics_daily_user_facts
  add column if not exists total_session_seconds integer not null default 0 check (total_session_seconds >= 0),
  add column if not exists core_action_count integer not null default 0 check (core_action_count >= 0),
  add column if not exists financial_request_started_count integer not null default 0 check (financial_request_started_count >= 0),
  add column if not exists financial_request_created_count integer not null default 0 check (financial_request_created_count >= 0),
  add column if not exists financial_request_accepted_count integer not null default 0 check (financial_request_accepted_count >= 0),
  add column if not exists friendship_invite_created_count integer not null default 0 check (friendship_invite_created_count >= 0),
  add column if not exists friendship_invite_accepted_count integer not null default 0 check (friendship_invite_accepted_count >= 0),
  add column if not exists settlement_proposal_viewed_count integer not null default 0 check (settlement_proposal_viewed_count >= 0),
  add column if not exists settlement_proposal_approved_count integer not null default 0 check (settlement_proposal_approved_count >= 0),
  add column if not exists settlement_executed_count integer not null default 0 check (settlement_executed_count >= 0),
  add column if not exists used_invites boolean not null default false,
  add column if not exists used_financial_requests boolean not null default false,
  add column if not exists used_settlements boolean not null default false;

create table if not exists public.analytics_user_lifecycle_facts (
  user_id uuid primary key references public.user_profiles (id) on delete cascade,
  created_at timestamptz not null,
  first_active_at timestamptz,
  activated_at timestamptz,
  first_relationship_at timestamptz,
  first_financial_request_at timestamptz,
  first_accepted_transaction_at timestamptz,
  first_settlement_event_at timestamptz,
  invited_by_user_id uuid references public.user_profiles (id) on delete set null,
  activation_source text,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.analytics_daily_event_facts (
  fact_date date not null,
  event_name text not null references public.analytics_event_catalog (event_name),
  event_family text not null,
  event_kind text not null,
  feature_key text not null,
  user_count integer not null default 0 check (user_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (fact_date, event_name)
);

create table if not exists public.analytics_daily_feature_facts (
  fact_date date not null,
  feature_key text not null,
  user_count integer not null default 0 check (user_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  core_action_count integer not null default 0 check (core_action_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (fact_date, feature_key)
);

drop trigger if exists set_analytics_user_lifecycle_facts_updated_at
  on public.analytics_user_lifecycle_facts;
create trigger set_analytics_user_lifecycle_facts_updated_at
before update on public.analytics_user_lifecycle_facts
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_analytics_daily_event_facts_updated_at
  on public.analytics_daily_event_facts;
create trigger set_analytics_daily_event_facts_updated_at
before update on public.analytics_daily_event_facts
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_analytics_daily_feature_facts_updated_at
  on public.analytics_daily_feature_facts;
create trigger set_analytics_daily_feature_facts_updated_at
before update on public.analytics_daily_feature_facts
for each row execute function public.tg_set_updated_at();

insert into public.analytics_event_catalog (
  event_name,
  description,
  event_family,
  event_kind,
  feature_key,
  allowed_metadata_keys,
  is_active,
  deprecated_at
)
values
  ('app_opened', 'La app se abrio con una sesion autenticada.', 'session', 'lifecycle', 'session', array[]::text[], true, null),
  ('app_backgrounded', 'La app paso a segundo plano o cerro la sesion visual.', 'session', 'lifecycle', 'session', array['route'], true, null),
  ('screen_viewed', 'El usuario vio una pantalla o ruta principal.', 'navigation', 'navigation', 'navigation', array['route'], true, null),
  ('registration_started', 'El usuario inicio un paso autenticado del registro o setup.', 'onboarding', 'intent', 'onboarding', array['source'], true, null),
  ('registration_completed', 'El usuario completo el registro/setup requerido.', 'onboarding', 'outcome', 'onboarding', array['source'], true, null),
  ('financial_request_started', 'El usuario envio el formulario para crear una solicitud financiera.', 'financial_request', 'intent', 'financial_requests', array['category', 'source'], true, null),
  ('financial_request_created', 'La solicitud financiera se creo correctamente.', 'financial_request', 'outcome', 'financial_requests', array['category', 'source', 'result'], true, null),
  ('financial_request_accepted', 'Una solicitud financiera fue aceptada y genero ledger.', 'financial_request', 'outcome', 'financial_requests', array['source', 'result'], true, null),
  ('friendship_invite_created', 'Se creo una invitacion de amistad.', 'invite', 'outcome', 'invites', array['channel', 'flow', 'source'], true, null),
  ('friendship_invite_accepted', 'Una invitacion de amistad fue aceptada.', 'invite', 'outcome', 'invites', array['decision', 'flow', 'source'], true, null),
  ('settlement_proposal_viewed', 'El usuario abrio el detalle de una propuesta de Happy Circle.', 'settlement', 'navigation', 'settlements', array['status'], true, null),
  ('settlement_proposal_approved', 'El usuario aprobo una propuesta de Happy Circle.', 'settlement', 'outcome', 'settlements', array['status', 'source', 'result'], true, null),
  ('settlement_executed', 'El usuario ejecuto un Happy Circle aprobado.', 'settlement', 'outcome', 'settlements', array['status', 'source', 'result'], true, null)
on conflict (event_name) do update
set description = excluded.description,
    event_family = excluded.event_family,
    event_kind = excluded.event_kind,
    feature_key = excluded.feature_key,
    allowed_metadata_keys = excluded.allowed_metadata_keys,
    is_active = excluded.is_active,
    deprecated_at = excluded.deprecated_at,
    updated_at = timezone('utc', now());

create or replace function public.sanitize_product_event_metadata(
  p_event_name text,
  p_metadata_json jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_allowed_keys text[] := array[]::text[];
  v_key text;
  v_value jsonb;
  v_result jsonb := '{}'::jsonb;
  v_text_value text;
begin
  if p_metadata_json is null or jsonb_typeof(p_metadata_json) <> 'object' then
    return '{}'::jsonb;
  end if;

  select coalesce(allowed_metadata_keys, array[]::text[])
    into v_allowed_keys
  from public.analytics_event_catalog
  where event_name = nullif(btrim(coalesce(p_event_name, '')), '');

  v_allowed_keys := coalesce(v_allowed_keys, array[]::text[]);

  for v_key, v_value in
    select key, value
    from jsonb_each(p_metadata_json)
  loop
    if v_key = any(v_allowed_keys)
      and jsonb_typeof(v_value) in ('string', 'number', 'boolean', 'null') then
      if jsonb_typeof(v_value) = 'string' then
        v_text_value := left(btrim(v_value #>> '{}'), 120);
        if v_text_value <> '' then
          v_result := jsonb_set(v_result, array[v_key], to_jsonb(v_text_value), true);
        end if;
      else
        v_result := jsonb_set(v_result, array[v_key], v_value, true);
      end if;
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function public.sanitize_product_event_metadata(p_metadata_json jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_key text;
  v_value jsonb;
  v_result jsonb := '{}'::jsonb;
  v_text_value text;
begin
  if p_metadata_json is null or jsonb_typeof(p_metadata_json) <> 'object' then
    return '{}'::jsonb;
  end if;

  for v_key, v_value in
    select key, value
    from jsonb_each(p_metadata_json)
  loop
    if v_key in (
      'amountBucket',
      'category',
      'channel',
      'decision',
      'flow',
      'itemKind',
      'reason',
      'result',
      'route',
      'source',
      'status'
    ) and jsonb_typeof(v_value) in ('string', 'number', 'boolean', 'null') then
      if jsonb_typeof(v_value) = 'string' then
        v_text_value := left(btrim(v_value #>> '{}'), 120);
        if v_text_value <> '' then
          v_result := jsonb_set(v_result, array[v_key], to_jsonb(v_text_value), true);
        end if;
      else
        v_result := jsonb_set(v_result, array[v_key], v_value, true);
      end if;
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function public.record_product_event(
  p_actor_user_id uuid,
  p_client_event_id text,
  p_session_id uuid,
  p_event_name text,
  p_occurred_at timestamptz default timezone('utc', now()),
  p_screen_name text default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_event_id text := nullif(btrim(coalesce(p_client_event_id, '')), '');
  v_event_name text := nullif(btrim(coalesce(p_event_name, '')), '');
  v_screen_name text := nullif(left(btrim(coalesce(p_screen_name, '')), 80), '');
  v_occurred_at timestamptz := coalesce(p_occurred_at, timezone('utc', now()));
  v_session public.app_sessions%rowtype;
  v_event_id uuid;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if v_client_event_id is null or length(v_client_event_id) > 180 then
    raise exception 'invalid clientEventId';
  end if;

  if v_event_name is null then
    raise exception 'invalid eventName';
  end if;

  if v_occurred_at > timezone('utc', now()) + interval '5 minutes'
    or v_occurred_at < timezone('utc', now()) - interval '30 days' then
    raise exception 'invalid occurredAt';
  end if;

  select *
    into v_session
  from public.app_sessions
  where id = p_session_id
    and user_id = p_actor_user_id;

  if not found then
    raise exception 'invalid sessionId';
  end if;

  if not exists (
    select 1
    from public.analytics_event_catalog
    where event_name = v_event_name
      and is_active
      and deprecated_at is null
  ) then
    raise exception 'invalid eventName';
  end if;

  insert into public.product_events (
    user_id,
    session_id,
    client_event_id,
    event_name,
    screen_name,
    platform,
    app_version,
    occurred_at,
    metadata_json
  )
  values (
    p_actor_user_id,
    p_session_id,
    v_client_event_id,
    v_event_name,
    v_screen_name,
    v_session.platform,
    v_session.app_version,
    v_occurred_at,
    public.sanitize_product_event_metadata(v_event_name, p_metadata_json)
  )
  on conflict (user_id, client_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id
      into v_event_id
    from public.product_events
    where user_id = p_actor_user_id
      and client_event_id = v_client_event_id;
  end if;

  update public.app_sessions
  set last_seen_at = greatest(last_seen_at, v_occurred_at),
      ended_at = case
        when v_event_name = 'app_backgrounded' then v_occurred_at
        else ended_at
      end
  where id = p_session_id;

  return v_event_id;
end;
$$;

create or replace function public.ingest_product_analytics(
  p_actor_user_id uuid,
  p_client_session jsonb,
  p_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_events jsonb := coalesce(p_events, '[]'::jsonb);
  v_event jsonb;
  v_event_id uuid;
  v_event_ids jsonb := '[]'::jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if p_client_session is null or jsonb_typeof(p_client_session) <> 'object' then
    raise exception 'invalid clientSession';
  end if;

  if jsonb_typeof(v_events) <> 'array' then
    raise exception 'invalid events';
  end if;

  if jsonb_array_length(v_events) > 20 then
    raise exception 'invalid events';
  end if;

  v_session_id := public.start_app_session(
    p_actor_user_id,
    p_client_session ->> 'clientSessionId',
    p_client_session ->> 'platform',
    p_client_session ->> 'appVersion',
    p_client_session ->> 'deviceId',
    coalesce(nullif(p_client_session ->> 'startedAt', ''), timezone('utc', now())::text)::timestamptz
  );

  for v_event in
    select value
    from jsonb_array_elements(v_events)
  loop
    if v_event is null or jsonb_typeof(v_event) <> 'object' then
      raise exception 'invalid event';
    end if;

    v_event_id := public.record_product_event(
      p_actor_user_id,
      v_event ->> 'clientEventId',
      v_session_id,
      v_event ->> 'eventName',
      coalesce(nullif(v_event ->> 'occurredAt', ''), timezone('utc', now())::text)::timestamptz,
      v_event ->> 'screenName',
      coalesce(v_event -> 'metadata', '{}'::jsonb)
    );

    v_event_ids := v_event_ids || to_jsonb(v_event_id);
  end loop;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'eventIds', v_event_ids,
    'acceptedEventCount', jsonb_array_length(v_event_ids)
  );
end;
$$;

create or replace function public.refresh_analytics_daily_facts(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, timezone('utc', now())::date);
  v_day_start timestamptz := coalesce(p_day, timezone('utc', now())::date)::timestamptz;
  v_day_end timestamptz := (coalesce(p_day, timezone('utc', now())::date) + 1)::timestamptz;
begin
  delete from public.analytics_daily_user_facts
  where fact_date = v_day;

  insert into public.analytics_daily_user_facts (
    fact_date,
    user_id,
    is_active,
    session_count,
    event_count,
    screen_view_count,
    first_seen_at,
    last_seen_at,
    latest_platform,
    latest_app_version,
    total_session_seconds,
    core_action_count,
    financial_request_started_count,
    financial_request_created_count,
    financial_request_accepted_count,
    friendship_invite_created_count,
    friendship_invite_accepted_count,
    settlement_proposal_viewed_count,
    settlement_proposal_approved_count,
    settlement_executed_count,
    used_invites,
    used_financial_requests,
    used_settlements
  )
  with day_events as (
    select
      event.*,
      catalog.feature_key,
      catalog.event_kind
    from public.product_events event
    join public.analytics_event_catalog catalog on catalog.event_name = event.event_name
    where event.occurred_at >= v_day_start
      and event.occurred_at < v_day_end
  ),
  latest_events as (
    select distinct on (user_id)
      user_id,
      platform,
      app_version
    from day_events
    order by user_id, occurred_at desc, created_at desc
  ),
  event_rollups as (
    select
      user_id,
      count(distinct session_id)::integer as session_count,
      count(*)::integer as event_count,
      count(*) filter (where event_name = 'screen_viewed')::integer as screen_view_count,
      min(occurred_at) as first_seen_at,
      max(occurred_at) as last_seen_at,
      count(*) filter (
        where event_name in (
          'registration_completed',
          'financial_request_created',
          'financial_request_accepted',
          'friendship_invite_created',
          'friendship_invite_accepted',
          'settlement_proposal_approved',
          'settlement_executed'
        )
      )::integer as core_action_count,
      count(*) filter (where event_name = 'financial_request_started')::integer as financial_request_started_count,
      count(*) filter (where event_name = 'financial_request_created')::integer as financial_request_created_count,
      count(*) filter (where event_name = 'financial_request_accepted')::integer as financial_request_accepted_count,
      count(*) filter (where event_name = 'friendship_invite_created')::integer as friendship_invite_created_count,
      count(*) filter (where event_name = 'friendship_invite_accepted')::integer as friendship_invite_accepted_count,
      count(*) filter (where event_name = 'settlement_proposal_viewed')::integer as settlement_proposal_viewed_count,
      count(*) filter (where event_name = 'settlement_proposal_approved')::integer as settlement_proposal_approved_count,
      count(*) filter (where event_name = 'settlement_executed')::integer as settlement_executed_count,
      bool_or(feature_key = 'invites') as used_invites,
      bool_or(feature_key = 'financial_requests') as used_financial_requests,
      bool_or(feature_key = 'settlements') as used_settlements
    from day_events
    group by user_id
  ),
  session_rollups as (
    select
      user_id,
      coalesce(sum(
        least(
          43200,
          greatest(
            0,
            extract(epoch from (
              least(coalesce(ended_at, last_seen_at), v_day_end)
              - greatest(started_at, v_day_start)
            ))::integer
          )
        )
      ), 0)::integer as total_session_seconds
    from public.app_sessions
    where started_at < v_day_end
      and coalesce(ended_at, last_seen_at) >= v_day_start
    group by user_id
  )
  select
    v_day,
    event_rollups.user_id,
    true,
    event_rollups.session_count,
    event_rollups.event_count,
    event_rollups.screen_view_count,
    event_rollups.first_seen_at,
    event_rollups.last_seen_at,
    latest_events.platform,
    latest_events.app_version,
    coalesce(session_rollups.total_session_seconds, 0),
    event_rollups.core_action_count,
    event_rollups.financial_request_started_count,
    event_rollups.financial_request_created_count,
    event_rollups.financial_request_accepted_count,
    event_rollups.friendship_invite_created_count,
    event_rollups.friendship_invite_accepted_count,
    event_rollups.settlement_proposal_viewed_count,
    event_rollups.settlement_proposal_approved_count,
    event_rollups.settlement_executed_count,
    event_rollups.used_invites,
    event_rollups.used_financial_requests,
    event_rollups.used_settlements
  from event_rollups
  join latest_events on latest_events.user_id = event_rollups.user_id
  left join session_rollups on session_rollups.user_id = event_rollups.user_id;

  insert into public.analytics_daily_product_facts (
    fact_date,
    active_user_count,
    new_user_count,
    session_count,
    event_count,
    screen_view_count,
    relationships_created_count,
    friendship_invites_created_count,
    friendship_invites_accepted_count,
    account_invites_created_count,
    account_invites_accepted_count,
    financial_requests_created_count,
    financial_requests_accepted_count,
    financial_requests_rejected_count,
    ledger_transaction_count,
    confirmed_volume_minor,
    settlement_proposals_created_count,
    settlement_executions_count
  )
  select
    v_day,
    (select count(distinct user_id)::integer from public.product_events where occurred_at >= v_day_start and occurred_at < v_day_end),
    (select count(*)::integer from public.user_profiles where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.app_sessions where started_at >= v_day_start and started_at < v_day_end),
    (select count(*)::integer from public.product_events where occurred_at >= v_day_start and occurred_at < v_day_end),
    (select count(*)::integer from public.product_events where event_name = 'screen_viewed' and occurred_at >= v_day_start and occurred_at < v_day_end),
    (select count(*)::integer from public.relationships where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.friendship_invites where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.friendship_invites where status = 'accepted' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.account_invites where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.account_invites where status = 'accepted' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.financial_requests where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.financial_requests where status = 'accepted' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.financial_requests where status = 'rejected' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.ledger_transactions where created_at >= v_day_start and created_at < v_day_end),
    coalesce((
      select sum(entry.amount_minor)
      from public.ledger_entries entry
      join public.ledger_transactions ledger_tx on ledger_tx.id = entry.ledger_transaction_id
      where entry.entry_side = 'debit'
        and ledger_tx.created_at >= v_day_start
        and ledger_tx.created_at < v_day_end
    ), 0),
    (select count(*)::integer from public.settlement_proposals where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.settlement_executions where created_at >= v_day_start and created_at < v_day_end)
  on conflict (fact_date) do update
  set active_user_count = excluded.active_user_count,
      new_user_count = excluded.new_user_count,
      session_count = excluded.session_count,
      event_count = excluded.event_count,
      screen_view_count = excluded.screen_view_count,
      relationships_created_count = excluded.relationships_created_count,
      friendship_invites_created_count = excluded.friendship_invites_created_count,
      friendship_invites_accepted_count = excluded.friendship_invites_accepted_count,
      account_invites_created_count = excluded.account_invites_created_count,
      account_invites_accepted_count = excluded.account_invites_accepted_count,
      financial_requests_created_count = excluded.financial_requests_created_count,
      financial_requests_accepted_count = excluded.financial_requests_accepted_count,
      financial_requests_rejected_count = excluded.financial_requests_rejected_count,
      ledger_transaction_count = excluded.ledger_transaction_count,
      confirmed_volume_minor = excluded.confirmed_volume_minor,
      settlement_proposals_created_count = excluded.settlement_proposals_created_count,
      settlement_executions_count = excluded.settlement_executions_count;

  delete from public.analytics_daily_event_facts
  where fact_date = v_day;

  insert into public.analytics_daily_event_facts (
    fact_date,
    event_name,
    event_family,
    event_kind,
    feature_key,
    user_count,
    event_count
  )
  select
    v_day,
    event.event_name,
    catalog.event_family,
    catalog.event_kind,
    catalog.feature_key,
    count(distinct event.user_id)::integer,
    count(*)::integer
  from public.product_events event
  join public.analytics_event_catalog catalog on catalog.event_name = event.event_name
  where event.occurred_at >= v_day_start
    and event.occurred_at < v_day_end
  group by event.event_name, catalog.event_family, catalog.event_kind, catalog.feature_key;

  delete from public.analytics_daily_feature_facts
  where fact_date = v_day;

  insert into public.analytics_daily_feature_facts (
    fact_date,
    feature_key,
    user_count,
    event_count,
    core_action_count
  )
  select
    v_day,
    catalog.feature_key,
    count(distinct event.user_id)::integer,
    count(*)::integer,
    count(*) filter (
      where event.event_name in (
        'registration_completed',
        'financial_request_created',
        'financial_request_accepted',
        'friendship_invite_created',
        'friendship_invite_accepted',
        'settlement_proposal_approved',
        'settlement_executed'
      )
    )::integer
  from public.product_events event
  join public.analytics_event_catalog catalog on catalog.event_name = event.event_name
  where event.occurred_at >= v_day_start
    and event.occurred_at < v_day_end
  group by catalog.feature_key;

  insert into public.analytics_user_lifecycle_facts (
    user_id,
    created_at,
    first_active_at,
    activated_at,
    first_relationship_at,
    first_financial_request_at,
    first_accepted_transaction_at,
    first_settlement_event_at,
    invited_by_user_id,
    activation_source
  )
  with first_active as (
    select user_id, min(occurred_at) as first_active_at
    from public.product_events
    group by user_id
  ),
  relationship_events as (
    select user_low_id as user_id, created_at from public.relationships
    union all
    select user_high_id as user_id, created_at from public.relationships
  ),
  first_relationship as (
    select user_id, min(created_at) as first_relationship_at
    from relationship_events
    group by user_id
  ),
  financial_events as (
    select creator_user_id as user_id, created_at from public.financial_requests
    union all
    select responder_user_id as user_id, created_at from public.financial_requests
    union all
    select debtor_user_id as user_id, created_at from public.financial_requests
    union all
    select creditor_user_id as user_id, created_at from public.financial_requests
  ),
  first_financial_request as (
    select user_id, min(created_at) as first_financial_request_at
    from financial_events
    group by user_id
  ),
  accepted_transaction_events as (
    select creator_user_id as user_id, resolved_at from public.financial_requests where status = 'accepted' and resolved_at is not null
    union all
    select responder_user_id as user_id, resolved_at from public.financial_requests where status = 'accepted' and resolved_at is not null
    union all
    select debtor_user_id as user_id, resolved_at from public.financial_requests where status = 'accepted' and resolved_at is not null
    union all
    select creditor_user_id as user_id, resolved_at from public.financial_requests where status = 'accepted' and resolved_at is not null
  ),
  first_accepted_transaction as (
    select user_id, min(resolved_at) as first_accepted_transaction_at
    from accepted_transaction_events
    group by user_id
  ),
  settlement_events as (
    select created_by_user_id as user_id, created_at from public.settlement_proposals
    union all
    select participant_user_id as user_id, coalesce(decided_at, created_at) from public.settlement_proposal_participants
    union all
    select executed_by_user_id as user_id, created_at from public.settlement_executions
  ),
  first_settlement_event as (
    select user_id, min(created_at) as first_settlement_event_at
    from settlement_events
    group by user_id
  )
  select
    profile.id,
    profile.created_at,
    first_active.first_active_at,
    coalesce(
      profile.activated_at,
      case when profile.account_access_state = 'active' then profile.created_at else null end
    ),
    first_relationship.first_relationship_at,
    first_financial_request.first_financial_request_at,
    first_accepted_transaction.first_accepted_transaction_at,
    first_settlement_event.first_settlement_event_at,
    profile.invited_by_user_id,
    case
      when profile.activated_via_account_invite_id is not null then 'account_invite'
      when profile.account_access_state = 'active' then 'direct'
      else null
    end
  from public.user_profiles profile
  left join first_active on first_active.user_id = profile.id
  left join first_relationship on first_relationship.user_id = profile.id
  left join first_financial_request on first_financial_request.user_id = profile.id
  left join first_accepted_transaction on first_accepted_transaction.user_id = profile.id
  left join first_settlement_event on first_settlement_event.user_id = profile.id
  on conflict (user_id) do update
  set created_at = excluded.created_at,
      first_active_at = excluded.first_active_at,
      activated_at = excluded.activated_at,
      first_relationship_at = excluded.first_relationship_at,
      first_financial_request_at = excluded.first_financial_request_at,
      first_accepted_transaction_at = excluded.first_accepted_transaction_at,
      first_settlement_event_at = excluded.first_settlement_event_at,
      invited_by_user_id = excluded.invited_by_user_id,
      activation_source = excluded.activation_source,
      updated_at = timezone('utc', now());
end;
$$;

create or replace function public.refresh_analytics_recent_facts(p_days_back integer default 3)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days_back integer := greatest(0, least(coalesce(p_days_back, 3), 30));
  v_offset integer;
begin
  for v_offset in 0..v_days_back loop
    perform public.refresh_analytics_daily_facts((timezone('utc', now())::date - v_offset));
  end loop;
end;
$$;

create or replace view public.v_analytics_active_usage as
select
  facts.fact_date,
  facts.active_user_count as dau,
  (
    select count(distinct user_fact.user_id)::integer
    from public.analytics_daily_user_facts user_fact
    where user_fact.fact_date between facts.fact_date - 6 and facts.fact_date
      and user_fact.is_active
  ) as wau,
  (
    select count(distinct user_fact.user_id)::integer
    from public.analytics_daily_user_facts user_fact
    where user_fact.fact_date between facts.fact_date - 29 and facts.fact_date
      and user_fact.is_active
  ) as mau,
  case
    when (
      select count(distinct user_fact.user_id)
      from public.analytics_daily_user_facts user_fact
      where user_fact.fact_date between facts.fact_date - 29 and facts.fact_date
        and user_fact.is_active
    ) = 0 then 0::numeric
    else round(
      facts.active_user_count::numeric /
      (
        select count(distinct user_fact.user_id)::numeric
        from public.analytics_daily_user_facts user_fact
        where user_fact.fact_date between facts.fact_date - 29 and facts.fact_date
          and user_fact.is_active
      ),
      4
    )
  end as stickiness,
  facts.session_count,
  facts.event_count,
  facts.screen_view_count
from public.analytics_daily_product_facts facts;

create or replace view public.v_analytics_retention_cohorts as
with cohorts as (
  select
    user_id,
    first_active_at::date as cohort_date
  from public.analytics_user_lifecycle_facts
  where first_active_at is not null
)
select
  cohort_date,
  count(*)::integer as cohort_size,
  count(*) filter (where d1.user_id is not null)::integer as retained_d1_user_count,
  count(*) filter (where d7.user_id is not null)::integer as retained_d7_user_count,
  count(*) filter (where d30.user_id is not null)::integer as retained_d30_user_count,
  round(count(*) filter (where d1.user_id is not null)::numeric / nullif(count(*), 0), 4) as retention_d1_rate,
  round(count(*) filter (where d7.user_id is not null)::numeric / nullif(count(*), 0), 4) as retention_d7_rate,
  round(count(*) filter (where d30.user_id is not null)::numeric / nullif(count(*), 0), 4) as retention_d30_rate
from cohorts
left join public.analytics_daily_user_facts d1
  on d1.user_id = cohorts.user_id
 and d1.fact_date = cohorts.cohort_date + 1
 and d1.is_active
left join public.analytics_daily_user_facts d7
  on d7.user_id = cohorts.user_id
 and d7.fact_date = cohorts.cohort_date + 7
 and d7.is_active
left join public.analytics_daily_user_facts d30
  on d30.user_id = cohorts.user_id
 and d30.fact_date = cohorts.cohort_date + 30
 and d30.is_active
group by cohort_date;

create or replace view public.v_analytics_activation_funnel as
with totals as (
  select
    count(*)::integer as created_users,
    count(*) filter (where first_active_at is not null)::integer as first_active_users,
    count(*) filter (where activated_at is not null)::integer as activated_users,
    count(*) filter (where first_relationship_at is not null)::integer as first_relationship_users,
    count(*) filter (where first_accepted_transaction_at is not null)::integer as first_transaction_users
  from public.analytics_user_lifecycle_facts
)
select 1 as stage_order, 'created'::text as stage_key, created_users as user_count, 1::numeric as conversion_rate from totals
union all
select 2, 'first_active', first_active_users, round(first_active_users::numeric / nullif(created_users, 0), 4) from totals
union all
select 3, 'activated', activated_users, round(activated_users::numeric / nullif(created_users, 0), 4) from totals
union all
select 4, 'first_relationship', first_relationship_users, round(first_relationship_users::numeric / nullif(created_users, 0), 4) from totals
union all
select 5, 'first_transaction', first_transaction_users, round(first_transaction_users::numeric / nullif(created_users, 0), 4) from totals;

create or replace view public.v_analytics_feature_adoption as
select
  feature.fact_date,
  feature.feature_key,
  product.active_user_count,
  feature.user_count as feature_user_count,
  feature.event_count,
  feature.core_action_count,
  round(feature.user_count::numeric / nullif(product.active_user_count, 0), 4) as adoption_rate
from public.analytics_daily_feature_facts feature
join public.analytics_daily_product_facts product on product.fact_date = feature.fact_date;

create or replace view public.v_analytics_invite_virality as
select
  facts.fact_date,
  facts.active_user_count,
  (
    select count(distinct inviter_user_id)::integer
    from public.friendship_invites
    where created_at >= facts.fact_date::timestamptz
      and created_at < (facts.fact_date + 1)::timestamptz
  ) + (
    select count(distinct inviter_user_id)::integer
    from public.account_invites
    where created_at >= facts.fact_date::timestamptz
      and created_at < (facts.fact_date + 1)::timestamptz
  ) as inviter_user_count,
  facts.friendship_invites_created_count,
  facts.friendship_invites_accepted_count,
  facts.account_invites_created_count,
  facts.account_invites_accepted_count,
  round(
    (facts.friendship_invites_accepted_count + facts.account_invites_accepted_count)::numeric /
    nullif((
      (
        select count(distinct inviter_user_id)
        from public.friendship_invites
        where created_at >= facts.fact_date::timestamptz
          and created_at < (facts.fact_date + 1)::timestamptz
      ) + (
        select count(distinct inviter_user_id)
        from public.account_invites
        where created_at >= facts.fact_date::timestamptz
          and created_at < (facts.fact_date + 1)::timestamptz
      )
    ), 0),
    4
  ) as viral_coefficient_proxy
from public.analytics_daily_product_facts facts;

create or replace view public.v_analytics_engagement_depth as
select
  product.fact_date,
  product.active_user_count,
  product.session_count,
  product.event_count,
  product.screen_view_count,
  coalesce(sum(user_fact.core_action_count), 0)::integer as core_action_count,
  round(product.session_count::numeric / nullif(product.active_user_count, 0), 4) as avg_sessions_per_active_user,
  round(coalesce(sum(user_fact.total_session_seconds), 0)::numeric / nullif(product.active_user_count, 0), 2) as avg_session_seconds_per_active_user,
  round(product.event_count::numeric / nullif(product.active_user_count, 0), 4) as avg_events_per_active_user,
  round(product.screen_view_count::numeric / nullif(product.active_user_count, 0), 4) as avg_screen_views_per_active_user,
  round(coalesce(sum(user_fact.core_action_count), 0)::numeric / nullif(product.active_user_count, 0), 4) as avg_core_actions_per_active_user
from public.analytics_daily_product_facts product
left join public.analytics_daily_user_facts user_fact on user_fact.fact_date = product.fact_date
group by product.fact_date, product.active_user_count, product.session_count, product.event_count, product.screen_view_count;

create or replace view public.v_analytics_power_users as
with ranked as (
  select
    fact_date,
    user_id,
    event_count,
    core_action_count,
    row_number() over (partition by fact_date order by event_count desc, user_id) as rank_by_events,
    count(*) over (partition by fact_date) as active_user_count,
    sum(event_count) over (partition by fact_date) as total_events,
    sum(core_action_count) over (partition by fact_date) as total_core_actions
  from public.analytics_daily_user_facts
  where is_active
)
select
  fact_date,
  max(active_user_count)::integer as active_user_count,
  round(sum(event_count) filter (where rank_by_events <= greatest(1, ceil(active_user_count * 0.01)))::numeric / nullif(max(total_events), 0), 4) as top_1_percent_event_share,
  round(sum(event_count) filter (where rank_by_events <= greatest(1, ceil(active_user_count * 0.05)))::numeric / nullif(max(total_events), 0), 4) as top_5_percent_event_share,
  round(sum(event_count) filter (where rank_by_events <= greatest(1, ceil(active_user_count * 0.10)))::numeric / nullif(max(total_events), 0), 4) as top_10_percent_event_share,
  round(sum(core_action_count) filter (where rank_by_events <= greatest(1, ceil(active_user_count * 0.10)))::numeric / nullif(max(total_core_actions), 0), 4) as top_10_percent_core_action_share
from ranked
group by fact_date;

create or replace view public.v_analytics_operational_rfm as
with user_transactions as (
  select
    account.owner_user_id as user_id,
    ledger_tx.id as ledger_transaction_id,
    ledger_tx.created_at,
    entry.amount_minor
  from public.ledger_transactions ledger_tx
  join public.ledger_entries entry on entry.ledger_transaction_id = ledger_tx.id
  join public.ledger_accounts account on account.id = entry.ledger_account_id
),
rfm as (
  select
    user_id,
    max(created_at) as last_transaction_at,
    count(distinct ledger_transaction_id)::integer as transaction_count,
    coalesce(sum(amount_minor), 0)::bigint as monetary_minor
  from user_transactions
  group by user_id
),
scored as (
  select
    user_id,
    last_transaction_at,
    (timezone('utc', now())::date - last_transaction_at::date)::integer as recency_days,
    transaction_count,
    monetary_minor,
    ntile(5) over (order by last_transaction_at asc nulls first) as recency_score,
    ntile(5) over (order by transaction_count asc, user_id) as frequency_score,
    ntile(5) over (order by monetary_minor asc, user_id) as monetary_score
  from rfm
)
select
  user_id,
  last_transaction_at,
  recency_days,
  transaction_count,
  monetary_minor,
  (transaction_count >= 2) as is_repeat_transaction_user,
  round(
    (count(*) filter (where transaction_count >= 2) over ())::numeric /
    nullif(count(*) over (), 0),
    4
  ) as repeat_transaction_rate,
  recency_score,
  frequency_score,
  monetary_score,
  (recency_score + frequency_score + monetary_score) as rfm_score,
  case
    when recency_score >= 4 and frequency_score >= 4 and monetary_score >= 4 then 'power_user'
    when recency_score >= 4 and frequency_score >= 3 then 'active_repeat'
    when recency_score <= 2 and frequency_score >= 3 then 'at_risk_repeat'
    when frequency_score <= 2 then 'low_frequency'
    else 'developing'
  end as rfm_segment
from scored;

alter table public.analytics_user_lifecycle_facts enable row level security;
alter table public.analytics_daily_event_facts enable row level security;
alter table public.analytics_daily_feature_facts enable row level security;

revoke all on public.analytics_user_lifecycle_facts from public, anon, authenticated;
revoke all on public.analytics_daily_event_facts from public, anon, authenticated;
revoke all on public.analytics_daily_feature_facts from public, anon, authenticated;

grant select, insert, update, delete on public.analytics_user_lifecycle_facts to service_role;
grant select, insert, update, delete on public.analytics_daily_event_facts to service_role;
grant select, insert, update, delete on public.analytics_daily_feature_facts to service_role;

revoke all on public.v_analytics_active_usage from public, anon, authenticated;
revoke all on public.v_analytics_retention_cohorts from public, anon, authenticated;
revoke all on public.v_analytics_activation_funnel from public, anon, authenticated;
revoke all on public.v_analytics_feature_adoption from public, anon, authenticated;
revoke all on public.v_analytics_invite_virality from public, anon, authenticated;
revoke all on public.v_analytics_engagement_depth from public, anon, authenticated;
revoke all on public.v_analytics_power_users from public, anon, authenticated;
revoke all on public.v_analytics_operational_rfm from public, anon, authenticated;

grant select on public.v_analytics_active_usage to service_role;
grant select on public.v_analytics_retention_cohorts to service_role;
grant select on public.v_analytics_activation_funnel to service_role;
grant select on public.v_analytics_feature_adoption to service_role;
grant select on public.v_analytics_invite_virality to service_role;
grant select on public.v_analytics_engagement_depth to service_role;
grant select on public.v_analytics_power_users to service_role;
grant select on public.v_analytics_operational_rfm to service_role;

revoke all on function public.sanitize_product_event_metadata(text, jsonb) from public, anon, authenticated;
revoke all on function public.sanitize_product_event_metadata(jsonb) from public, anon, authenticated;
revoke all on function public.ingest_product_analytics(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.refresh_analytics_recent_facts(integer) from public, anon, authenticated;

grant execute on function public.sanitize_product_event_metadata(text, jsonb) to service_role;
grant execute on function public.sanitize_product_event_metadata(jsonb) to service_role;
grant execute on function public.ingest_product_analytics(uuid, jsonb, jsonb) to service_role;
grant execute on function public.refresh_analytics_recent_facts(integer) to service_role;
