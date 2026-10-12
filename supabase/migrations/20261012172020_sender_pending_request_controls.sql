-- A request case is a linear chain. Commands lock the requested row first,
-- reject closed versions immediately, then lock its case before any ledger work.
-- The head intentionally has no FK back to financial_requests: a reverse FK
-- would introduce case -> request key-share locks against request -> case locks.
create table app_private.financial_request_cases (
  case_id uuid primary key,
  last_request_id uuid not null,
  last_version integer not null check(last_version > 0),
  created_at timestamptz not null default now()
);
alter table app_private.financial_request_cases enable row level security;
revoke all on app_private.financial_request_cases from public,anon,authenticated,service_role;

alter table public.financial_requests
  add column request_case_id uuid,
  add column version_number integer,
  add column resolved_by_user_id uuid references public.user_profiles(id),
  add column amendment_kind text check(amendment_kind in ('sender_correction','counterproposal'));

-- Fail rather than silently rewriting a fork, an orphan/cycle, or two pending
-- versions. All historical children were created by the receiver's amendment.
lock table public.financial_requests in share row exclusive mode;
do $$
declare v_count bigint;
begin
  if exists(select 1 from public.financial_requests where parent_request_id is not null
      group by parent_request_id having count(*)>1) then
    raise exception 'financial_request_legacy_fork';
  end if;
  with recursive chain as (
    select id, id as case_id, 1 as version from public.financial_requests where parent_request_id is null
    union all
    select child.id,chain.case_id,chain.version+1 from public.financial_requests child
      join chain on child.parent_request_id=chain.id
  )
  update public.financial_requests request set request_case_id=chain.case_id,
    version_number=chain.version,
    amendment_kind=case when request.parent_request_id is not null then 'counterproposal' end,
    -- Legacy cancellation may have been a side effect of either participant's
    -- account lifecycle. Its status alone does not identify an actor.
    resolved_by_user_id=case when request.status in ('accepted','rejected','amended') then request.responder_user_id end
  from chain where request.id=chain.id;
  select count(*) into v_count from public.financial_requests where request_case_id is null;
  if v_count<>0 then raise exception 'financial_request_legacy_orphan_or_cycle'; end if;
  if exists(select 1 from public.financial_requests where status='pending'
      group by request_case_id having count(*)>1) then
    raise exception 'financial_request_legacy_pending_conflict';
  end if;
  if exists(select 1 from public.financial_requests pending where pending.status='pending'
      and exists(select 1 from public.financial_requests child where child.parent_request_id=pending.id)) then
    raise exception 'financial_request_legacy_pending_not_current';
  end if;
end $$;
insert into app_private.financial_request_cases(case_id,last_request_id,last_version,created_at)
  select distinct on(request_case_id) request_case_id,id,version_number,created_at
  from public.financial_requests order by request_case_id,version_number desc;
alter table public.financial_requests
  alter column request_case_id set not null,
  alter column version_number set not null,
  add constraint financial_requests_case_fkey foreign key(request_case_id)
    references app_private.financial_request_cases(case_id),
  add constraint financial_requests_version_positive check(version_number>0);
create unique index financial_requests_case_version_idx on public.financial_requests(request_case_id,version_number);
create unique index financial_requests_one_pending_case_idx on public.financial_requests(request_case_id) where status='pending';
create index financial_requests_parent_idx on public.financial_requests(parent_request_id) where parent_request_id is not null;
create index financial_requests_resolved_by_idx on public.financial_requests(resolved_by_user_id) where resolved_by_user_id is not null;

