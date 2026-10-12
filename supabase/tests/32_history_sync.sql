begin;
set local statement_timeout = '60s';

insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-00000000ef01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','history-sync-a@example.com','{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-00000000ef02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','history-sync-b@example.com','{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-00000000ef03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','history-sync-c@example.com','{"provider":"email"}','{}',now(),now());
insert into public.user_profiles(id,email,display_name,account_access_state)
values
 ('00000000-0000-0000-0000-00000000ef01','history-sync-a@example.com','History A','active'),
 ('00000000-0000-0000-0000-00000000ef02','history-sync-b@example.com','History B','active'),
 ('00000000-0000-0000-0000-00000000ef03','history-sync-c@example.com','History C','active')
on conflict(id) do update set account_access_state='active';

do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-00000000ef01';
  v_other uuid := '00000000-0000-0000-0000-00000000ef02';
  v_outsider uuid := '00000000-0000-0000-0000-00000000ef03';
  v_relationship uuid := gen_random_uuid(); v_request uuid := gen_random_uuid();
  v_invite uuid := gen_random_uuid(); v_delivery uuid:=gen_random_uuid();
  v_case uuid:=gen_random_uuid(); v_proposal uuid:=gen_random_uuid(); v_replacement uuid:=gen_random_uuid(); v_score uuid:=gen_random_uuid();
  v_page jsonb; v_cursor text; v_epoch text; v_payload jsonb;
  v_head bigint; v_count integer := 0; v_pages integer := 0;
begin
  if has_function_privilege('anon','public.get_history_sync_page(uuid,text,integer)','execute')
    or has_function_privilege('authenticated','public.get_history_sync_page(uuid,text,integer)','execute')
    or not has_function_privilege('service_role','public.get_history_sync_page(uuid,text,integer)','execute')
    or has_table_privilege('authenticated','app_private.history_sync_rows','select')
    or has_function_privilege('authenticated','app_private.history_sync_source(uuid,text,text)','execute') then
    raise exception 'history sync must be a private, service-only feed';
  end if;
  if not (select relrowsecurity from pg_class where oid='app_private.history_sync_rows'::regclass) then
    raise exception 'private history journal must have RLS';
  end if;

  insert into public.relationships(id,user_low_id,user_high_id,status) values(v_relationship,v_owner,v_other,'active');
  insert into public.financial_requests(id,relationship_id,request_type,status,creator_user_id,responder_user_id,
    debtor_user_id,creditor_user_id,amount_minor,created_at)
    select gen_random_uuid(),v_relationship,'balance_increase','rejected',v_owner,v_other,v_owner,v_other,1000,
      '2020-01-01'::timestamptz from generate_series(1,320);
  insert into public.financial_requests(id,relationship_id,request_type,status,creator_user_id,responder_user_id,
    debtor_user_id,creditor_user_id,amount_minor,created_at)
    values(v_request,v_relationship,'balance_increase','pending',v_owner,v_other,v_owner,v_other,2000,'2020-01-01');
  loop
    v_page:=public.get_history_sync_page(v_owner,v_cursor,37);
    if v_pages=0 and not (v_page->>'reset')::boolean then raise exception 'bootstrap must reset'; end if;
    if jsonb_array_length(v_page->'changes')>37 then raise exception 'page size not respected'; end if;
    v_count:=v_count+(select count(*) from jsonb_array_elements(v_page->'changes') c
      where c->>'collection'='financialRequests' and c->'row'<>'null'::jsonb);
    v_cursor:=v_page->>'cursor'; v_pages:=v_pages+1;
    exit when not(v_page->>'hasMore')::boolean;
    if v_pages>100 then raise exception 'bootstrap failed to make progress'; end if;
  end loop;
  if v_count<>320 then raise exception 'bootstrap truncated historical requests: %',v_count; end if;
  if jsonb_array_length(public.get_history_sync_page(v_owner,v_cursor,37)->'changes')<>0 then
    raise exception 'unchanged sync must not redownload historical data';
  end if;
  if jsonb_array_length(public.get_history_sync_page(v_outsider,null,500)->'changes')<>0 then
    raise exception 'feed leaked another actor history';
  end if;

  -- Resolution of a request with an old created_at must not fall behind the cursor.
  update public.financial_requests set status='rejected',resolved_at=now() where id=v_request;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if not exists(select 1 from jsonb_array_elements(v_page->'changes') c
      where c->>'collection'='financialRequests' and c->'row'->>'id'=v_request::text) then
    raise exception 'old-created_at resolution was lost';
  end if;
  v_cursor:=v_page->>'cursor';
  select revision into v_head from app_private.history_sync_heads where user_id=v_owner;
  perform app_private.history_sync_source(v_owner,'financial_request',v_request::text);
  if (select revision from app_private.history_sync_heads where user_id=v_owner)<>v_head then
    raise exception 'identical source payload inflated revisions';
  end if;
  -- Journal failure must roll back the source mutation, rather than be swallowed
  -- by the best-effort Realtime error handling.
  begin
    update app_private.history_sync_heads set revision=9223372036854775807 where user_id=v_owner;
    update public.financial_requests set description='must roll back with failed journal' where id=v_request;
    raise exception 'journal failure was swallowed';
  exception when numeric_value_out_of_range then null;
  end;
  if (select description from public.financial_requests where id=v_request)='must roll back with failed journal'
    or (select revision from app_private.history_sync_heads where user_id=v_owner)<>v_head then
    raise exception 'source and feed cursor did not roll back together';
  end if;

  update public.financial_requests set status='pending',resolved_at=null where id=v_request;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if not exists(select 1 from jsonb_array_elements(v_page->'changes') c
    where c->>'collection'='financialRequests' and c->>'key'=v_request::text and c->'row'='null'::jsonb) then
    raise exception 'historical-to-active transition must tombstone historical copy';
  end if;
  v_cursor:=v_page->>'cursor';

  update public.user_profiles set display_name='History B renamed' where id=v_other;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if not exists(select 1 from jsonb_array_elements(v_page->'changes') c
    where c->>'collection'='profiles' and c->'row'->>'display_name'='History B renamed') then
    raise exception 'historical profile edits must invalidate old names';
  end if;
  v_cursor:=v_page->>'cursor';

  update public.relationships set status='archived' where id=v_relationship;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if exists(select 1 from app_private.history_sync_rows where user_id=v_owner and collection='history'
    and row_data->>'relationship_id'=v_relationship::text) then
    raise exception 'relationship access removal left historical rows readable';
  end if;

  -- The durable tombstone survives a later re-open and supersedes old pages.
  update public.relationships set status='active' where id=v_relationship;
  if (select count(*) from app_private.history_sync_rows where user_id=v_owner and collection='history'
    and row_data->>'relationship_id'=v_relationship::text)<>320 then
    raise exception 'reopened access must restore complete historical rows';
  end if;

  v_page:=public.get_history_sync_page(v_owner,'00000000-0000-4000-8000-000000000001:1',17);
  if not(v_page->>'reset')::boolean then raise exception 'epoch mismatch must reset'; end if;
  v_epoch:=split_part(v_cursor,':',1);
  if not(public.get_history_sync_page(v_owner,v_epoch||':9223372036854775807',17)->>'reset')::boolean then
    raise exception 'future cursor must reset';
  end if;
  if not(public.get_history_sync_page(v_owner,'malformed:not-a-number',17)->>'reset')::boolean then
    raise exception 'malformed cursor must reset without unsafe numeric casts';
  end if;

  -- Closed invite projections cannot persist bearer credentials. When the last
  -- permission-bearing source disappears, its profile references disappear too.
  insert into public.account_invites(id,inviter_user_id,activated_user_id,status,expires_at)
    values(v_invite,v_owner,v_outsider,'rejected',now()+interval '1 day');
  insert into public.account_invite_deliveries(id,invite_id,token_hash,channel,status,expires_at)
    values(v_delivery,v_invite,repeat('a',64),'qr','issued',now()+interval '1 day');
  select row_data into v_payload from app_private.history_sync_rows where user_id=v_owner
    and collection='accountInviteDeliveries' and row_key=v_delivery::text;
  if v_payload is null or v_payload?'token_hash' or v_payload?'token' then
    raise exception 'delivery journal must project safe fields only';
  end if;
  delete from public.account_invites where id=v_invite;
  if exists(select 1 from app_private.history_sync_rows where user_id=v_owner and collection='profiles'
    and row_key=v_outsider::text and row_data is not null) then
    raise exception 'access removal retained unrelated historical profile';
  end if;
  v_page:=public.get_history_sync_page(v_owner,null,500);
  -- Drain before checking that a former counterparty's future profile updates
  -- cannot publish new private fields to this owner.
  loop
    v_cursor:=v_page->>'cursor'; exit when not(v_page->>'hasMore')::boolean;
    v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  end loop;
  update public.user_profiles set display_name='Private outsider rename' where id=v_outsider;
  if exists(select 1 from jsonb_array_elements(public.get_history_sync_page(v_owner,v_cursor,500)->'changes') c
    where c->>'collection'='profiles' and c->'row'->>'id'=v_outsider::text) then
    raise exception 'former profile permission leaked a later rename';
  end if;

  -- Privacy projections of closed circles retain only the actor's direct edges,
  -- while aggregate decisions still change when an indirect participant acts.
  v_payload:=jsonb_build_array(
    jsonb_build_object('debtor_user_id',v_owner,'creditor_user_id',v_other,'amount_minor',1000),
    jsonb_build_object('debtor_user_id',v_other,'creditor_user_id',v_outsider,'amount_minor',1000));
  insert into public.happy_circle_cases(id,anchor_user_low_id,anchor_user_high_id,participant_set_hash,created_by_user_id)
    values(v_case,v_owner,v_other,repeat('d',64),v_owner);
  insert into public.settlement_proposals(id,created_by_user_id,status,graph_snapshot_hash,graph_snapshot,movements_json,happy_circle_case_id,version_number)
    values(v_proposal,v_outsider,'rejected','history-test-hash',v_payload,v_payload,v_case,1),
      (v_replacement,v_outsider,'rejected','history-replacement-hash','[]','[]',v_case,2);
  insert into public.settlement_proposal_participants(settlement_proposal_id,participant_user_id,decision,approval_scope_hash)
    values(v_proposal,v_owner,'approved',repeat('a',64)),(v_proposal,v_other,'approved',repeat('b',64)),
      (v_proposal,v_outsider,'pending',repeat('c',64));
  select row_data into v_payload from app_private.history_sync_rows where user_id=v_owner
    and collection='settlementProposals' and row_key=v_proposal::text;
  if jsonb_array_length(v_payload->'movements_json')<>1 or v_payload->>'created_by_user_id'<>v_owner::text
    or (v_payload->>'privacy_participant_count')::integer<>3
    or exists(select 1 from app_private.history_sync_rows where user_id=v_owner and collection='settlementParticipants'
      and row_data->>'participant_user_id'=v_outsider::text) then
    raise exception 'closed circle feed exposed indirect participant data';
  end if;
  v_page:=public.get_history_sync_page(v_owner,null,500);
  loop v_cursor:=v_page->>'cursor'; exit when not(v_page->>'hasMore')::boolean;
    v_page:=public.get_history_sync_page(v_owner,v_cursor,500); end loop;
  update public.settlement_proposal_participants set decision='approved'
    where settlement_proposal_id=v_proposal and participant_user_id=v_outsider;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if not exists(select 1 from jsonb_array_elements(v_page->'changes') c where c->>'collection'='settlementProposals'
    and c->'row'->>'id'=v_proposal::text and (c->'row'->>'privacy_approved_count')::integer=3) then
    raise exception 'indirect decision did not refresh actor aggregate';
  end if;
  v_cursor:=v_page->>'cursor';
  update public.settlement_proposals set replaced_by_proposal_id=v_replacement where id=v_proposal;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if not exists(select 1 from jsonb_array_elements(v_page->'changes') c where c->>'collection'='settlementProposals'
    and c->'row'->>'replaced_by_proposal_id'=v_replacement::text) then
    raise exception 'closed circle lineage update fell behind cursor';
  end if;
  insert into public.happy_circle_score_events(id,user_id,settlement_proposal_id,score_delta,participant_count,awarded_at)
    values(v_score,v_owner,v_proposal,3,3,'2020-01-01');
  v_page:=public.get_history_sync_page(v_owner,v_page->>'cursor',500); v_cursor:=v_page->>'cursor';
  update public.happy_circle_score_events set treasure_claimed_at=now() where id=v_score;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if not exists(select 1 from jsonb_array_elements(v_page->'changes') c where c->>'collection'='happyCircleScoreEvents'
    and c->'row'->>'id'=v_score::text and c->'row'->>'treasure_claimed_at' is not null) then
    raise exception 'treasure claim on an old award was lost';
  end if;
  v_cursor:=v_page->>'cursor';
  delete from public.settlement_proposal_participants where settlement_proposal_id=v_proposal and participant_user_id=v_owner;
  v_page:=public.get_history_sync_page(v_owner,v_cursor,500);
  if not exists(select 1 from jsonb_array_elements(v_page->'changes') c where c->>'collection'='settlementProposals'
    and c->>'key'=v_proposal::text and c->'row'='null'::jsonb) then
    raise exception 'removed circle membership retained historical permission';
  end if;
end;
$$;
rollback;
