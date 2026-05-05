create table if not exists public.support_error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  support_id text not null,
  kind text not null,
  request_id text,
  error_code text,
  error_message text not null,
  function_name text,
  screen_name text,
  route text,
  platform text not null,
  app_version text,
  fatal boolean not null default false,
  occurred_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint support_error_reports_support_id_format check (
    support_id ~ '^HC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
  ),
  constraint support_error_reports_kind_valid check (
    kind in ('edge_function', 'client_exception', 'client_action', 'data_sync')
  ),
  constraint support_error_reports_request_id_length check (
    request_id is null or length(request_id) <= 128
  ),
  constraint support_error_reports_metadata_object check (jsonb_typeof(metadata_json) = 'object')
);

comment on table public.support_error_reports is
  'Sanitized client-visible error reports keyed by support_id for support lookup and log correlation.';
comment on column public.support_error_reports.support_id is
  'Human-shareable code shown to the user and sent as x-request-id to Edge Functions.';
comment on column public.support_error_reports.request_id is
  'Backend request id returned by an Edge Function when available. Often equals support_id.';
comment on column public.support_error_reports.error_message is
  'Short sanitized user-facing or technical summary, capped before persistence.';
comment on column public.support_error_reports.metadata_json is
  'Allowlisted scalar metadata only; no PII, tokens, free-form user text, or request payloads.';

create unique index if not exists support_error_reports_support_id_idx
  on public.support_error_reports (support_id);

create index if not exists support_error_reports_user_occurred_idx
  on public.support_error_reports (user_id, occurred_at desc);

create index if not exists support_error_reports_request_id_idx
  on public.support_error_reports (request_id)
  where request_id is not null;

create index if not exists support_error_reports_function_occurred_idx
  on public.support_error_reports (function_name, occurred_at desc)
  where function_name is not null;

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
  v_error_message text := nullif(left(btrim(coalesce(p_error_message, '')), 240), '');
  v_function_name text := nullif(left(btrim(coalesce(p_function_name, '')), 80), '');
  v_screen_name text := nullif(left(btrim(coalesce(p_screen_name, '')), 80), '');
  v_route text := nullif(left(btrim(coalesce(p_route, '')), 120), '');
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

  if v_error_message is null then
    raise exception 'invalid errorMessage';
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

alter table public.support_error_reports enable row level security;

revoke all on public.support_error_reports from public, anon, authenticated;
grant select, insert, update, delete on public.support_error_reports to service_role;

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

drop policy if exists support_error_reports_client_deny_all
  on public.support_error_reports;
create policy support_error_reports_client_deny_all
on public.support_error_reports
for all
to public
using (false)
with check (false);
