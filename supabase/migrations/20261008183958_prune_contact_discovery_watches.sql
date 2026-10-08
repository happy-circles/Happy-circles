-- Removing numbers from a local agenda must also remove their temporary
-- observations, without renewing or replacing the remaining lease.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- No DEFAULT here: PostgREST must distinguish this overload from the deployed
-- three-argument renew/stop RPC for older clients.
create function public.manage_contact_discovery(
  p_actor_user_id uuid,
  p_discovery_session_id uuid,
  p_action text,
  p_watch_ids uuid[]
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare v_count integer;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if p_actor_user_id is null or p_discovery_session_id is null then
    raise exception 'Invalid discoverySessionId';
  end if;
  if p_action <> 'remove' or p_action is null then raise exception 'Invalid action'; end if;
  if coalesce(cardinality(p_watch_ids), 0) not between 1 and 60
     or array_position(p_watch_ids, null) is not null then
    raise exception 'Invalid watchIds';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contact-owner:' || p_actor_user_id::text, 0));
  delete from app_private.contact_discovery_watches
    where owner_user_id = p_actor_user_id and session_id = p_discovery_session_id
      and id = any(p_watch_ids);
  get diagnostics v_count = row_count;
  return jsonb_build_object('status', 'removed', 'removedWatchCount', v_count);
end;
$$;
revoke all on function public.manage_contact_discovery(uuid, uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.manage_contact_discovery(uuid, uuid, text, uuid[]) to service_role;
