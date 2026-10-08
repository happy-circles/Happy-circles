-- A watch lease is independent of resolution and of opening the contacts panel.
-- Keep the old observed resolver compatible for clients released before this change.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create function app_private.register_contact_discovery_watches(
  p_actor_user_id uuid,
  p_phone_e164_list text[],
  p_discovery_session_id uuid
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare
  v_hash bytea;
  v_hashes bytea[];
  v_watches jsonb;
  v_expiry timestamptz;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if p_actor_user_id is null then raise exception 'actor_mismatch'; end if;
  if p_discovery_session_id is null then raise exception 'Invalid discoverySessionId'; end if;
  if coalesce(cardinality(p_phone_e164_list), 0) not between 1 and 60
     or exists (select 1 from unnest(p_phone_e164_list) phone
                where phone is null or phone !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'Invalid phoneE164List';
  end if;

  -- Serialize per-owner session and capacity checks, including concurrent batches.
  perform pg_advisory_xact_lock(hashtextextended('contact-owner:' || p_actor_user_id::text, 0));
  delete from app_private.contact_discovery_sessions
    where owner_user_id = p_actor_user_id and expires_at <= now();
  if not exists (select 1 from app_private.contact_discovery_sessions
                 where owner_user_id = p_actor_user_id and session_id = p_discovery_session_id)
     and (select count(*) from app_private.contact_discovery_sessions
          where owner_user_id = p_actor_user_id) >= 4 then
    raise exception 'rate_limited: discovery sessions';
  end if;
  insert into app_private.contact_discovery_sessions(owner_user_id, session_id)
    values (p_actor_user_id, p_discovery_session_id)
    on conflict (owner_user_id, session_id) do update
      set expires_at = now() + interval '15 minutes'
    returning expires_at into v_expiry;

  select array_agg(distinct app_private.contact_phone_hmac(phone)) into v_hashes
    from unnest(p_phone_e164_list) phone;
  -- The profile trigger acquires these same ordered locks. Legacy observed
  -- resolution keeps registration and its initial lookup in one transaction.
  for v_hash in select hash from unnest(v_hashes) hash order by hash loop
    perform pg_advisory_xact_lock(hashtextextended('contact-phone:' || encode(v_hash, 'hex'), 0));
  end loop;
  insert into app_private.contact_discovery_watches(owner_user_id, session_id, phone_hmac)
    select p_actor_user_id, p_discovery_session_id, hash from unnest(v_hashes) hash
    on conflict (owner_user_id, session_id, phone_hmac) do nothing;
  if (select count(*) from app_private.contact_discovery_watches
      where owner_user_id = p_actor_user_id and session_id = p_discovery_session_id) > 20000 then
    raise exception 'rate_limited: discovery contacts';
  end if;

  -- No user profile, friendship, invitation, or contact state is resolved here.
  select coalesce(jsonb_agg(jsonb_build_object(
      'phoneE164', requested.phone, 'discoveryWatchId', watch.id
    ) order by requested.position), '[]'::jsonb)
    into v_watches
    from unnest(p_phone_e164_list) with ordinality requested(phone, position)
    join app_private.contact_discovery_watches watch
      on watch.owner_user_id = p_actor_user_id and watch.session_id = p_discovery_session_id
     and watch.phone_hmac = app_private.contact_phone_hmac(requested.phone);
  return jsonb_build_object('status', 'registered', 'discoverySessionId', p_discovery_session_id,
                            'expiresAt', v_expiry, 'watches', v_watches);
end;
$$;
revoke all on function app_private.register_contact_discovery_watches(uuid, text[], uuid)
  from public, anon, authenticated, service_role;

create function public.register_contact_discovery(
  p_actor_user_id uuid, p_phone_e164_list text[], p_discovery_session_id uuid
)
returns jsonb language sql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
  select app_private.register_contact_discovery_watches(
    p_actor_user_id, p_phone_e164_list, p_discovery_session_id
  );
$$;
revoke all on function public.register_contact_discovery(uuid, text[], uuid)
  from public, anon, authenticated;
grant execute on function public.register_contact_discovery(uuid, text[], uuid) to service_role;

create or replace function public.resolve_people_targets_observed(
  p_actor_user_id uuid,
  p_phone_e164_list text[],
  p_discovery_session_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, app_private, pg_temp
as $$
declare
  v_registration jsonb;
  v_result jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if p_actor_user_id is null then raise exception 'actor_mismatch'; end if;
  if coalesce(cardinality(p_phone_e164_list), 0) not between 1 and 60
     or exists (select 1 from unnest(p_phone_e164_list) phone
                where phone is null or phone !~ '^\+[1-9][0-9]{7,14}$') then
    raise exception 'Invalid phoneE164List';
  end if;
  if p_discovery_session_id is null then
    return public.resolve_people_targets(p_actor_user_id, p_phone_e164_list);
  end if;

  v_registration := app_private.register_contact_discovery_watches(
    p_actor_user_id, p_phone_e164_list, p_discovery_session_id
  );
  select coalesce(jsonb_agg(target.value || jsonb_build_object(
      'discoveryWatchId', watch.value ->> 'discoveryWatchId'
    ) order by target.position), '[]'::jsonb)
    into v_result
    from jsonb_array_elements(public.resolve_people_targets(p_actor_user_id, p_phone_e164_list))
      with ordinality target(value, position)
    join jsonb_array_elements(v_registration -> 'watches') with ordinality watch(value, position)
      on watch.position = target.position;
  return v_result;
end;
$$;
revoke all on function public.resolve_people_targets_observed(uuid, text[], uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_people_targets_observed(uuid, text[], uuid) to service_role;

-- Cleanup stays bounded to 100 leases per run, with SKIP LOCKED, but runs every
-- minute instead of every five. Expired watches never receive broadcasts even
-- when deletion has a backlog; renewal never resurrects an expired lease.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('happy-circles-contact-discovery-cleanup', '* * * * *',
      'select app_private.cleanup_contact_discovery();');
  end if;
end;
$$;
