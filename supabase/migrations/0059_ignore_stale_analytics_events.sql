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

  if v_occurred_at < v_session.started_at then
    return null;
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
        when v_event_name = 'app_backgrounded' then greatest(coalesce(ended_at, v_occurred_at), v_occurred_at)
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

    if v_event_id is not null then
      v_event_ids := v_event_ids || to_jsonb(v_event_id);
    end if;
  end loop;

  return jsonb_build_object(
    'sessionId', v_session_id,
    'eventIds', v_event_ids,
    'acceptedEventCount', jsonb_array_length(v_event_ids)
  );
end;
$$;