create function app_private.lock_current_financial_request(p_request_id uuid,p_expected_version integer default null)
returns public.financial_requests language plpgsql security definer set search_path='' as $$
declare v_request public.financial_requests%rowtype; v_head app_private.financial_request_cases%rowtype;
begin
  select * into v_request from public.financial_requests where id=p_request_id for update;
  if not found then raise exception 'financial_request_not_found'; end if;
  if v_request.status<>'pending' then raise exception 'financial_request_not_pending'; end if;
  if p_expected_version is not null and p_expected_version<>v_request.version_number then
    raise exception 'financial_request_version_conflict';
  end if;
  select * into v_head from app_private.financial_request_cases where case_id=v_request.request_case_id for update;
  if not found or v_head.last_request_id<>v_request.id or v_head.last_version<>v_request.version_number then
    raise exception 'financial_request_not_current';
  end if;
  return v_request;
end $$;

create function app_private.tg_financial_request_version_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_parent public.financial_requests%rowtype; v_head app_private.financial_request_cases%rowtype;
begin
  if tg_op='INSERT' then
    if new.parent_request_id is null then
      if (new.request_case_id is not null and new.request_case_id<>new.id)
        or (new.version_number is not null and new.version_number<>1) or new.amendment_kind is not null then
        raise exception 'financial_request_invalid_version';
      end if;
      new.request_case_id:=new.id; new.version_number:=1;
      insert into app_private.financial_request_cases(case_id,last_request_id,last_version)
        values(new.id,new.id,1);
    else
      select * into v_parent from public.financial_requests where id=new.parent_request_id for update;
      if not found then raise exception 'financial_request_not_found'; end if;
      if v_parent.status<>'amended' then raise exception 'financial_request_not_pending'; end if;
      select * into v_head from app_private.financial_request_cases where case_id=v_parent.request_case_id for update;
      if v_head.last_request_id<>v_parent.id or v_head.last_version<>v_parent.version_number then
        raise exception 'financial_request_not_current';
      end if;
      if (new.request_case_id is not null and new.request_case_id<>v_parent.request_case_id)
        or (new.version_number is not null and new.version_number<>v_parent.version_number+1) then
        raise exception 'financial_request_invalid_version';
      end if;
      new.request_case_id:=v_parent.request_case_id; new.version_number:=v_parent.version_number+1;
      new.amendment_kind:=coalesce(new.amendment_kind,'counterproposal');
      if new.relationship_id<>v_parent.relationship_id or new.request_type<>v_parent.request_type
        or new.debtor_user_id<>v_parent.debtor_user_id or new.creditor_user_id<>v_parent.creditor_user_id
        or new.target_ledger_transaction_id is distinct from v_parent.target_ledger_transaction_id
        or (new.amendment_kind='sender_correction' and (new.creator_user_id<>v_parent.creator_user_id or new.responder_user_id<>v_parent.responder_user_id))
        or (new.amendment_kind='counterproposal' and (new.creator_user_id<>v_parent.responder_user_id or new.responder_user_id<>v_parent.creator_user_id)) then
        raise exception 'financial_request_invalid_version';
      end if;
      if new.status<>'pending' then raise exception 'financial_request_invalid_version'; end if;
      update app_private.financial_request_cases set last_request_id=new.id,last_version=new.version_number
        where case_id=new.request_case_id;
    end if;
    if new.status='pending' then
      new.resolved_at:=null; new.resolved_by_user_id:=null;
    elsif new.resolved_by_user_id is null then
      -- A terminal imported cancellation has no attributable actor unless the
      -- source supplied one explicitly. Do not infer its creator or current JWT.
      new.resolved_by_user_id:=case when new.status in ('accepted','rejected','amended') then new.responder_user_id end;
    end if;
    return new;
  end if;
  if new.request_case_id is distinct from old.request_case_id or new.version_number is distinct from old.version_number
    or new.amendment_kind is distinct from old.amendment_kind or new.parent_request_id is distinct from old.parent_request_id then
    raise exception 'financial_request_version_immutable';
  end if;
  if old.status='pending' or new.status='pending' then
    -- BEFORE UPDATE has already obtained the row lock. Check stale closed rows
    -- before the case lock; reopening a historical ancestor is never allowed.
    if old.status<>'pending' and exists(select 1 from public.financial_requests where parent_request_id=old.id) then
      raise exception 'financial_request_not_current';
    end if;
    select * into v_head from app_private.financial_request_cases where case_id=old.request_case_id for update;
    if v_head.last_request_id<>old.id or v_head.last_version<>old.version_number then
      raise exception 'financial_request_not_current';
    end if;
    if new.status='pending' then
      new.resolved_by_user_id:=null; new.resolved_at:=null;
    elsif old.status='pending' then
      new.resolved_at:=coalesce(new.resolved_at,now());
      new.resolved_by_user_id:=coalesce(new.resolved_by_user_id,
        case when new.status='canceled' and auth.uid() in(old.creator_user_id,old.responder_user_id) then auth.uid()
          when new.status in ('accepted','rejected','amended') then old.responder_user_id end);
      if new.resolved_by_user_id is not null and new.resolved_by_user_id not in(old.creator_user_id,old.responder_user_id) then
        raise exception 'request_not_visible_to_actor';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger financial_request_version_guard before insert or update on public.financial_requests
