begin;
set local statement_timeout='60s';

insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-00000000fc01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','request-control-a@example.com','{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-00000000fc02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','request-control-b@example.com','{"provider":"email"}','{}',now(),now()),
 ('00000000-0000-0000-0000-00000000fc03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','request-control-c@example.com','{"provider":"email"}','{}',now(),now());
insert into public.user_profiles(id,email,display_name,account_access_state)
values ('00000000-0000-0000-0000-00000000fc01','request-control-a@example.com','Control A','active'),
 ('00000000-0000-0000-0000-00000000fc02','request-control-b@example.com','Control B','active'),
 ('00000000-0000-0000-0000-00000000fc03','request-control-c@example.com','Control C','active')
on conflict(id) do update set account_access_state='active';

do $$
declare a uuid:='00000000-0000-0000-0000-00000000fc01'; b uuid:='00000000-0000-0000-0000-00000000fc02';
  c uuid:='00000000-0000-0000-0000-00000000fc03'; rel uuid:=gen_random_uuid();
  root_id uuid:=gen_random_uuid(); child_id uuid; grandchild_id uuid; cancel_id uuid:=gen_random_uuid();
  accept_id uuid:=gen_random_uuid(); reject_id uuid:=gen_random_uuid(); counter_id uuid:=gen_random_uuid();
  reversal_id uuid:=gen_random_uuid(); target_id uuid; reversal_before jsonb;
  legacy_cancel_id uuid:=gen_random_uuid(); system_cancel_id uuid:=gen_random_uuid(); receiver_cancel_id uuid:=gen_random_uuid();
  corrected_accept_id uuid:=gen_random_uuid(); corrected_accept_child uuid; corrected_accept_ledger uuid;
  cursor_a text; cursor_b text; delta jsonb; expected_history jsonb;
  ack jsonb; replay jsonb; request public.financial_requests%rowtype; owner_id uuid; event record;
begin
  if has_function_privilege('authenticated','public.correct_financial_request(uuid,text,uuid,bigint,text,public.transaction_category,integer)','execute')
    or has_function_privilege('anon','public.cancel_financial_request(uuid,text,uuid,integer)','execute')
    or has_table_privilege('service_role','app_private.financial_request_cases','select')
    or not has_function_privilege('service_role','public.cancel_financial_request(uuid,text,uuid,integer)','execute') then
    raise exception 'sender commands must be service-only and cases private';
  end if;
  insert into public.relationships(id,user_low_id,user_high_id,status) values(rel,a,b,'active');
  perform public.ensure_relationship_accounts(rel);
  insert into public.financial_requests(id,relationship_id,request_type,status,creator_user_id,responder_user_id,
    debtor_user_id,creditor_user_id,amount_minor,description)
  select id,rel,'balance_increase','pending',a,b,a,b,1000,'Initial' from
    unnest(array[root_id,cancel_id,accept_id,reject_id,counter_id,system_cancel_id,receiver_cancel_id,corrected_accept_id]) id;
  insert into public.financial_requests(id,relationship_id,request_type,status,creator_user_id,responder_user_id,
    debtor_user_id,creditor_user_id,amount_minor,description)
    values(legacy_cancel_id,rel,'balance_increase','canceled',a,b,a,b,1000,'Legacy cancellation');
  if (select resolved_by_user_id from public.financial_requests where id=legacy_cancel_id) is not null then
    raise exception 'legacy terminal cancellation invented an actor';
  end if;
  update public.financial_requests set status='canceled',resolved_at=now() where id=system_cancel_id;
  if (select resolved_by_user_id from public.financial_requests where id=system_cancel_id) is not null then
    raise exception 'system cancellation without an actor must remain unattributed';
  end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b)::text,true);
  update public.financial_requests set status='canceled',resolved_at=now() where id=receiver_cancel_id;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  if (select resolved_by_user_id from public.financial_requests where id=receiver_cancel_id) is distinct from b then
    raise exception 'participant cancellation must record the actual authenticated receiver';
  end if;
  select * into request from public.financial_requests where id=root_id;
  if request.request_case_id<>root_id or request.version_number<>1 or request.amendment_kind is not null then
    raise exception 'new roots must receive a stable case and version';
  end if;
  begin
    perform public.correct_financial_request(b,'wrong-actor',root_id,2000,'Correction','other',1);
    raise exception 'receiver corrected sender version';
  exception when others then if sqlerrm<>'request_not_visible_to_actor' then raise; end if; end;
  begin
    perform public.cancel_financial_request(c,'outsider-key',root_id,1);
    raise exception 'outsider canceled request';
  exception when others then if sqlerrm<>'request_not_visible_to_actor' then raise; end if; end;
  begin
    perform public.correct_financial_request(a,'wrong-version',root_id,2000,'Correction','other',2);
    raise exception 'expectedVersion was ignored';
  exception when others then if sqlerrm<>'financial_request_version_conflict' then raise; end if; end;
  ack:=public.correct_financial_request(a,'correct-root',root_id,2000,'Correction','food_drinks',1);
  child_id:=(ack->>'correctedRequestId')::uuid;
  if ack->>'status'<>'pending' or (ack->>'caseId')::uuid<>root_id or (ack->>'version')::integer<>2
    or jsonb_array_length(ack->'financialRequests')<>2 then raise exception 'correction acknowledgement incomplete'; end if;
  if not exists(select 1 from public.financial_requests where id=root_id and status='amended'
      and resolved_by_user_id=a and resolved_at is not null and amendment_kind is null)
    or not exists(select 1 from public.financial_requests where id=child_id and status='pending'
      and parent_request_id=root_id and creator_user_id=a and responder_user_id=b and debtor_user_id=a
      and creditor_user_id=b and amount_minor=2000 and category='food_drinks' and request_case_id=root_id
      and version_number=2 and amendment_kind='sender_correction' and resolved_by_user_id is null) then
    raise exception 'correction must retain roles and close only the old version';
  end if;
  replay:=public.correct_financial_request(a,'correct-root',root_id,2000,'Correction','food_drinks',1);
  if replay<>ack then raise exception 'immediate correction replay must be idempotent'; end if;
  begin
    perform public.correct_financial_request(a,'correct-root',root_id,3000,'Correction','food_drinks',1);
    raise exception 'idempotency key accepted changed amount';
  exception when others then if sqlerrm<>'idempotency_key_reused' then raise; end if; end;
  begin
    perform public.correct_financial_request(a,'stale-correction',root_id,4000,'Late','other',1);
    raise exception 'closed old request created another version';
  exception when others then if sqlerrm<>'financial_request_not_pending' then raise; end if; end;
  begin
    perform public.accept_financial_request(b,'stale-accept',root_id);
    raise exception 'accept retargeted a newer version';
  exception when others then if sqlerrm<>'financial_request_not_pending' then raise; end if; end;
  begin
    perform public.amend_financial_request(b,'stale-amend',root_id,3000,'Late','other');
    raise exception 'counterproposal retargeted a newer version';
  exception when others then if sqlerrm<>'financial_request_not_pending' then raise; end if; end;
  begin
    update public.financial_requests set status='pending' where id=root_id;
    raise exception 'historical ancestor reopened';
  exception when others then if sqlerrm<>'financial_request_not_current' then raise; end if; end;
  begin
    update public.financial_requests set amendment_kind='counterproposal' where id=child_id;
    raise exception 'version origin changed';
  exception when others then if sqlerrm<>'financial_request_version_immutable' then raise; end if; end;

  -- Receiver amendment preserves its previous semantics, while all versions now
  -- share the same case and record the explicit resolution actor.
  ack:=public.amend_financial_request(b,'counter-child',child_id,3000,'Counterproposal','transport');
  grandchild_id:=(ack->>'amendedRequestId')::uuid;
  if not exists(select 1 from public.financial_requests where id=child_id and status='amended'
      and resolved_by_user_id=b and amendment_kind='sender_correction')
    or not exists(select 1 from public.financial_requests where id=grandchild_id and status='pending'
      and creator_user_id=b and responder_user_id=a and request_case_id=root_id and version_number=3
      and amendment_kind='counterproposal') then raise exception 'receiver amendment lost role reversal or creation origin'; end if;
  begin
    perform public.cancel_financial_request(a,'original-sender',grandchild_id,3);
    raise exception 'original sender canceled the other sender counterproposal';
  exception when others then if sqlerrm<>'request_not_visible_to_actor' then raise; end if; end;
  ack:=public.cancel_financial_request(b,'cancel-counter',grandchild_id,3);
  if ack->>'status'<>'canceled' or jsonb_array_length(ack->'financialRequests')<>1 then raise exception 'cancel acknowledgement incomplete'; end if;
  if not exists(select 1 from public.financial_requests where id=grandchild_id and status='canceled'
      and resolved_by_user_id=b and resolved_at is not null and amendment_kind='counterproposal') then
    raise exception 'cancel must retain counterproposal origin';
  end if;
  replay:=public.correct_financial_request(a,'correct-root',root_id,2000,'Correction','food_drinks',1);
  if replay->>'correctedRequestId'<>child_id::text or not exists(select 1 from jsonb_array_elements(replay->'financialRequests') row
      where row->>'id'=child_id::text and row->>'status'='amended') then
    raise exception 'idempotent replay returned stale pending rows';
  end if;
  if exists(select 1 from public.ledger_transactions where origin_request_id in(root_id,child_id,grandchild_id)) then
    raise exception 'correct/counter/cancel must not post ledger entries';
  end if;

  ack:=public.cancel_financial_request(a,'cancel-direct',cancel_id,1);
  if public.cancel_financial_request(a,'cancel-direct',cancel_id,1)<>ack then raise exception 'cancel replay duplicated effects'; end if;
  begin
    perform public.cancel_financial_request(a,'cancel-direct',accept_id,1);
    raise exception 'cancel key reused with another request';
  exception when others then if sqlerrm<>'idempotency_key_reused' then raise; end if; end;
  select epoch.epoch::text||':'||head.revision::text into cursor_a from app_private.history_sync_epoch epoch
    cross join app_private.history_sync_heads head where head.user_id=a;
  select epoch.epoch::text||':'||head.revision::text into cursor_b from app_private.history_sync_epoch epoch
    cross join app_private.history_sync_heads head where head.user_id=b;
  perform public.accept_financial_request(b,'accept-current',accept_id);
  perform public.reject_financial_request(b,'reject-current',reject_id);
  if (select count(*) from public.ledger_transactions where origin_request_id=accept_id)<>1
    or not exists(select 1 from public.financial_requests where id=accept_id and status='accepted' and resolved_by_user_id=b)
    or not exists(select 1 from public.financial_requests where id=reject_id and status='rejected' and resolved_by_user_id=b) then
    raise exception 'legacy accept/reject changed ledger or actor semantics';
  end if;

  -- Reversals post the target's exact entries rather than the requested amount.
  -- Do not offer sender correction for them; cancellation must remain available.
  select id into target_id from public.ledger_transactions where origin_request_id=accept_id;
  select app_private.history_sync_project('history',to_jsonb(history)) into expected_history from public.v_relationship_history history
    where history.item_kind='ledger_transaction' and history.item_id=target_id and history.relationship_id=rel;
  foreach owner_id in array array[a,b] loop
    if (select row_data from app_private.history_sync_rows where user_id=owner_id and collection='history'
        and row_key='ledger_transaction:'||rel::text||':'||target_id::text) is distinct from expected_history then
      raise exception 'accept ledger history omitted the final resolution metadata';
    end if;
    delta:=public.get_history_sync_page(owner_id,case when owner_id=a then cursor_a else cursor_b end,500);
    if (select count(*) from jsonb_array_elements(delta->'changes') change where change->>'collection'='history'
        and change->>'key'='ledger_transaction:'||rel::text||':'||target_id::text
        and change->'row'->>'resolved_by_user_id'=b::text and change->'row'->'resolved_at'<>'null'::jsonb)<>1 then
      raise exception 'accept delta must return the ledger key once with final actor and time';
    end if;
  end loop;
  ack:=public.correct_financial_request(a,'correct-before-accept',corrected_accept_id,2500,'Accepted correction','other',1);
  corrected_accept_child:=(ack->>'correctedRequestId')::uuid;
  perform public.accept_financial_request(b,'accept-corrected-child',corrected_accept_child);
  select id into corrected_accept_ledger from public.ledger_transactions where origin_request_id=corrected_accept_child;
  select app_private.history_sync_project('history',to_jsonb(history)) into expected_history from public.v_relationship_history history
    where history.item_kind='ledger_transaction' and history.item_id=corrected_accept_ledger and history.relationship_id=rel;
  if expected_history->>'amendment_kind'<>'sender_correction' or expected_history->>'request_case_id'<>corrected_accept_id::text
    or expected_history->>'version_number'<>'2' or expected_history->>'resolved_by_user_id'<>b::text then
    raise exception 'accepted corrected version lost its stable origin and resolution';
  end if;
  foreach owner_id in array array[a,b] loop
    if (select row_data from app_private.history_sync_rows where user_id=owner_id and collection='history'
        and row_key='ledger_transaction:'||rel::text||':'||corrected_accept_ledger::text) is distinct from expected_history then
      raise exception 'accepted corrected ledger differs from final authoritative history';
    end if;
  end loop;
  if exists(select 1 from app_private.history_sync_rows where user_id=c and collection='history'
      and row_key in('ledger_transaction:'||rel::text||':'||target_id::text,'ledger_transaction:'||rel::text||':'||corrected_accept_ledger::text)
      and row_data is not null) then raise exception 'ledger resolution history leaked to outsider'; end if;
  insert into public.financial_requests(id,relationship_id,request_type,status,creator_user_id,responder_user_id,
    debtor_user_id,creditor_user_id,amount_minor,description,target_ledger_transaction_id)
    values(reversal_id,rel,'transaction_reversal','pending',a,b,b,a,1000,'Undo movement',target_id);
  select to_jsonb(fr) into reversal_before from public.financial_requests fr where id=reversal_id;
  begin
    perform public.correct_financial_request(a,'reversal-correction',reversal_id,9000,'Changed reversal','other',1);
    raise exception 'sender correction allowed a reversal whose amount is ignored by the ledger';
  exception when others then if sqlerrm<>'financial_request_correction_not_supported' then raise; end if; end;
  if (select to_jsonb(fr) from public.financial_requests fr where id=reversal_id)<>reversal_before
    or exists(select 1 from public.financial_requests where parent_request_id=reversal_id)
    or exists(select 1 from public.audit_events where entity_id=reversal_id and event_name='financial_request_corrected')
    or exists(select 1 from public.idempotency_keys where actor_user_id=a and operation_name='correct_financial_request'
      and idempotency_key='reversal-correction') then
    raise exception 'rejected reversal correction left a partial mutation';
  end if;
  perform public.cancel_financial_request(a,'cancel-reversal',reversal_id,1);
  if not exists(select 1 from public.financial_requests where id=reversal_id and status='canceled'
      and resolved_by_user_id=a and resolved_at is not null)
    or exists(select 1 from public.ledger_transactions where origin_request_id=reversal_id)
    or (select count(*) from public.ledger_transactions where id=target_id)<>1
    or (select count(*) from public.ledger_entries where ledger_transaction_id=target_id)<>2 then
    raise exception 'canceling a pending reversal must preserve the original ledger';
  end if;
  begin
    perform public.cancel_financial_request(a,'accepted-cancel',accept_id,1);
    raise exception 'sender canceled an accepted ledger request';
  exception when others then if sqlerrm<>'financial_request_not_pending' then raise; end if; end;
  ack:=public.amend_financial_request(b,'counter-root',counter_id,5000,'Counter root','other');
  if not exists(select 1 from public.financial_requests where id=(ack->>'amendedRequestId')::uuid
      and creator_user_id=b and responder_user_id=a and amendment_kind='counterproposal' and version_number=2) then
    raise exception 'legacy amendment of a root no longer works';
  end if;
  if exists(select 1 from public.financial_requests where request_case_id=root_id and status='pending')
    or exists(select 1 from public.financial_requests group by request_case_id having count(*) filter(where status='pending')>1) then
    raise exception 'case has multiple pending versions';
  end if;
  foreach owner_id in array array[a,b] loop
    if not exists(select 1 from app_private.history_sync_rows where user_id=owner_id and collection='financialRequests'
        and row_key=grandchild_id::text and row_data->>'status'='canceled' and row_data->>'resolved_by_user_id'=b::text)
      or not exists(select 1 from app_private.history_sync_rows where user_id=owner_id and collection='history'
        and row_key='financial_request:'||rel::text||':'||child_id::text
        and row_data->>'amendment_kind'='sender_correction' and row_data->>'resolved_by_user_id'=b::text) then
      raise exception 'both participants must receive the same final history metadata';
    end if;
    for event in select id from public.audit_events where actor_user_id=owner_id and entity_id in(root_id,grandchild_id,cancel_id)
      and event_name in('financial_request_corrected','financial_request_canceled') loop
      if not exists(select 1 from app_private.history_sync_rows where user_id=owner_id and collection='auditEvents'
          and row_key=event.id::text and row_data is not null) then raise exception 'audit event missing for its actor'; end if;
    end loop;
  end loop;
  if exists(select 1 from app_private.history_sync_rows where user_id=c and collection='financialRequests'
      and row_key in(root_id::text,child_id::text,grandchild_id::text)) then raise exception 'new history leaked to outsider'; end if;
end $$;

rollback;
select '1..1';
select 'ok 1 - sender correction and cancellation preserve roles, version origin, current head, replay, ledger and both histories';
