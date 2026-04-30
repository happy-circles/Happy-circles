insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000701',
  'authenticated',
  'authenticated',
  'analytics@example.com',
  extensions.crypt('Circles1234', extensions.gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Analytics"}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now()),
  '',
  '',
  '',
  ''
)
on conflict (id) do update
set email = excluded.email,
    aud = excluded.aud,
    role = excluded.role,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;

insert into public.user_profiles (id, email, display_name)
values (
  '00000000-0000-0000-0000-000000000701',
  'analytics@example.com',
  'Analytics'
)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name;

do $$
declare
  v_user_id constant uuid := '00000000-0000-0000-0000-000000000701';
  v_started_at timestamptz := timezone('utc', now()) - interval '10 minutes';
  v_day date := v_started_at::date;
  v_session_id uuid;
  v_event_id uuid;
  v_duplicate_event_id uuid;
  v_invalid_event_rejected boolean := false;
  v_product_facts public.analytics_daily_product_facts%rowtype;
  v_user_facts public.analytics_daily_user_facts%rowtype;
begin
  delete from public.product_events where user_id = v_user_id;
  delete from public.app_sessions where user_id = v_user_id;
  delete from public.analytics_daily_user_facts where user_id = v_user_id;
  delete from public.analytics_daily_product_facts where fact_date = v_day;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.product_events'::regclass
      and relrowsecurity
  ) then
    raise exception 'expected product_events RLS to be enabled';
  end if;

  if has_table_privilege('authenticated', 'public.product_events', 'INSERT') then
    raise exception 'authenticated must not insert product_events directly';
  end if;

  if has_table_privilege('authenticated', 'public.app_sessions', 'INSERT') then
    raise exception 'authenticated must not insert app_sessions directly';
  end if;

  v_session_id := public.start_app_session(
    v_user_id,
    'test-analytics-session',
    'ios',
    '1.2.3',
    'raw-device-id',
    v_started_at
  );

  if not exists (
    select 1
    from public.app_sessions
    where id = v_session_id
      and user_id = v_user_id
      and device_id_hash is not null
      and device_id_hash <> 'raw-device-id'
  ) then
    raise exception 'expected app_sessions to store only hashed device id';
  end if;

  v_event_id := public.record_product_event(
    v_user_id,
    'test-analytics-event',
    v_session_id,
    'screen_viewed',
    v_started_at + interval '1 minute',
    'home',
    '{"route":"home","category":"food_drinks","email":"analytics@example.com","nested":{"bad":true}}'::jsonb
  );

  v_duplicate_event_id := public.record_product_event(
    v_user_id,
    'test-analytics-event',
    v_session_id,
    'screen_viewed',
    v_started_at + interval '2 minutes',
    'home',
    '{"route":"home"}'::jsonb
  );

  if v_event_id <> v_duplicate_event_id then
    raise exception 'expected duplicate client_event_id to return the original event id';
  end if;

  if (
    select count(*)
    from public.product_events
    where user_id = v_user_id
      and client_event_id = 'test-analytics-event'
  ) <> 1 then
    raise exception 'expected product event idempotency';
  end if;

  if exists (
    select 1
    from public.product_events
    where id = v_event_id
      and (
        metadata_json ? 'email'
        or metadata_json ? 'nested'
        or metadata_json ->> 'route' <> 'home'
        or metadata_json ->> 'category' <> 'food_drinks'
      )
  ) then
    raise exception 'expected product event metadata to be sanitized';
  end if;

  begin
    perform public.record_product_event(
      v_user_id,
      'test-invalid-analytics-event',
      v_session_id,
      'not_in_catalog',
      v_started_at + interval '3 minutes',
      'home',
      '{}'::jsonb
    );
  exception
    when others then
      v_invalid_event_rejected := true;
  end;

  if not v_invalid_event_rejected then
    raise exception 'expected unknown analytics event to be rejected';
  end if;

  perform public.refresh_analytics_daily_facts(v_day);
  perform public.refresh_analytics_daily_facts(v_day);

  select *
    into v_user_facts
  from public.analytics_daily_user_facts
  where fact_date = v_day
    and user_id = v_user_id;

  if not found
    or not v_user_facts.is_active
    or v_user_facts.session_count <> 1
    or v_user_facts.event_count <> 2
    or v_user_facts.screen_view_count <> 1 then
    raise exception 'unexpected daily user facts: %', row_to_json(v_user_facts);
  end if;

  select *
    into v_product_facts
  from public.analytics_daily_product_facts
  where fact_date = v_day;

  if not found
    or v_product_facts.active_user_count < 1
    or v_product_facts.session_count < 1
    or v_product_facts.event_count < 2
    or v_product_facts.screen_view_count < 1 then
    raise exception 'unexpected daily product facts: %', row_to_json(v_product_facts);
  end if;
end
$$;

select '1..1';
select 'ok 1 - product analytics tables, RPCs, privacy, and rollups';
