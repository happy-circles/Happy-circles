create table if not exists public.edge_rate_limits (
  scope text not null check (length(btrim(scope)) between 1 and 180),
  subject_key text not null check (length(btrim(subject_key)) between 1 and 220),
  window_started_at timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (scope, subject_key, window_started_at)
);

alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.edge_rate_limits to service_role;

drop function if exists public.check_edge_rate_limit(text, uuid, text, integer, integer);
create or replace function public.check_edge_rate_limit(
  p_scope text,
  p_actor_user_id uuid default null,
  p_client_fingerprint_hash text default null,
  p_limit integer default 60,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := nullif(btrim(p_scope), '');
  v_fingerprint_hash text := nullif(btrim(p_client_fingerprint_hash), '');
  v_subject_key text;
  v_now timestamptz := timezone('utc', now());
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if v_scope is null or length(v_scope) > 180 then
    raise exception 'invalid_rate_limit_scope';
  end if;

  if p_limit is null or p_limit <= 0 or p_limit > 10000 then
    raise exception 'invalid_rate_limit_limit';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_window';
  end if;

  if p_actor_user_id is not null then
    v_subject_key := 'actor:' || p_actor_user_id::text;
  elsif v_fingerprint_hash is not null and length(v_fingerprint_hash) <= 160 then
    v_subject_key := 'fingerprint:' || v_fingerprint_hash;
  else
    raise exception 'invalid_rate_limit_subject';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.edge_rate_limits (
    scope,
    subject_key,
    window_started_at,
    window_seconds,
    request_count,
    updated_at
  )
  values (
    v_scope,
    v_subject_key,
    v_window_started_at,
    p_window_seconds,
    1,
    v_now
  )
  on conflict (scope, subject_key, window_started_at)
  do update set
    request_count = public.edge_rate_limits.request_count + 1,
    updated_at = excluded.updated_at
  returning request_count into v_request_count;

  if v_request_count > p_limit then
    raise exception 'edge_rate_limited';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'scope', v_scope,
    'remaining', greatest(p_limit - v_request_count, 0),
    'requestCount', v_request_count,
    'windowStartedAt', v_window_started_at
  );
end;
$$;

revoke all on function public.check_edge_rate_limit(text, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_edge_rate_limit(text, uuid, text, integer, integer)
  to service_role;
