-- Keep rate checks in their own committed RPC, before the outreach transaction.
-- Failed commands and idempotent replays continue consuming the existing quota.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create function public.check_people_outreach_rate_limits(p_actor_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_actor_user_id is null then raise exception 'actor_mismatch'; end if;
  perform public.assert_request_actor(p_actor_user_id);

  -- Preserve the current minute -> hour order. A denied check rolls back only
  -- its own increment, while previously allowed checks remain committed.
  begin
    perform public.check_edge_rate_limit('create-people-outreach', p_actor_user_id, null, 10, 60);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'edge_rate_limited' then raise; end if;
    return jsonb_build_object('allowed', false, 'blockedScope', 'create-people-outreach');
  end;
  begin
    perform public.check_edge_rate_limit('create-people-outreach:hour', p_actor_user_id, null, 100, 3600);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'edge_rate_limited' then raise; end if;
    return jsonb_build_object('allowed', false, 'blockedScope', 'create-people-outreach:hour');
  end;
  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.check_people_outreach_rate_limits(uuid)
  from public, anon, authenticated;
grant execute on function public.check_people_outreach_rate_limits(uuid) to service_role;
