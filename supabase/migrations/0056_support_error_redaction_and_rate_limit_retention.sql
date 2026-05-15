create or replace function public.sanitize_support_error_text(
  p_text text,
  p_max_length integer default 240
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
  v_max_length integer := least(greatest(coalesce(p_max_length, 240), 1), 1000);
begin
  if v_text = '' then
    return null;
  end if;

  v_text := regexp_replace(
    v_text,
    '(^|[^A-Za-z0-9_])(Bearer[[:space:]]+)[A-Za-z0-9._~+/=-]{16,}',
    '\1\2[redacted]',
    'gi'
  );
  v_text := regexp_replace(
    v_text,
    '(^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
    '\1[redacted_jwt]',
    'g'
  );
  v_text := regexp_replace(
    v_text,
    '([?&#](access_token|refresh_token|id_token|token|code|password|apikey|api_key|secret)=)[^&#[:space:]]+',
    '\1[redacted]',
    'gi'
  );
  v_text := regexp_replace(
    v_text,
    '((access|refresh|id)[_-]?token|api[_-]?key|apikey|authorization|password|secret)[[:space:]]*[:=][[:space:]]*[^[:space:],;&#]+',
    '\1=[redacted]',
    'gi'
  );
  v_text := regexp_replace(
    v_text,
    '(^|[^A-Za-z0-9_])sb_secret_[A-Za-z0-9_-]{16,}',
    '\1[redacted_supabase_secret]',
    'g'
  );
  v_text := regexp_replace(
    v_text,
    '((/|%2f)(join|invite)(/|%2f))[A-Za-z0-9_-]{12,128}',
    '\1[redacted]',
    'gi'
  );

  return nullif(left(btrim(v_text), v_max_length), '');
end;
$$;

create or replace function public.sanitize_support_error_metadata(p_metadata_json jsonb)
returns jsonb
language plpgsql
immutable
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
      'action',
      'functionName',
      'operation',
      'reason',
      'result',
      'source',
      'status'
    ) and jsonb_typeof(v_value) in ('string', 'number', 'boolean', 'null') then
      if jsonb_typeof(v_value) = 'string' then
        v_text_value := public.sanitize_support_error_text(v_value #>> '{}', 120);
        if v_text_value is not null then
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

create or replace function public.record_support_error_report(
  p_actor_user_id uuid,
  p_support_id text,
  p_kind text,
  p_request_id text default null,
  p_error_code text default null,
  p_error_message text default 'Unknown error',
  p_function_name text default null,
  p_screen_name text default null,
  p_route text default null,
  p_platform text default 'unknown',
  p_app_version text default null,
  p_fatal boolean default false,
  p_occurred_at timestamptz default timezone('utc', now()),
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_support_id text := upper(nullif(btrim(coalesce(p_support_id, '')), ''));
  v_kind text := nullif(left(btrim(coalesce(p_kind, '')), 40), '');
  v_request_id text := nullif(left(btrim(coalesce(p_request_id, '')), 128), '');
  v_error_code text := nullif(left(btrim(coalesce(p_error_code, '')), 80), '');
  v_error_message text := coalesce(
    public.sanitize_support_error_text(p_error_message, 240),
    'Unknown error'
  );
  v_function_name text := nullif(left(btrim(coalesce(p_function_name, '')), 80), '');
  v_screen_name text := nullif(left(btrim(coalesce(p_screen_name, '')), 80), '');
  v_route text := public.sanitize_support_error_text(p_route, 120);
  v_platform text := nullif(left(btrim(coalesce(p_platform, '')), 40), '');
  v_app_version text := nullif(left(btrim(coalesce(p_app_version, '')), 80), '');
  v_occurred_at timestamptz := coalesce(p_occurred_at, timezone('utc', now()));
  v_report_id uuid;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if v_support_id is null or v_support_id !~ '^HC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'invalid supportId';
  end if;

  if v_kind is null or v_kind not in (
    'edge_function',
    'client_exception',
    'client_action',
    'data_sync'
  ) then
    raise exception 'invalid kind';
  end if;

  if v_platform is null then
    raise exception 'invalid platform';
  end if;

  if v_occurred_at > timezone('utc', now()) + interval '5 minutes'
    or v_occurred_at < timezone('utc', now()) - interval '30 days' then
    raise exception 'invalid occurredAt';
  end if;

  insert into public.support_error_reports (
    user_id,
    support_id,
    kind,
    request_id,
    error_code,
    error_message,
    function_name,
    screen_name,
    route,
    platform,
    app_version,
    fatal,
    occurred_at,
    metadata_json
  )
  values (
    p_actor_user_id,
    v_support_id,
    v_kind,
    v_request_id,
    v_error_code,
    v_error_message,
    v_function_name,
    v_screen_name,
    v_route,
    v_platform,
    v_app_version,
    coalesce(p_fatal, false),
    v_occurred_at,
    public.sanitize_support_error_metadata(p_metadata_json)
  )
  on conflict (support_id) do update
  set request_id = coalesce(excluded.request_id, public.support_error_reports.request_id),
      error_code = coalesce(excluded.error_code, public.support_error_reports.error_code),
      error_message = excluded.error_message,
      function_name = coalesce(excluded.function_name, public.support_error_reports.function_name),
      screen_name = coalesce(excluded.screen_name, public.support_error_reports.screen_name),
      route = coalesce(excluded.route, public.support_error_reports.route),
      platform = excluded.platform,
      app_version = coalesce(excluded.app_version, public.support_error_reports.app_version),
      fatal = excluded.fatal,
      occurred_at = excluded.occurred_at,
      metadata_json = excluded.metadata_json
  returning id into v_report_id;

  return v_report_id;
end;
$$;

create or replace function public.cleanup_supabase_usage_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cron_job_run_details_deleted integer := 0;
  v_net_http_response_deleted integer := 0;
  v_product_events_deleted integer := 0;
  v_app_sessions_deleted integer := 0;
  v_edge_rate_limits_deleted integer := 0;
  v_public_invite_preview_rate_limits_deleted integer := 0;
begin
  with deleted as (
    delete from cron.job_run_details
    where coalesce(end_time, start_time) < timezone('utc', now()) - interval '7 days'
    returning 1
  )
  select count(*)::integer
    into v_cron_job_run_details_deleted
  from deleted;

  with deleted as (
    delete from net._http_response
    where created < timezone('utc', now()) - interval '2 days'
    returning 1
  )
  select count(*)::integer
    into v_net_http_response_deleted
  from deleted;

  with deleted as (
    delete from public.product_events
    where occurred_at < timezone('utc', now()) - interval '180 days'
    returning 1
  )
  select count(*)::integer
    into v_product_events_deleted
  from deleted;

  with deleted as (
    delete from public.app_sessions
    where coalesce(ended_at, last_seen_at, started_at) < timezone('utc', now()) - interval '180 days'
    returning 1
  )
  select count(*)::integer
    into v_app_sessions_deleted
  from deleted;

  with deleted as (
    delete from public.edge_rate_limits
    where window_started_at < timezone('utc', now()) - interval '2 days'
    returning 1
  )
  select count(*)::integer
    into v_edge_rate_limits_deleted
  from deleted;

  with deleted as (
    delete from public.public_invite_preview_rate_limits
    where window_started_at < timezone('utc', now()) - interval '2 days'
    returning 1
  )
  select count(*)::integer
    into v_public_invite_preview_rate_limits_deleted
  from deleted;

  return jsonb_build_object(
    'cronJobRunDetailsDeleted', v_cron_job_run_details_deleted,
    'netHttpResponseDeleted', v_net_http_response_deleted,
    'productEventsDeleted', v_product_events_deleted,
    'appSessionsDeleted', v_app_sessions_deleted,
    'edgeRateLimitsDeleted', v_edge_rate_limits_deleted,
    'publicInvitePreviewRateLimitsDeleted', v_public_invite_preview_rate_limits_deleted
  );
end;
$$;

revoke all on function public.sanitize_support_error_text(text, integer) from public, anon, authenticated;
revoke all on function public.sanitize_support_error_metadata(jsonb) from public, anon, authenticated;
revoke all on function public.record_support_error_report(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.cleanup_supabase_usage_retention() from public, anon, authenticated;

grant execute on function public.sanitize_support_error_text(text, integer) to service_role;
grant execute on function public.sanitize_support_error_metadata(jsonb) to service_role;
grant execute on function public.record_support_error_report(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.cleanup_supabase_usage_retention() to service_role;

grant delete on public.public_invite_preview_rate_limits to service_role;
