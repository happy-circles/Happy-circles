do $$
declare
  v_actor_a uuid := '00000000-0000-0000-0000-000000001801';
  v_actor_b uuid := '00000000-0000-0000-0000-000000001802';
  v_limited boolean := false;
  v_preview jsonb;
  v_cleanup jsonb;
begin
  delete from public.edge_rate_limits
  where scope like 'test:%';

  if not exists (
    select 1
    from pg_class
    where oid = 'public.edge_rate_limits'::regclass
      and relrowsecurity
  ) then
    raise exception 'expected edge_rate_limits RLS to be enabled';
  end if;

  if has_table_privilege('authenticated', 'public.edge_rate_limits', 'SELECT')
    or has_table_privilege('anon', 'public.edge_rate_limits', 'SELECT') then
    raise exception 'edge_rate_limits must not be readable by clients';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.check_edge_rate_limit(text,uuid,text,integer,integer)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.check_edge_rate_limit(text,uuid,text,integer,integer)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'check_edge_rate_limit must only execute through service_role';
  end if;

  perform public.check_edge_rate_limit('test:actor', v_actor_a, null, 2, 60);
  perform public.check_edge_rate_limit('test:actor', v_actor_a, null, 2, 60);

  begin
    perform public.check_edge_rate_limit('test:actor', v_actor_a, null, 2, 60);
  exception
    when others then
      if position('edge_rate_limited' in sqlerrm) = 0 then
        raise;
      end if;
      v_limited := true;
  end;

  if not v_limited then
    raise exception 'expected actor rate limit to block after the limit';
  end if;

  perform public.check_edge_rate_limit('test:actor', v_actor_b, null, 2, 60);
  perform public.check_edge_rate_limit('test:other-scope', v_actor_a, null, 2, 60);

  v_limited := false;
  perform public.check_edge_rate_limit('test:fingerprint', null, 'fingerprint-a', 1, 60);
  perform public.check_edge_rate_limit('test:fingerprint', null, 'fingerprint-b', 1, 60);

  begin
    perform public.check_edge_rate_limit('test:fingerprint', null, 'fingerprint-a', 1, 60);
  exception
    when others then
      if position('edge_rate_limited' in sqlerrm) = 0 then
        raise;
      end if;
      v_limited := true;
  end;

  if not v_limited then
    raise exception 'expected fingerprint rate limit to block after the limit';
  end if;

  v_preview := public.get_account_invite_preview_public(
    'definitely-invalid-token',
    false,
    'test-preview-fingerprint',
    null
  );

  if v_preview ? 'emailAlreadyRegistered' or v_preview ? 'phoneAlreadyRegistered' then
    raise exception 'public account invite preview must not expose registration existence flags';
  end if;

  insert into public.edge_rate_limits (
    scope,
    subject_key,
    window_started_at,
    window_seconds,
    request_count,
    updated_at
  )
  values (
    'test:stale-cleanup',
    'fingerprint:test',
    timezone('utc', now()) - interval '3 days',
    60,
    1,
    timezone('utc', now()) - interval '3 days'
  )
  on conflict (scope, subject_key, window_started_at) do nothing;

  insert into public.public_invite_preview_rate_limits (
    token_hash,
    client_fingerprint_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    repeat('a', 64),
    'test-cleanup-fingerprint',
    timezone('utc', now()) - interval '3 days',
    1,
    timezone('utc', now()) - interval '3 days'
  )
  on conflict (token_hash, client_fingerprint_hash, window_started_at) do nothing;

  v_cleanup := public.cleanup_supabase_usage_retention();

  if coalesce((v_cleanup ->> 'edgeRateLimitsDeleted')::integer, 0) < 1 then
    raise exception 'expected cleanup to delete stale edge_rate_limits rows';
  end if;

  if coalesce((v_cleanup ->> 'publicInvitePreviewRateLimitsDeleted')::integer, 0) < 1 then
    raise exception 'expected cleanup to delete stale public invite preview rate-limit rows';
  end if;
end
$$;

select '1..1';
select 'ok 1 - edge rate limits and public invite privacy guardrails';
