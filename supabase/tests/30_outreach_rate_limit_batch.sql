begin;

do $$
declare
  v_actor uuid := '00000000-0000-4000-8000-000000003001';
  v_hour_actor uuid := '00000000-0000-4000-8000-000000003003';
  v_other uuid := '00000000-0000-4000-8000-000000003004';
  v_result jsonb;
  v_count integer;
  v_invalid boolean;
begin
  if (select prosecdef from pg_proc where oid = 'public.check_people_outreach_rate_limits(uuid)'::regprocedure)
     or has_function_privilege('authenticated', 'public.check_people_outreach_rate_limits(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.check_people_outreach_rate_limits(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.check_people_outreach_rate_limits(uuid)', 'EXECUTE') then
    raise exception 'outreach quota batch must be security invoker and service-only';
  end if;
  for v_count in 1..10 loop
    if public.check_people_outreach_rate_limits(v_actor) <> '{"allowed":true}'::jsonb then
      raise exception 'first ten requests must remain allowed';
    end if;
  end loop;
  v_result := public.check_people_outreach_rate_limits(v_actor);
  if v_result <> '{"allowed":false,"blockedScope":"create-people-outreach"}'::jsonb
     or (select request_count from public.edge_rate_limits
         where scope = 'create-people-outreach' and subject_key = 'actor:' || v_actor) is distinct from 10
     or (select request_count from public.edge_rate_limits
         where scope = 'create-people-outreach:hour' and subject_key = 'actor:' || v_actor) is distinct from 10 then
    raise exception 'minute denial must not increment either committed counter';
  end if;
  for v_count in 1..100 loop
    perform public.check_edge_rate_limit('create-people-outreach:hour', v_hour_actor, null, 100, 3600);
  end loop;
  v_result := public.check_people_outreach_rate_limits(v_hour_actor);
  if v_result <> '{"allowed":false,"blockedScope":"create-people-outreach:hour"}'::jsonb
     or (select request_count from public.edge_rate_limits
         where scope = 'create-people-outreach' and subject_key = 'actor:' || v_hour_actor) is distinct from 1
     or (select request_count from public.edge_rate_limits
         where scope = 'create-people-outreach:hour' and subject_key = 'actor:' || v_hour_actor) is distinct from 100 then
    raise exception 'hour denial must preserve the allowed minute increment';
  end if;
  if public.check_people_outreach_rate_limits(v_other) ->> 'allowed' is distinct from 'true' then
    raise exception 'one actors quota must not block another';
  end if;
  v_invalid := false;
  begin
    perform public.check_people_outreach_rate_limits(null);
  exception when others then v_invalid := sqlerrm = 'actor_mismatch'; end;
  if not v_invalid then raise exception 'null actor must fail closed'; end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  v_invalid := false;
  begin
    perform public.check_people_outreach_rate_limits(v_other);
  exception when others then v_invalid := sqlerrm = 'actor_mismatch'; end;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_invalid then raise exception 'actor mismatch must fail before quota mutation'; end if;
  if (select request_count from public.edge_rate_limits
      where scope = 'create-people-outreach' and subject_key = 'actor:' || v_other) is distinct from 1
     or (select request_count from public.edge_rate_limits
      where scope = 'create-people-outreach:hour' and subject_key = 'actor:' || v_other) is distinct from 1 then
    raise exception 'actor mismatch mutated another actors quota';
  end if;
end;
$$;

set local role service_role;
do $$
begin
  if public.check_people_outreach_rate_limits('00000000-0000-4000-8000-000000003008')
     is distinct from '{"allowed":true}'::jsonb then
    raise exception 'service role must execute the invoker helper and both protected checks';
  end if;
end;
$$;
reset role;

-- Exercise actual outreach creation, idempotent replay and invalid replay. The
-- quota RPC commits before the next command; its writes are outside that failed
-- command's exception block, exactly as in the two PostgREST requests.
insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
 ('00000000-0000-4000-8000-000000003011', 'authenticated', 'authenticated', 'quota30a@example.test', now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Quota A"}'),
 ('00000000-0000-4000-8000-000000003012', 'authenticated', 'authenticated', 'quota30b@example.test', now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Quota B"}');
update public.user_profiles
set account_access_state = 'active', phone_country_iso2 = 'CO', phone_country_calling_code = '+57',
 phone_national_number = case when id = '00000000-0000-4000-8000-000000003011' then '3009993011' else '3009993012' end,
 phone_e164 = case when id = '00000000-0000-4000-8000-000000003011' then '+573009993011' else '+573009993012' end
where id in ('00000000-0000-4000-8000-000000003011', '00000000-0000-4000-8000-000000003012');
do $$
declare
  v_actor uuid := '00000000-0000-4000-8000-000000003011';
  v_first jsonb;
  v_replay jsonb;
  v_failed boolean := false;
begin
  perform public.check_people_outreach_rate_limits(v_actor);
  v_first := public.create_people_outreach(v_actor, 'quota30-create', 'remote', 'test', 'Quota B', '+573009993012', 'mobile');
  if v_first ->> 'kind' is distinct from 'friendship' then raise exception 'fixture must execute actual friendship creation'; end if;
  perform public.check_people_outreach_rate_limits(v_actor);
  v_replay := public.create_people_outreach(v_actor, 'quota30-create', 'remote', 'test', 'Quota B', '+573009993012', 'mobile');
  if v_replay is distinct from v_first then raise exception 'idempotent replay changed business result'; end if;
  perform public.check_people_outreach_rate_limits(v_actor);
  begin
    perform public.create_people_outreach(v_actor, 'quota30-create', 'remote', 'test', 'Different', '+573009993013', 'mobile');
  exception when others then v_failed := sqlerrm = 'idempotency_key_reused'; end;
  if not v_failed then raise exception 'invalid replay must preserve business rejection'; end if;
  if (select request_count from public.edge_rate_limits where scope = 'create-people-outreach'
      and subject_key = 'actor:' || v_actor) is distinct from 3
     or (select request_count from public.edge_rate_limits where scope = 'create-people-outreach:hour'
      and subject_key = 'actor:' || v_actor) is distinct from 3 then
    raise exception 'creation, replay and rejected command must each consume quota';
  end if;
end;
$$;

rollback;
select '1..1';
select 'ok 1 - outreach quota batch preserves limits, actor scope and failed-command accounting';