for each row execute function app_private.tg_financial_request_version_guard();
revoke all on function app_private.lock_current_financial_request(uuid,integer),app_private.tg_financial_request_version_guard()
  from public,anon,authenticated,service_role;

-- Keep the current business implementations and their ACLs. Inserting this
-- guard before graph/ledger work brings all three legacy commands into the same
-- lock order. Fail on source drift instead of silently omitting a guard.
do $$
declare v_signature text; v_definition text; v_updated text;
  v_marker text := E'if v_request.status <> ''pending'' then\n    raise exception ''financial_request_not_pending'';\n  end if;';
begin
  foreach v_signature in array array['public.accept_financial_request(uuid,text,uuid)',
    'public.reject_financial_request(uuid,text,uuid)',
    'public.amend_financial_request(uuid,text,uuid,bigint,text,public.transaction_category)'] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if strpos(v_definition,v_marker)=0 then raise exception 'financial_request_command_definition_drift: %',v_signature; end if;
    v_updated:=replace(v_definition,v_marker,v_marker||E'\n  perform app_private.lock_current_financial_request(p_request_id,null);');
    execute v_updated;
  end loop;
end $$;

-- Append columns to the existing security-invoker view without changing its
-- historical projections or ledger grouping. Ledger rows inherit origin metadata.
do $$
declare v_definition text;
begin
  v_definition:=regexp_replace(pg_get_viewdef('public.v_relationship_history'::regclass,true),';\s*$','');
  execute 'create or replace view public.v_relationship_history as select history.*,
    request.request_case_id,request.version_number,request.resolved_by_user_id,request.amendment_kind,
    request.parent_request_id,request.resolved_at from ('||v_definition||') history
    left join public.financial_requests request on request.id=history.origin_request_id';
end $$;
alter view public.v_relationship_history set(security_invoker=true);

