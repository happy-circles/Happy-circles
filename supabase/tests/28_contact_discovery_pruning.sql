begin;

do $$
declare
  v_actor uuid := '00000000-0000-4000-8000-000000002801';
  v_other uuid := '00000000-0000-4000-8000-000000002802';
  v_target uuid := '00000000-0000-4000-8000-000000002803';
  v_session uuid := '00000000-0000-4000-8000-000000002811';
  v_other_session uuid := '00000000-0000-4000-8000-000000002812';
  v_removed_phone text := '+573000002801';
  v_retained_phone text := '+573000002802';
  v_removed_watch uuid;
  v_retained_watch uuid;
  v_other_watch uuid;
  v_result jsonb;
  v_expiry timestamptz := now() + interval '9 minutes';
  v_invalid boolean;
begin
  insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_actor, 'discovery-prune-owner@example.test', now(), '{"provider":"email"}', '{"display_name":"Observer"}'),
    (v_other, 'discovery-prune-other@example.test', now(), '{"provider":"email"}', '{"display_name":"Other"}'),
    (v_target, 'discovery-prune-target@example.test', now(), '{"provider":"email"}', '{"display_name":"Target"}');
  update public.user_profiles set account_access_state = 'active'
    where id in (v_actor, v_other, v_target);
  v_result := public.register_contact_discovery(v_actor, array[v_removed_phone, v_retained_phone], v_session);
  v_removed_watch := (v_result #>> '{watches,0,discoveryWatchId}')::uuid;
  v_retained_watch := (v_result #>> '{watches,1,discoveryWatchId}')::uuid;
  v_result := public.register_contact_discovery(v_other, array[v_removed_phone], v_session);
  v_other_watch := (v_result #>> '{watches,0,discoveryWatchId}')::uuid;
  update app_private.contact_discovery_sessions set expires_at = v_expiry
    where owner_user_id = v_actor and session_id = v_session;

  v_result := public.manage_contact_discovery(v_actor, v_other_session, 'remove', array[v_removed_watch]);
  if v_result ->> 'status' <> 'removed' or (v_result ->> 'removedWatchCount')::integer <> 0 then
    raise exception 'pruning must be scoped to the supplied session';
  end if;
  v_result := public.manage_contact_discovery(v_other, v_session, 'remove', array[v_removed_watch]);
  if (v_result ->> 'removedWatchCount')::integer <> 0 then
    raise exception 'an observer must not remove another observers watch';
  end if;
  v_result := public.manage_contact_discovery(v_actor, v_session, 'remove',
    array[v_removed_watch, v_removed_watch, v_other_watch]);
  if v_result ->> 'status' <> 'removed' or (v_result ->> 'removedWatchCount')::integer <> 1
     or exists (select 1 from app_private.contact_discovery_watches where id = v_removed_watch)
     or not exists (select 1 from app_private.contact_discovery_watches where id = v_retained_watch)
     or not exists (select 1 from app_private.contact_discovery_watches where id = v_other_watch)
     or (select expires_at from app_private.contact_discovery_sessions
         where owner_user_id = v_actor and session_id = v_session) <> v_expiry then
    raise exception 'pruning must remove only requested owned watches without renewing the lease';
  end if;
  v_result := public.manage_contact_discovery(v_actor, v_session, 'remove', array[v_removed_watch]);
  if (v_result ->> 'removedWatchCount')::integer <> 0 then
    raise exception 'pruning retries must be idempotent';
  end if;

  update public.user_profiles set phone_e164 = v_removed_phone, phone_verified_at = now()
    where id = v_target;
  if exists (select 1 from realtime.messages where event = 'contacts_changed'
             and topic = 'user:' || v_actor::text and payload -> 'watchIds' @> jsonb_build_array(v_removed_watch))
     or not exists (select 1 from realtime.messages where event = 'contacts_changed'
                    and topic = 'user:' || v_other::text and payload -> 'watchIds' @> jsonb_build_array(v_other_watch)) then
    raise exception 'removed contacts must stop receiving selective discovery notifications';
  end if;
  if public.manage_contact_discovery(v_actor, v_session, 'renew') ->> 'status' <> 'renewed'
     or not exists (select 1 from app_private.contact_discovery_watches where id = v_retained_watch) then
    raise exception 'the remaining lease must keep its old renewal contract';
  end if;

  v_invalid := false;
  begin
    perform public.manage_contact_discovery(v_actor, v_session, 'remove', array_fill(v_retained_watch, array[61]));
  exception when others then v_invalid := sqlerrm = 'Invalid watchIds'; end;
  if not v_invalid then raise exception 'pruning must bound batch size'; end if;
  v_invalid := false;
  begin
    perform public.manage_contact_discovery(v_actor, v_session, 'remove', array[null::uuid]);
  exception when others then v_invalid := sqlerrm = 'Invalid watchIds'; end;
  if not v_invalid then raise exception 'pruning must reject null identifiers'; end if;
  v_invalid := false;
  begin
    perform public.manage_contact_discovery(v_actor, v_session, 'renew', array[v_retained_watch]);
  exception when others then v_invalid := sqlerrm = 'Invalid action'; end;
  if not v_invalid then raise exception 'pruning overload must not silently renew'; end if;
  if has_function_privilege('authenticated', 'public.manage_contact_discovery(uuid,uuid,text,uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.manage_contact_discovery(uuid,uuid,text,uuid[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.manage_contact_discovery(uuid,uuid,text,uuid[])', 'EXECUTE') then
    raise exception 'pruning must remain behind the authenticated service-role boundary';
  end if;
end;
$$;

create or replace function public.resolve_people_targets(p_actor_user_id uuid, p_phone_e164_list text[])
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$ begin raise exception 'pruning_called_resolver'; end; $$;
do $$
begin
  if public.manage_contact_discovery('00000000-0000-4000-8000-000000002801',
       '00000000-0000-4000-8000-000000002811', 'remove', array[gen_random_uuid()]) ->> 'status' <> 'removed' then
    raise exception 'pruning must succeed independently of resolution';
  end if;
end;
$$;

rollback;
select '1..1';
select 'ok 1 - removed contacts stop discovery without affecting other watches or renewing leases';
