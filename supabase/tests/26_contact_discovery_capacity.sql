begin;
do $$
declare
  v_actor uuid := (select id from public.user_profiles order by id limit 1);
  v_session uuid;
  v_size integer;
  v_offset integer;
  v_batches integer;
  v_started timestamptz;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'capacity test requires the local demo fixture'; end if;
  foreach v_size in array array[1000, 10000] loop
    v_session := gen_random_uuid();
    v_started := clock_timestamp();
    v_offset := 1;
    v_batches := 0;
    while v_offset <= v_size loop
      v_result := public.resolve_people_targets_observed(v_actor,
        array(select '+5738' || lpad(number::text, 8, '0')
              from generate_series(v_offset, least(v_offset + 59, v_size)) number), v_session);
      if jsonb_array_length(v_result) <> least(60, v_size - v_offset + 1) then
        raise exception 'discovery batch dropped phones';
      end if;
      v_offset := v_offset + 60;
      v_batches := v_batches + 1;
    end loop;
    if (select count(*) from app_private.contact_discovery_watches
        where owner_user_id = v_actor and session_id = v_session) <> v_size then
      raise exception 'full agenda must be observed including numbers beyond page one';
    end if;
    if public.manage_contact_discovery(v_actor, v_session, 'renew') ->> 'status' <> 'renewed' then
      raise exception 'one heartbeat must renew the whole agenda without resolving it again';
    end if;
    raise notice 'discovery benchmark: phones=%, batches=%, database_ms=%',
      v_size, v_batches, round(extract(epoch from (clock_timestamp() - v_started)) * 1000);
    perform public.manage_contact_discovery(v_actor, v_session, 'stop');
  end loop;
end;
$$;
rollback;
select '1..1';
select 'ok 1 - 1000 and 10000 phone agendas register in bounded batches and renew once';