-- Extend only the two allowlists; no unrestricted row serialization enters the
-- durable feed. A later schema column remains private unless explicitly added.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('app_private.history_sync_project(text,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'''updated_at'',''resolved_at'']',
    '''updated_at'',''resolved_at'',''request_case_id'',''version_number'',''resolved_by_user_id'',''amendment_kind'']');
  v_definition:=replace(v_definition,'''origin_settlement_proposal_id'',''happened_at'']',
    '''origin_settlement_proposal_id'',''happened_at'',''request_case_id'',''version_number'',''resolved_by_user_id'',''amendment_kind'',''parent_request_id'',''resolved_at'']');
  execute v_definition;
end $$;

create function app_private.financial_request_ack_rows(p_actor_user_id uuid,p_ack jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  select p_ack || jsonb_build_object('financialRequests',coalesce(jsonb_agg(
    app_private.history_sync_project('financialRequests',to_jsonb(request)) order by request.version_number),'[]'::jsonb))
  from public.financial_requests request
  where request.id::text in(p_ack->>'requestId',p_ack->>'originalRequestId',p_ack->>'correctedRequestId')
    and p_actor_user_id in(request.creator_user_id,request.responder_user_id);
$$;
revoke all on function app_private.financial_request_ack_rows(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.correct_financial_request(
  p_actor_user_id uuid,p_idempotency_key text,p_request_id uuid,p_amount_minor bigint,
  p_description text,p_category public.transaction_category default 'other',p_expected_version integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.financial_requests%rowtype; v_idempotency public.idempotency_keys%rowtype;
  v_new_id uuid; v_response jsonb; v_hash text;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if not exists(select 1 from public.user_profiles where id=p_actor_user_id and account_access_state='active') then
    raise exception 'account_access_restricted';
  end if;
  if p_amount_minor is null or p_amount_minor<=0 or p_amount_minor>9007199254740991 then raise exception 'Invalid amountMinor'; end if;
  if p_description is null or btrim(p_description)='' or length(p_description)>240 then raise exception 'Invalid description'; end if;
  if p_category is null or p_category='cycle' then raise exception 'cycle_category_reserved'; end if;
  if p_expected_version is not null and p_expected_version<1 then raise exception 'Invalid expectedVersion'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then raise exception 'invalid_idempotency_key'; end if;
  v_hash:=encode(extensions.digest(jsonb_build_object('requestId',p_request_id,'amountMinor',p_amount_minor,
    'description',p_description,'category',p_category,'expectedVersion',p_expected_version)::text,'sha256'),'hex');
  insert into public.idempotency_keys(actor_user_id,operation_name,idempotency_key,request_hash)
    values(p_actor_user_id,'correct_financial_request',p_idempotency_key,v_hash) on conflict do nothing;
  select * into v_idempotency from public.idempotency_keys where actor_user_id=p_actor_user_id
    and operation_name='correct_financial_request' and idempotency_key=p_idempotency_key for update;
  if v_idempotency.request_hash is distinct from v_hash then raise exception 'idempotency_key_reused'; end if;
  if v_idempotency.response_json is not null then
    return app_private.financial_request_ack_rows(p_actor_user_id,v_idempotency.response_json);
  end if;
  if not exists(select 1 from public.financial_requests where id=p_request_id and creator_user_id=p_actor_user_id) then
    raise exception 'request_not_visible_to_actor';
  end if;
  v_request:=app_private.lock_current_financial_request(p_request_id,p_expected_version);
  if v_request.creator_user_id<>p_actor_user_id then raise exception 'request_not_visible_to_actor'; end if;
  -- Reversal acceptance copies the original ledger entries, ignoring a request
  -- amount. Sender correction is therefore limited to balance requests. A
  -- pending reversal may still be canceled, without touching its target ledger.
  if v_request.request_type<>'balance_increase' then
    raise exception 'financial_request_correction_not_supported';
  end if;
  update public.financial_requests set status='amended',resolved_at=now(),resolved_by_user_id=p_actor_user_id where id=v_request.id;
  insert into public.financial_requests(relationship_id,request_type,status,creator_user_id,responder_user_id,
    debtor_user_id,creditor_user_id,amount_minor,currency_code,description,category,parent_request_id,
    target_ledger_transaction_id,amendment_kind)
    values(v_request.relationship_id,v_request.request_type,'pending',v_request.creator_user_id,v_request.responder_user_id,
      v_request.debtor_user_id,v_request.creditor_user_id,p_amount_minor,v_request.currency_code,p_description,p_category,
      v_request.id,v_request.target_ledger_transaction_id,'sender_correction') returning id into v_new_id;
  perform public.append_audit_event(p_actor_user_id,'financial_request',v_request.id,'financial_request_corrected',v_new_id,
    jsonb_build_object('corrected_request_id',v_new_id,'amount_minor',p_amount_minor,'category',p_category,
      'request_case_id',v_request.request_case_id,'version_number',v_request.version_number+1));
  v_response:=jsonb_build_object('originalRequestId',v_request.id,'correctedRequestId',v_new_id,
    'caseId',v_request.request_case_id,'version',v_request.version_number+1,'status','pending');
  update public.idempotency_keys set response_json=v_response,completed_at=now() where id=v_idempotency.id;
  return app_private.financial_request_ack_rows(p_actor_user_id,v_response);
end $$;

create function public.cancel_financial_request(p_actor_user_id uuid,p_idempotency_key text,p_request_id uuid,
  p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.financial_requests%rowtype; v_idempotency public.idempotency_keys%rowtype;
  v_response jsonb; v_hash text;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if not exists(select 1 from public.user_profiles where id=p_actor_user_id and account_access_state='active') then
    raise exception 'account_access_restricted';
  end if;
  if p_expected_version is not null and p_expected_version<1 then raise exception 'Invalid expectedVersion'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 then raise exception 'invalid_idempotency_key'; end if;
  v_hash:=encode(extensions.digest(jsonb_build_object('requestId',p_request_id,'expectedVersion',p_expected_version)::text,'sha256'),'hex');
  insert into public.idempotency_keys(actor_user_id,operation_name,idempotency_key,request_hash)
    values(p_actor_user_id,'cancel_financial_request',p_idempotency_key,v_hash) on conflict do nothing;
  select * into v_idempotency from public.idempotency_keys where actor_user_id=p_actor_user_id
    and operation_name='cancel_financial_request' and idempotency_key=p_idempotency_key for update;
  if v_idempotency.request_hash is distinct from v_hash then raise exception 'idempotency_key_reused'; end if;
  if v_idempotency.response_json is not null then
    return app_private.financial_request_ack_rows(p_actor_user_id,v_idempotency.response_json);
  end if;
  if not exists(select 1 from public.financial_requests where id=p_request_id and creator_user_id=p_actor_user_id) then
    raise exception 'request_not_visible_to_actor';
  end if;
  v_request:=app_private.lock_current_financial_request(p_request_id,p_expected_version);
  if v_request.creator_user_id<>p_actor_user_id then raise exception 'request_not_visible_to_actor'; end if;
  update public.financial_requests set status='canceled',resolved_at=now(),resolved_by_user_id=p_actor_user_id where id=v_request.id;
  perform public.append_audit_event(p_actor_user_id,'financial_request',v_request.id,'financial_request_canceled',v_request.id,
    jsonb_build_object('request_case_id',v_request.request_case_id,'version_number',v_request.version_number));
  v_response:=jsonb_build_object('requestId',v_request.id,'caseId',v_request.request_case_id,
    'version',v_request.version_number,'status','canceled');
  update public.idempotency_keys set response_json=v_response,completed_at=now() where id=v_idempotency.id;
  return app_private.financial_request_ack_rows(p_actor_user_id,v_response);
end $$;
revoke all on function public.correct_financial_request(uuid,text,uuid,bigint,text,public.transaction_category,integer),
  public.cancel_financial_request(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.correct_financial_request(uuid,text,uuid,bigint,text,public.transaction_category,integer),
  public.cancel_financial_request(uuid,text,uuid,integer) to service_role;

-- Refresh existing journal rows with the final metadata. Owners are visited in
-- UUID order, matching the existing fanout lock order, within this migration tx.
do $$
declare v_owner uuid; v_request record;
begin
  for v_owner in select id from public.user_profiles order by id loop
    for v_request in select id from public.financial_requests where
      v_owner in(creator_user_id,responder_user_id,debtor_user_id,creditor_user_id) order by id loop
      perform app_private.history_sync_source(v_owner,'financial_request',v_request.id::text);
    end loop;
    for v_request in select id from public.ledger_transactions where origin_request_id is not null order by id loop
      perform app_private.history_sync_source(v_owner,'ledger_transaction',v_request.id::text);
    end loop;
  end loop;
end $$;
