begin;

do $$
declare
  v_actor uuid := '00000000-0000-4000-8000-000000002701';
  v_other uuid := '00000000-0000-4000-8000-000000002702';
  v_session uuid := '00000000-0000-4000-8000-000000002711';
  v_phone text := '+573000002703';
  v_result jsonb;
  v_replay jsonb;
  v_watch uuid;
  v_invalid boolean;
  v_index integer;
begin
  insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_actor, 'discovery-registration-owner@example.test', now(), '{"provider":"email"}', '{"display_name":"Observer"}'),
    (v_other, 'discovery-registration-other@example.test', now(), '{"provider":"email"}', '{"display_name":"Other"}');
  insert into public.user_profiles(id, email, display_name, account_access_state)
  values (v_actor, 'discovery-registration-owner@example.test', 'Observer', 'active'),
         (v_other, 'discovery-registration-other@example.test', 'Other', 'active')
  on conflict (id) do update set account_access_state = 'active';

  v_result := public.register_contact_discovery(v_actor, array[v_phone, v_phone], v_session);
  v_watch := (v_result #>> '{watches,0,discoveryWatchId}')::uuid;
  if v_result ->> 'status' <> 'registered' or v_watch is null
     or v_result ->> 'discoverySessionId' <> v_session::text
     or (v_result ->> 'expiresAt')::timestamptz <> now() + interval '15 minutes'
     or jsonb_array_length(v_result -> 'watches') <> 2
     or (select count(*) from app_private.contact_discovery_watches
         where owner_user_id = v_actor and session_id = v_session) <> 1 then
    raise exception 'registration must create one lease and deduplicated opaque watches';
  end if;
  v_replay := public.register_contact_discovery(v_actor, array[v_phone], v_session);
  if v_replay #>> '{watches,0,discoveryWatchId}' <> v_watch::text then
    raise exception 'repeat registration must reuse the watch identifier';
  end if;
  v_replay := public.register_contact_discovery(v_other, array[v_phone], v_session);
  if v_replay #>> '{watches,0,discoveryWatchId}' = v_watch::text then
    raise exception 'watch identifiers must be exclusive to their observer';
  end if;
  if (select count(*) from jsonb_object_keys(v_result #> '{watches,0}')) <> 2
     or v_result #>> '{watches,0,phoneE164}' <> v_phone then
    raise exception 'registration must not return resolved user or invitation data';
  end if;

  -- Already released clients still get resolution plus their stable watch.
  v_replay := public.resolve_people_targets_observed(v_actor, array[v_phone], v_session);
  if v_replay -> 0 ->> 'status' <> 'no_account'
     or v_replay -> 0 ->> 'discoveryWatchId' <> v_watch::text then
    raise exception 'legacy observed resolution must keep its response contract';
  end if;

  for v_index in 1..3 loop
    perform public.register_contact_discovery(v_actor, array[v_phone], gen_random_uuid());
  end loop;
  v_invalid := false;
  begin
    perform public.register_contact_discovery(v_actor, array[v_phone], gen_random_uuid());
  exception when others then v_invalid := sqlerrm = 'rate_limited: discovery sessions'; end;
  if not v_invalid then raise exception 'registration must bound concurrent leases'; end if;

  insert into app_private.contact_discovery_watches(owner_user_id, session_id, phone_hmac)
    select v_actor, v_session, app_private.contact_phone_hmac('+5739' || lpad(number::text, 8, '0'))
    from generate_series(1, 19999) number;
  v_invalid := false;
  begin
    perform public.register_contact_discovery(v_actor, array['+573000002704'], v_session);
  exception when others then v_invalid := sqlerrm = 'rate_limited: discovery contacts'; end;
  if not v_invalid or (select count(*) from app_private.contact_discovery_watches
                      where owner_user_id = v_actor and session_id = v_session) <> 20000 then
    raise exception 'overflow must fail atomically without keeping extra watches';
  end if;
  perform public.manage_contact_discovery(v_actor, v_session, 'stop');
  if exists (select 1 from app_private.contact_discovery_watches where id = v_watch) then
    raise exception 'stopping a lease must remove all of its watches';
  end if;

  v_invalid := false;
  begin
    perform public.register_contact_discovery(v_other, array[v_phone], null);
  exception when others then v_invalid := sqlerrm = 'Invalid discoverySessionId'; end;
  if not v_invalid then raise exception 'registration must require a session'; end if;
  v_invalid := false;
  begin
    perform public.register_contact_discovery(v_other, array_fill(v_phone, array[61]), v_session);
  exception when others then v_invalid := sqlerrm = 'Invalid phoneE164List'; end;
  if not v_invalid then raise exception 'registration must enforce the batch maximum'; end if;
  v_invalid := false;
  begin
    perform public.register_contact_discovery(v_other, array['3000002703'], v_session);
  exception when others then v_invalid := sqlerrm = 'Invalid phoneE164List'; end;
  if not v_invalid then raise exception 'registration must enforce normalized phones'; end if;

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  v_invalid := false;
  begin
    perform public.register_contact_discovery(v_actor, array[v_phone], v_session);
  exception when others then v_invalid := sqlerrm = 'actor_mismatch'; end;
  if not v_invalid then raise exception 'registration must reject an actor mismatch'; end if;
  perform set_config('request.jwt.claim.sub', '', true);

  if has_function_privilege('authenticated', 'public.register_contact_discovery(uuid,text[],uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.register_contact_discovery(uuid,text[],uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'app_private.register_contact_discovery_watches(uuid,text[],uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.register_contact_discovery(uuid,text[],uuid)', 'EXECUTE') then
    raise exception 'registration must only expose the authenticated service-role boundary';
  end if;
end;
$$;

-- Fail if registration or renewal accidentally invokes the expensive resolver.
create or replace function public.resolve_people_targets(p_actor_user_id uuid, p_phone_e164_list text[])
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$ begin raise exception 'registration_called_resolver'; end; $$;
do $$
begin
  if public.register_contact_discovery('00000000-0000-4000-8000-000000002702',
       array['+573000002703'], '00000000-0000-4000-8000-000000002711') ->> 'status' <> 'registered'
     or public.manage_contact_discovery('00000000-0000-4000-8000-000000002702',
       '00000000-0000-4000-8000-000000002711', 'renew') ->> 'status' <> 'renewed' then
    raise exception 'registration and renewal must succeed independently of resolution';
  end if;
end;
$$;

rollback;
select '1..1';
select 'ok 1 - registration is independent, stable, bounded, private, and compatible';
