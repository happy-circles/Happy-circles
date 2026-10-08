begin;

do $$
declare
  v_actor uuid := '00000000-0000-4000-8000-000000002501';
  v_other uuid := '00000000-0000-4000-8000-000000002502';
  v_target uuid := '00000000-0000-4000-8000-000000002503';
  v_session uuid := '00000000-0000-4000-8000-000000002511';
  v_phone text := '+573000002503';
  v_result jsonb;
  v_replay jsonb;
  v_watch uuid;
  v_other_watch uuid;
  v_invalid boolean;
begin
  insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_actor, 'discovery-owner@example.test', now(), '{"provider":"email"}', '{"display_name":"Observer"}'),
    (v_other, 'discovery-other@example.test', now(), '{"provider":"email"}', '{"display_name":"Other"}'),
    (v_target, 'discovery-target@example.test', now(), '{"provider":"email"}', '{"display_name":"Contact"}');
  insert into public.user_profiles(id, email, display_name, account_access_state)
  values (v_actor, 'discovery-owner@example.test', 'Observer', 'active'),
         (v_other, 'discovery-other@example.test', 'Other', 'active'),
         (v_target, 'discovery-target@example.test', 'Contact', 'active')
  on conflict (id) do update set account_access_state = 'active';

  v_result := public.resolve_people_targets_observed(v_actor, array[v_phone], v_session);
  v_watch := (v_result -> 0 ->> 'discoveryWatchId')::uuid;
  if v_result -> 0 ->> 'status' <> 'no_account' or v_watch is null then
    raise exception 'unknown number must register a watch before resolving';
  end if;
  v_replay := public.resolve_people_targets_observed(v_actor, array[v_phone], v_session);
  if v_replay -> 0 ->> 'discoveryWatchId' <> v_watch::text then
    raise exception 'repeat registration must keep an opaque stable watch';
  end if;
  v_result := public.resolve_people_targets_observed(v_other, array[v_phone], v_session);
  v_other_watch := (v_result -> 0 ->> 'discoveryWatchId')::uuid;
  if v_watch = v_other_watch then raise exception 'observers must not share watch identifiers'; end if;

  update public.user_profiles set phone_e164 = v_phone where id = v_target;
  update public.user_profiles set phone_verified_at = now() where id = v_target;
  v_result := public.resolve_people_targets_observed(v_actor, array[v_phone], v_session);
  if v_result -> 0 ->> 'status' <> 'active_user' then
    raise exception 'registered active contact must immediately resolve to add';
  end if;
  if not exists (select 1 from realtime.messages
                 where event = 'contacts_changed' and topic = 'user:' || v_actor::text
                   and payload -> 'watchIds' @> jsonb_build_array(v_watch)) then
    raise exception 'profile change must emit the owners opaque private watch';
  end if;
  if exists (select 1 from realtime.messages where event = 'contacts_changed'
              and (payload::text like '%' || v_phone || '%'
                   or (topic = 'user:' || v_actor::text and payload -> 'watchIds' @> jsonb_build_array(v_other_watch)))) then
    raise exception 'discovery broadcasts must not disclose phones or other owners watches';
  end if;
  if not exists (select 1 from realtime.messages
                 where event = 'contacts_changed' and topic = 'user:' || v_other::text
                   and payload -> 'watchIds' @> jsonb_build_array(v_other_watch)) then
    raise exception 'every legitimate observer must receive its own watch';
  end if;

  -- An actor cannot stop another actors session, even with its session UUID.
  perform public.manage_contact_discovery(v_other, v_session, 'stop');
  if not exists (select 1 from app_private.contact_discovery_watches where id = v_watch)
     or exists (select 1 from app_private.contact_discovery_watches where id = v_other_watch) then
    raise exception 'stop must be scoped to the authenticated owner';
  end if;
  update public.user_profiles set phone_e164 = '+573000002504' where id = v_target;
  v_result := public.resolve_people_targets_observed(v_actor, array[v_phone], v_session);
  if v_result -> 0 ->> 'status' <> 'no_account' then
    raise exception 'old phone must stop matching after an identity change';
  end if;
  update app_private.contact_discovery_sessions set expires_at = now() - interval '1 second'
    where owner_user_id = v_actor;
  if public.manage_contact_discovery(v_actor, v_session, 'renew') ->> 'status' <> 'expired' then
    raise exception 'expired sessions require a fresh registration';
  end if;
  perform app_private.cleanup_contact_discovery();
  if exists (select 1 from app_private.contact_discovery_watches where id = v_watch) then
    raise exception 'TTL cleanup must remove expired watches';
  end if;

  v_invalid := false;
  begin
    perform public.resolve_people_targets_observed(v_actor, array_fill(v_phone, array[61]), v_session);
  exception when others then v_invalid := sqlerrm = 'Invalid phoneE164List'; end;
  if not v_invalid then raise exception 'SQL must enforce the 60-phone maximum'; end if;
  if has_function_privilege('authenticated', 'public.resolve_people_targets_observed(uuid,text[],uuid)', 'EXECUTE')
     or has_table_privilege('authenticated', 'app_private.contact_discovery_watches', 'SELECT')
     or has_function_privilege('anon', 'app_private.contact_phone_hmac(text)', 'EXECUTE') then
    raise exception 'discovery storage and lookup secrets must remain server-only';
  end if;
end;
$$;

rollback;
select '1..1';
select 'ok 1 - private discovery registers, updates, expires, and isolates observers';
