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
  '00000000-0000-0000-0000-000000001701',
  'authenticated',
  'authenticated',
  'analytics-v2@example.com',
  extensions.crypt('Circles1234', extensions.gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Analytics V2"}'::jsonb,
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

insert into public.user_profiles (id, email, display_name, account_access_state)
values (
  '00000000-0000-0000-0000-000000001701',
  'analytics-v2@example.com',
  'Analytics V2',
  'active'
)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    account_access_state = excluded.account_access_state;

do $$
declare
  v_user_id constant uuid := '00000000-0000-0000-0000-000000001701';
  v_day date := (timezone('utc', now())::date - 20);
  v_day0 timestamptz := (timezone('utc', now())::date - 20)::timestamptz + interval '10 hours';
  v_day1 timestamptz := (timezone('utc', now())::date - 19)::timestamptz + interval '10 hours';
  v_stale_start timestamptz := timezone('utc', now()) - interval '2 days';
  v_result jsonb;
  v_stale_session public.app_sessions%rowtype;
  v_user_facts public.analytics_daily_user_facts%rowtype;
  v_lifecycle public.analytics_user_lifecycle_facts%rowtype;
  v_active_usage record;
  v_retention record;
begin
  delete from public.product_events where user_id = v_user_id;
  delete from public.app_sessions where user_id = v_user_id;
  delete from public.analytics_daily_user_facts where user_id = v_user_id;
  delete from public.analytics_user_lifecycle_facts where user_id = v_user_id;
  delete from public.analytics_daily_product_facts where fact_date in (v_day, v_day + 1);
  delete from public.analytics_daily_event_facts where fact_date in (v_day, v_day + 1);
  delete from public.analytics_daily_feature_facts where fact_date in (v_day, v_day + 1);

  v_result := public.ingest_product_analytics(
    v_user_id,
    jsonb_build_object(
      'clientSessionId', 'analytics-v2-session-d0',
      'platform', 'ios',
      'appVersion', '2.0.0',
      'deviceId', 'analytics-v2-raw-device',
      'startedAt', v_day0
    ),
    jsonb_build_array(
      jsonb_build_object(
        'clientEventId', 'analytics-v2-screen-d0',
        'eventName', 'screen_viewed',
        'occurredAt', v_day0 + interval '1 minute',
        'screenName', 'home',
        'metadata', jsonb_build_object(
          'route', 'home',
          'category', 'food_drinks',
          'email', 'analytics-v2@example.com',
          'token', 'raw-token'
        )
      ),
      jsonb_build_object(
        'clientEventId', 'analytics-v2-financial-started-d0',
        'eventName', 'financial_request_started',
        'occurredAt', v_day0 + interval '2 minutes',
        'screenName', 'register',
        'metadata', jsonb_build_object(
          'category', 'food_drinks',
          'email', 'analytics-v2@example.com'
        )
      )
    )
  );

  if (v_result ->> 'acceptedEventCount')::integer <> 2 then
    raise exception 'expected two accepted batch events, got %', v_result;
  end if;

  perform public.ingest_product_analytics(
    v_user_id,
    jsonb_build_object(
      'clientSessionId', 'analytics-v2-session-d0',
      'platform', 'ios',
      'appVersion', '2.0.0',
      'deviceId', 'analytics-v2-raw-device',
      'startedAt', v_day0
    ),
    jsonb_build_array(
      jsonb_build_object(
        'clientEventId', 'analytics-v2-screen-d0',
        'eventName', 'screen_viewed',
        'occurredAt', v_day0 + interval '1 minute',
        'screenName', 'home',
        'metadata', jsonb_build_object('route', 'home')
      )
    )
  );

  if (
    select count(*)
    from public.product_events
    where user_id = v_user_id
      and occurred_at >= v_day::timestamptz
      and occurred_at < (v_day + 1)::timestamptz
  ) <> 3 then
    raise exception 'expected app_opened plus two idempotent product events';
  end if;

  if exists (
    select 1
    from public.product_events
    where user_id = v_user_id
      and (
        metadata_json ? 'email'
        or metadata_json ? 'token'
        or (event_name = 'screen_viewed' and metadata_json ? 'category')
      )
  ) then
    raise exception 'expected per-event metadata sanitization to remove disallowed keys';
  end if;

  perform public.ingest_product_analytics(
    v_user_id,
    jsonb_build_object(
      'clientSessionId', 'analytics-v2-session-d1',
      'platform', 'ios',
      'appVersion', '2.0.0',
      'deviceId', 'analytics-v2-raw-device',
      'startedAt', v_day1
    ),
    jsonb_build_array(
      jsonb_build_object(
        'clientEventId', 'analytics-v2-screen-d1',
        'eventName', 'screen_viewed',
        'occurredAt', v_day1 + interval '1 minute',
        'screenName', 'home',
        'metadata', jsonb_build_object('route', 'home')
      )
    )
  );

  perform public.refresh_analytics_daily_facts(v_day);
  perform public.refresh_analytics_daily_facts(v_day + 1);
  perform public.refresh_analytics_daily_facts(v_day);

  select *
    into v_user_facts
  from public.analytics_daily_user_facts
  where fact_date = v_day
    and user_id = v_user_id;

  if not found
    or v_user_facts.event_count <> 3
    or v_user_facts.screen_view_count <> 1
    or v_user_facts.financial_request_started_count <> 1
    or v_user_facts.total_session_seconds < 120
    or not v_user_facts.used_financial_requests then
    raise exception 'unexpected analytics v2 daily user facts: %', row_to_json(v_user_facts);
  end if;

  if not exists (
    select 1
    from public.analytics_daily_event_facts
    where fact_date = v_day
      and event_name = 'financial_request_started'
      and feature_key = 'financial_requests'
      and user_count = 1
      and event_count = 1
  ) then
    raise exception 'expected analytics daily event facts for financial request started';
  end if;

  if not exists (
    select 1
    from public.analytics_daily_feature_facts
    where fact_date = v_day
      and feature_key = 'financial_requests'
      and user_count = 1
      and event_count = 1
  ) then
    raise exception 'expected analytics daily feature facts for financial requests';
  end if;

  select *
    into v_lifecycle
  from public.analytics_user_lifecycle_facts
  where user_id = v_user_id;

  if not found
    or v_lifecycle.first_active_at::date <> v_day
    or v_lifecycle.activated_at is null
    or v_lifecycle.activation_source <> 'direct' then
    raise exception 'unexpected lifecycle facts: %', row_to_json(v_lifecycle);
  end if;

  select *
    into v_active_usage
  from public.v_analytics_active_usage
  where fact_date = v_day;

  if not found
    or v_active_usage.dau < 1
    or v_active_usage.mau < v_active_usage.dau
    or v_active_usage.stickiness <= 0 then
    raise exception 'unexpected active usage row: %', row_to_json(v_active_usage);
  end if;

  select *
    into v_retention
  from public.v_analytics_retention_cohorts
  where cohort_date = v_day;

  if not found
    or v_retention.cohort_size < 1
    or v_retention.retained_d1_user_count < 1
    or v_retention.retention_d1_rate <= 0 then
    raise exception 'unexpected retention row: %', row_to_json(v_retention);
  end if;

  if not exists (
    select 1
    from public.v_analytics_feature_adoption
    where fact_date = v_day
      and feature_key = 'financial_requests'
      and feature_user_count >= 1
      and adoption_rate > 0
  ) then
    raise exception 'expected feature adoption row';
  end if;

  if not exists (
    select 1
    from public.v_analytics_power_users
    where fact_date = v_day
      and active_user_count >= 1
      and top_10_percent_event_share > 0
  ) then
    raise exception 'expected power users row';
  end if;

  v_result := public.ingest_product_analytics(
    v_user_id,
    jsonb_build_object(
      'clientSessionId', 'analytics-v2-session-stale',
      'platform', 'ios',
      'appVersion', '2.0.0',
      'deviceId', 'analytics-v2-raw-device',
      'startedAt', v_stale_start
    ),
    jsonb_build_array(
      jsonb_build_object(
        'clientEventId', 'analytics-v2-stale-backgrounded',
        'eventName', 'app_backgrounded',
        'occurredAt', v_stale_start - interval '1 hour',
        'screenName', 'home',
        'metadata', jsonb_build_object('route', 'home')
      )
    )
  );

  if (v_result ->> 'acceptedEventCount')::integer <> 0 then
    raise exception 'expected stale queued event to be ignored, got %', v_result;
  end if;

  if exists (
    select 1
    from public.product_events
    where user_id = v_user_id
      and client_event_id = 'analytics-v2-stale-backgrounded'
  ) then
    raise exception 'expected stale queued event not to be recorded';
  end if;

  select *
    into v_stale_session
  from public.app_sessions
  where user_id = v_user_id
    and client_session_id = 'analytics-v2-session-stale';

  if not found or v_stale_session.ended_at is not null then
    raise exception 'expected stale queued event not to close session: %', row_to_json(v_stale_session);
  end if;
end
$$;

select '1..2';
select 'ok 1 - analytics v2 batch ingest, facts, lifecycle, and metric views';
select 'ok 2 - analytics v2 ignores stale queued events from prior app sessions';
