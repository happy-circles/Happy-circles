-- Durable latest-state feed. Revisions are allocated under an owner row lock,
-- held until COMMIT, rather than by a sequence or a wall-clock timestamp.
-- A committed higher revision therefore cannot hide an uncommitted lower one.
create schema if not exists app_private;
create table app_private.history_sync_epoch (
  singleton boolean primary key default true check (singleton),
  epoch uuid not null default gen_random_uuid()
);
insert into app_private.history_sync_epoch(singleton) values (true);
create table app_private.history_sync_heads (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);
create table app_private.history_sync_rows (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  collection text not null check (collection in ('financialRequests', 'history',
    'friendshipInvites', 'friendshipInviteDeliveries', 'accountInvites',
    'accountInviteDeliveries', 'settlementProposals', 'settlementParticipants',
    'happyCircleScoreEvents', 'auditEvents', 'profiles')),
  row_key text not null,
  scope_id text not null,
  revision bigint not null check (revision > 0),
  row_data jsonb,
  primary key(user_id, collection, row_key)
);
create unique index history_sync_rows_revision_idx
  on app_private.history_sync_rows(user_id, revision);
create index history_sync_rows_scope_idx
  on app_private.history_sync_rows(user_id, collection, scope_id);
create table app_private.history_sync_profile_refs (
  user_id uuid not null,
  collection text not null,
  row_key text not null,
  profile_id uuid not null,
  primary key(user_id, collection, row_key, profile_id),
  foreign key(user_id,collection,row_key) references app_private.history_sync_rows(user_id,collection,row_key) on delete cascade
);
create index history_sync_profile_refs_profile_idx on app_private.history_sync_profile_refs(profile_id,user_id);
create index history_sync_profile_refs_owner_idx on app_private.history_sync_profile_refs(user_id,profile_id);
alter table app_private.history_sync_epoch enable row level security;
alter table app_private.history_sync_heads enable row level security;
alter table app_private.history_sync_rows enable row level security;
alter table app_private.history_sync_profile_refs enable row level security;
revoke all on app_private.history_sync_epoch, app_private.history_sync_heads,
  app_private.history_sync_rows,app_private.history_sync_profile_refs from public, anon, authenticated,service_role;
grant usage on schema app_private to service_role;
grant select on app_private.history_sync_epoch, app_private.history_sync_heads,
  app_private.history_sync_rows to service_role;

create function app_private.history_sync_put(
  p_user_id uuid, p_collection text, p_key text, p_scope_id text, p_row jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_previous jsonb; v_exists boolean; v_revision bigint;
begin
  if p_user_id is null or not exists(select 1 from public.user_profiles where id = p_user_id) then
    return;
  end if;
  insert into app_private.history_sync_heads(user_id) values(p_user_id) on conflict do nothing;
  -- Lock before comparing payloads: concurrent updates cannot compare stale
  -- mirror state and later overwrite each other's higher revision.
  perform 1 from app_private.history_sync_heads where user_id = p_user_id for update;
  select row_data into v_previous from app_private.history_sync_rows
    where user_id = p_user_id and collection = p_collection and row_key = p_key;
  v_exists := found;
  if (v_exists and v_previous is not distinct from p_row) or (not v_exists and p_row is null) then
    return;
  end if;
  update app_private.history_sync_heads set revision = revision + 1
    where user_id = p_user_id returning revision into v_revision;
  insert into app_private.history_sync_rows(user_id, collection, row_key, scope_id, revision, row_data)
    values(p_user_id, p_collection, p_key, p_scope_id, v_revision, p_row)
    on conflict(user_id, collection, row_key) do update
      set scope_id = excluded.scope_id, revision = excluded.revision, row_data = excluded.row_data;
end;
$$;

-- These explicit allowlists match get-app-snapshot. Never persist delivery
-- bearer tokens, token hashes, private invite claims, or future added columns.
create function app_private.history_sync_project(p_collection text, p_row jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  from jsonb_each(p_row) item where item.key = any(case p_collection
    when 'financialRequests' then array['id','relationship_id','request_type','status','creator_user_id','responder_user_id','debtor_user_id','creditor_user_id','amount_minor','currency_code','description','category','parent_request_id','target_ledger_transaction_id','created_at','updated_at','resolved_at']
    when 'history' then array['relationship_id','item_id','item_kind','status','subtype','source_type','creator_user_id','responder_user_id','debtor_user_id','creditor_user_id','amount_minor','description','category','origin_request_id','origin_settlement_proposal_id','happened_at']
    when 'friendshipInvites' then array['id','inviter_user_id','target_user_id','claimant_user_id','relationship_id','flow','origin_channel','status','resolution_actor','resolution_reason','intended_recipient_alias','intended_recipient_phone_e164','intended_recipient_phone_label','claimant_snapshot','source_context','expires_at','resolved_at','created_at','updated_at']
    when 'friendshipInviteDeliveries' then array['id','invite_id','channel','source_context','status','created_at','updated_at','expires_at','claimed_at','claimed_by_user_id','revoked_at']
    when 'accountInvites' then array['id','inviter_user_id','activated_user_id','linked_relationship_id','status','resolution_actor','resolution_reason','intended_recipient_alias','intended_recipient_phone_e164','intended_recipient_phone_label','source_context','expires_at','activated_at','resolved_at','created_at','updated_at']
    when 'accountInviteDeliveries' then array['id','invite_id','channel','source_context','status','expires_at','revoked_at','first_opened_at','last_opened_at','open_count','first_app_opened_at','authenticated_user_id','authenticated_at','activation_completed_at','created_at','updated_at']
    when 'settlementProposals' then array['id','created_by_user_id','status','graph_snapshot_hash','graph_snapshot','movements_json','result_hash','anchor_user_low_id','anchor_user_high_id','currency_code','source_graph_cycle_job_id','happy_circle_case_id','version_number','replaces_proposal_id','replaced_by_proposal_id','stale_reason','created_at','updated_at','executed_at','privacy_approved_count','privacy_approvals_pending','privacy_participant_count']
    when 'settlementParticipants' then array['id','settlement_proposal_id','participant_user_id','decision','decision_source','decided_at','created_at']
    when 'happyCircleScoreEvents' then array['id','user_id','settlement_proposal_id','score_delta','participant_count','awarded_at','treasure_claimed_at','created_at']
    when 'auditEvents' then array['id','actor_user_id','entity_type','entity_id','event_name','request_id','metadata_json','created_at']
    when 'profiles' then array['id','email','display_name','avatar_path','account_access_state','invited_by_user_id','activated_via_account_invite_id','activated_at','phone_country_iso2','phone_country_calling_code','phone_national_number','phone_e164','phone_verified_at','updated_at','created_at']
    else array[]::text[] end);
$$;

create function app_private.history_sync_profiles(p_user_id uuid, p_collection text, p_key text, p_row jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile record; v_previous uuid[]; v_profile_id uuid;
begin
  select array_agg(profile_id) into v_previous from app_private.history_sync_profile_refs
    where user_id=p_user_id and collection=p_collection and row_key=p_key;
  delete from app_private.history_sync_profile_refs where user_id=p_user_id and collection=p_collection and row_key=p_key;
  for v_profile in
    select profile.* from public.user_profiles profile where profile.id::text in (
      select value #>> '{}' from jsonb_each(p_row)
      where key in ('created_by_user_id','actor_user_id','creator_user_id','responder_user_id',
        'debtor_user_id','creditor_user_id','inviter_user_id','target_user_id','claimant_user_id',
        'activated_user_id','claimed_by_user_id','authenticated_user_id','participant_user_id',
        'user_id','anchor_user_low_id','anchor_user_high_id')
      union
      select movement ->> 'debtor_user_id' from jsonb_array_elements(
        case when jsonb_typeof(p_row->'movements_json') = 'array' then p_row->'movements_json' else '[]' end) movement
      union
      select movement ->> 'creditor_user_id' from jsonb_array_elements(
        case when jsonb_typeof(p_row->'movements_json') = 'array' then p_row->'movements_json' else '[]' end) movement
      union
      select movement ->> 'debtor_user_id' from jsonb_array_elements(
        case when jsonb_typeof(p_row->'graph_snapshot') = 'array' then p_row->'graph_snapshot' else '[]' end) movement
      union
      select movement ->> 'creditor_user_id' from jsonb_array_elements(
        case when jsonb_typeof(p_row->'graph_snapshot') = 'array' then p_row->'graph_snapshot' else '[]' end) movement
    ) order by profile.id
  loop
    insert into app_private.history_sync_profile_refs(user_id,collection,row_key,profile_id)
      values(p_user_id,p_collection,p_key,v_profile.id);
    perform app_private.history_sync_put(p_user_id, 'profiles', v_profile.id::text,
      v_profile.id::text, app_private.history_sync_project('profiles', to_jsonb(v_profile)));
  end loop;
  for v_profile_id in select distinct id from unnest(coalesce(v_previous,array[]::uuid[])) ids(id)
  loop
    if not exists(select 1 from app_private.history_sync_profile_refs where user_id=p_user_id and profile_id=v_profile_id) then
      perform app_private.history_sync_put(p_user_id,'profiles',v_profile_id::text,v_profile_id::text,null);
    end if;
  end loop;
end;
$$;

-- Replace one source's materialization, retaining tombstones permanently.
create function app_private.history_sync_replace(
  p_user_id uuid, p_collection text, p_scope_id text, p_rows jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_key text; v_keys text[] := array[]::text[]; v_old record;
begin
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_row := app_private.history_sync_project(p_collection, v_row);
    v_key := case when p_collection = 'history' then
      (v_row->>'item_kind') || ':' || (v_row->>'relationship_id') || ':' || (v_row->>'item_id')
      else v_row->>'id' end;
    v_keys := array_append(v_keys, v_key);
    perform app_private.history_sync_put(p_user_id, p_collection, v_key, p_scope_id, v_row);
    if p_collection <> 'profiles' then perform app_private.history_sync_profiles(p_user_id,p_collection,v_key,v_row); end if;
  end loop;
  for v_old in select row_key from app_private.history_sync_rows
    where user_id = p_user_id and collection = p_collection and scope_id = p_scope_id
      and row_data is not null and not(row_key = any(v_keys)) order by row_key
  loop
    perform app_private.history_sync_put(p_user_id, p_collection, v_old.row_key, p_scope_id, null);
    if p_collection <> 'profiles' then perform app_private.history_sync_profiles(p_user_id,p_collection,v_old.row_key,null); end if;
  end loop;
end;
$$;

create function app_private.history_sync_source(p_user_id uuid, p_kind text, p_source_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_proposal jsonb; v_movements jsonb; v_graph jsonb;
  v_direct text[]; v_profile jsonb; v_owner record; v_old record; v_item record;
begin
  if p_user_id is null or p_source_id is null or p_kind not in ('financial_request',
    'ledger_entry','ledger_transaction','relationship','friendship_invite','friendship_invite_delivery',
    'account_invite','account_invite_delivery','settlement_proposal','settlement_participant',
    'happy_circle_score','audit_event','user_profile') then return; end if;
  -- Serialize the source read as well as the materialization write.
  insert into app_private.history_sync_heads(user_id)
    select p_user_id where exists(select 1 from public.user_profiles where id=p_user_id)
    on conflict do nothing;
  perform 1 from app_private.history_sync_heads where user_id=p_user_id for update;
  if p_kind = 'financial_request' then
    select coalesce(jsonb_agg(to_jsonb(request)), '[]') into v_rows
      from public.financial_requests request where request.id=p_source_id::uuid
        and request.status <> 'pending'
        and p_user_id in (request.creator_user_id,request.responder_user_id,request.debtor_user_id,request.creditor_user_id);
    perform app_private.history_sync_replace(p_user_id,'financialRequests',p_source_id,v_rows);
    select coalesce(jsonb_agg(to_jsonb(history)), '[]') into v_rows
      from public.v_relationship_history history join public.relationships relationship on relationship.id=history.relationship_id
      where history.item_kind='financial_request' and history.item_id=p_source_id::uuid and history.status <> 'pending'
        and relationship.status='active' and p_user_id in(relationship.user_low_id,relationship.user_high_id);
    perform app_private.history_sync_replace(p_user_id,'history','request:'||p_source_id,v_rows);
  elsif p_kind in ('ledger_entry','ledger_transaction') then
    select coalesce(jsonb_agg(to_jsonb(history)), '[]') into v_rows
      from public.v_relationship_history history join public.relationships relationship on relationship.id=history.relationship_id
      where history.item_kind='ledger_transaction' and history.item_id=p_source_id::uuid
        and relationship.status='active' and p_user_id in(relationship.user_low_id,relationship.user_high_id);
    perform app_private.history_sync_replace(p_user_id,'history','ledger:'||p_source_id,v_rows);
  elsif p_kind = 'relationship' then
    -- Access changes also reconcile older ledger rows created before this relationship.
    for v_old in select row_key,scope_id from app_private.history_sync_rows mirror
      where mirror.user_id=p_user_id and mirror.collection='history' and mirror.row_data->>'relationship_id'=p_source_id
        and not exists(select 1 from public.relationships relationship where relationship.id=p_source_id::uuid
          and relationship.status='active' and p_user_id in(relationship.user_low_id,relationship.user_high_id))
    loop
      perform app_private.history_sync_put(p_user_id,'history',v_old.row_key,v_old.scope_id,null);
      perform app_private.history_sync_profiles(p_user_id,'history',v_old.row_key,null);
    end loop;
    for v_item in select distinct history.item_kind,history.item_id from public.v_relationship_history history
      join public.relationships relationship on relationship.id=history.relationship_id
      where relationship.id=p_source_id::uuid and relationship.status='active'
        and p_user_id in(relationship.user_low_id,relationship.user_high_id)
    loop
      perform app_private.history_sync_source(p_user_id,
        case when v_item.item_kind='financial_request' then 'financial_request' else 'ledger_entry' end,v_item.item_id::text);
    end loop;
  elsif p_kind in ('friendship_invite','friendship_invite_delivery') then
    select coalesce(jsonb_agg(to_jsonb(live)), '[]') into v_rows
      from public.friendship_invites source join public.v_friendship_invites_live live on live.id=source.id
      where source.id=p_source_id::uuid and source.status in('accepted','rejected','canceled','expired')
        and p_user_id in(source.inviter_user_id,source.target_user_id,source.claimant_user_id);
    perform app_private.history_sync_replace(p_user_id,'friendshipInvites',p_source_id,v_rows);
    select coalesce(jsonb_agg(to_jsonb(delivery)), '[]') into v_rows
      from public.v_friendship_invite_deliveries_live delivery join public.friendship_invites source on source.id=delivery.invite_id
      where source.id=p_source_id::uuid and source.status in('accepted','rejected','canceled','expired')
        and p_user_id in(source.inviter_user_id,source.target_user_id,source.claimant_user_id);
    perform app_private.history_sync_replace(p_user_id,'friendshipInviteDeliveries',p_source_id,v_rows);
  elsif p_kind in ('account_invite','account_invite_delivery') then
    select coalesce(jsonb_agg(to_jsonb(live)), '[]') into v_rows
      from public.account_invites source join public.v_account_invites_live live on live.id=source.id
      where source.id=p_source_id::uuid and source.status in('accepted','rejected','canceled','expired')
        and p_user_id in(source.inviter_user_id,source.activated_user_id);
    perform app_private.history_sync_replace(p_user_id,'accountInvites',p_source_id,v_rows);
    select coalesce(jsonb_agg(to_jsonb(delivery)), '[]') into v_rows
      from public.v_account_invite_deliveries_live delivery join public.account_invites source on source.id=delivery.invite_id
      where source.id=p_source_id::uuid and source.status in('accepted','rejected','canceled','expired')
        and p_user_id in(source.inviter_user_id,source.activated_user_id);
    perform app_private.history_sync_replace(p_user_id,'accountInviteDeliveries',p_source_id,v_rows);
  elsif p_kind in ('settlement_proposal','settlement_participant') then
    select to_jsonb(proposal) into v_proposal from public.settlement_proposals proposal
      where proposal.id=p_source_id::uuid and proposal.status in('rejected','stale','executed','expired')
        and exists(select 1 from public.settlement_proposal_participants participant
          where participant.settlement_proposal_id=proposal.id and participant.participant_user_id=p_user_id);
    if v_proposal is not null then
      select coalesce(jsonb_agg(movement), '[]') into v_movements from jsonb_array_elements(
        case when jsonb_typeof(v_proposal->'movements_json')='array' then v_proposal->'movements_json' else '[]' end) movement
        where movement->>'debtor_user_id'=p_user_id::text or movement->>'creditor_user_id'=p_user_id::text;
      select coalesce(jsonb_agg(movement), '[]') into v_graph from jsonb_array_elements(
        case when jsonb_typeof(v_proposal->'graph_snapshot')='array' then v_proposal->'graph_snapshot' else '[]' end) movement
        where movement->>'debtor_user_id'=p_user_id::text or movement->>'creditor_user_id'=p_user_id::text;
      select array_agg(distinct direct_id) into v_direct from (
        select p_user_id::text as direct_id union all
        select m->>'debtor_user_id' from jsonb_array_elements(v_movements||v_graph) m union all
        select m->>'creditor_user_id' from jsonb_array_elements(v_movements||v_graph) m) direct;
      v_proposal := v_proposal || jsonb_build_object('created_by_user_id',p_user_id,
        'movements_json',v_movements,'graph_snapshot',v_graph,
        'anchor_user_low_id',case when v_proposal->>'anchor_user_low_id'=any(v_direct) then v_proposal->'anchor_user_low_id' else 'null'::jsonb end,
        'anchor_user_high_id',case when v_proposal->>'anchor_user_high_id'=any(v_direct) then v_proposal->'anchor_user_high_id' else 'null'::jsonb end,
        'privacy_participant_count',(select count(*) from public.settlement_proposal_participants where settlement_proposal_id=p_source_id::uuid),
        'privacy_approved_count',(select count(*) from public.settlement_proposal_participants where settlement_proposal_id=p_source_id::uuid and decision='approved'),
        'privacy_approvals_pending',(select count(*) from public.settlement_proposal_participants where settlement_proposal_id=p_source_id::uuid and decision='pending'));
      select coalesce(jsonb_agg(to_jsonb(participant)), '[]') into v_rows from public.settlement_proposal_participants participant
        where participant.settlement_proposal_id=p_source_id::uuid and participant.participant_user_id::text=any(v_direct);
      perform app_private.history_sync_replace(p_user_id,'settlementProposals',p_source_id,jsonb_build_array(v_proposal));
      perform app_private.history_sync_replace(p_user_id,'settlementParticipants',p_source_id,v_rows);
    else
      perform app_private.history_sync_replace(p_user_id,'settlementProposals',p_source_id,'[]');
      perform app_private.history_sync_replace(p_user_id,'settlementParticipants',p_source_id,'[]');
    end if;
  elsif p_kind='happy_circle_score' then
    select coalesce(jsonb_agg(to_jsonb(event)), '[]') into v_rows from public.happy_circle_score_events event
      where event.settlement_proposal_id=p_source_id::uuid and event.user_id=p_user_id;
    perform app_private.history_sync_replace(p_user_id,'happyCircleScoreEvents',p_source_id,v_rows);
  elsif p_kind='audit_event' then
    select coalesce(jsonb_agg(to_jsonb(event)), '[]') into v_rows from public.audit_events event
      where event.id=p_source_id::uuid and event.actor_user_id=p_user_id;
    perform app_private.history_sync_replace(p_user_id,'auditEvents',p_source_id,v_rows);
  elsif p_kind='user_profile' then
    -- Only already-authorized profile copies are updated. No arbitrary requested IDs.
    select app_private.history_sync_project('profiles',to_jsonb(profile)) into v_profile
      from public.user_profiles profile where profile.id=p_source_id::uuid;
    if exists(select 1 from app_private.history_sync_profile_refs where user_id=p_user_id and profile_id=p_source_id::uuid) then
      perform app_private.history_sync_put(p_user_id,'profiles',p_source_id,p_source_id,v_profile);
    elsif exists(select 1 from app_private.history_sync_rows where user_id=p_user_id and collection='profiles' and row_key=p_source_id and row_data is not null) then
      perform app_private.history_sync_put(p_user_id,'profiles',p_source_id,p_source_id,null);
    end if;
  end if;
end;
$$;

-- Record the durable state outside the best-effort Realtime exception block.
-- If durable recording fails, the source mutation must roll back too.
create or replace function public.notify_user_snapshot_changed(
  p_user_id uuid, p_kind text, p_source_item_id text default null, p_version text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_kind text := nullif(btrim(coalesce(p_kind,'')),'');
  v_source text := nullif(btrim(coalesce(p_source_item_id,'')),''); v_sent_at timestamptz := now();
begin
  if p_user_id is null or v_kind is null then return; end if;
  perform app_private.history_sync_source(p_user_id,v_kind,v_source);
  begin
    perform realtime.send(jsonb_build_object('eventId',gen_random_uuid()::text,'kind',v_kind,
      'sourceItemId',v_source,'version',coalesce(nullif(btrim(coalesce(p_version,'')),''),v_sent_at::text),
      'sentAt',v_sent_at::text),'snapshot_changed','user:'||p_user_id::text,true);
  exception when others then
    raise warning 'snapshot_realtime_broadcast_failed user=% kind=% detail=%',p_user_id,v_kind,sqlerrm;
  end;
end;
$$;
create or replace function public.notify_users_snapshot_changed(
  p_user_ids uuid[], p_kind text, p_source_item_id text default null, p_version text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  for v_user_id in select distinct user_id from unnest(coalesce(p_user_ids,array[]::uuid[])) ids(user_id)
    where user_id is not null order by user_id
  loop perform public.notify_user_snapshot_changed(v_user_id,p_kind,p_source_item_id,p_version); end loop;
end;
$$;

create function app_private.tg_history_sync_profile_copies() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id text; v_owner uuid;
begin
  v_id := case when tg_op='DELETE' then old.id::text else new.id::text end;
  for v_owner in select user_id from app_private.history_sync_rows
    where collection='profiles' and row_key=v_id order by user_id
  loop perform app_private.history_sync_source(v_owner,'user_profile',v_id); end loop;
  return null;
end;
$$;
create trigger history_sync_profile_copies after update or delete on public.user_profiles
  for each row execute function app_private.tg_history_sync_profile_copies();

-- Participant decisions change every participant's closed proposal summary.
create or replace function public.tg_realtime_settlement_participants_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_proposal_id uuid;
begin
  v_proposal_id := case when tg_op='DELETE' then old.settlement_proposal_id else new.settlement_proposal_id end;
  select array_agg(participant_user_id order by participant_user_id) into v_ids
    from public.settlement_proposal_participants where settlement_proposal_id=v_proposal_id;
  if tg_op<>'INSERT' then v_ids:=array_append(v_ids,old.participant_user_id); end if;
  if tg_op<>'DELETE' then v_ids:=array_append(v_ids,new.participant_user_id); end if;
  perform public.notify_users_snapshot_changed(v_ids,'settlement_participant',v_proposal_id::text);
  return null;
end;
$$;
create function app_private.tg_history_sync_ledger_transaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ids uuid[];
begin
  v_id:=case when tg_op='DELETE' then old.id else new.id end;
  select array_agg(distinct account.owner_user_id) into v_ids from public.ledger_entries entry
    join public.ledger_accounts account on account.id=entry.ledger_account_id where entry.ledger_transaction_id=v_id;
  perform public.notify_users_snapshot_changed(v_ids,'ledger_transaction',v_id::text);
  return null;
end;
$$;
create trigger history_sync_ledger_transaction after update on public.ledger_transactions
  for each row execute function app_private.tg_history_sync_ledger_transaction();
create function app_private.tg_history_sync_audit_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op<>'INSERT' then perform app_private.history_sync_source(old.actor_user_id,'audit_event',old.id::text); end if;
  if tg_op<>'DELETE' then perform app_private.history_sync_source(new.actor_user_id,'audit_event',new.id::text); end if;
  return null;
end;
$$;
create trigger history_sync_audit_event after insert or update or delete on public.audit_events
  for each row execute function app_private.tg_history_sync_audit_event();

-- Administrative corrections can change ownership/source IDs as well as status.
-- Refresh both OLD and NEW scopes so the previous owner receives a tombstone.
create or replace function public.tg_realtime_financial_requests_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old public.financial_requests%rowtype; v_new public.financial_requests%rowtype; v_id uuid;
begin
  if tg_op<>'INSERT' then v_old:=old; v_id:=old.id; end if;
  if tg_op<>'DELETE' then v_new:=new; v_id:=new.id; end if;
  perform public.notify_users_snapshot_changed(array[v_old.creator_user_id,v_old.responder_user_id,
    v_old.debtor_user_id,v_old.creditor_user_id,v_new.creator_user_id,v_new.responder_user_id,
    v_new.debtor_user_id,v_new.creditor_user_id],'financial_request',v_id::text);
  return null;
end;
$$;
create or replace function public.tg_realtime_happy_circle_score_events_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old public.happy_circle_score_events%rowtype; v_new public.happy_circle_score_events%rowtype; v_scope record;
begin
  if tg_op<>'INSERT' then v_old:=old; end if;
  if tg_op<>'DELETE' then v_new:=new; end if;
  for v_scope in select distinct user_id,proposal_id from (values
    (v_old.user_id,v_old.settlement_proposal_id),(v_new.user_id,v_new.settlement_proposal_id)) scopes(user_id,proposal_id)
    where user_id is not null and proposal_id is not null order by user_id,proposal_id
  loop perform public.notify_user_snapshot_changed(v_scope.user_id,'happy_circle_score',v_scope.proposal_id::text); end loop;
  return null;
end;
$$;
create or replace function public.tg_realtime_ledger_entries_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old public.ledger_entries%rowtype; v_new public.ledger_entries%rowtype; v_scope record;
begin
  if tg_op<>'INSERT' then v_old:=old; end if;
  if tg_op<>'DELETE' then v_new:=new; end if;
  for v_scope in select distinct entry.transaction_id,owner.user_id from (values
    (v_old.ledger_transaction_id,v_old.ledger_account_id),(v_new.ledger_transaction_id,v_new.ledger_account_id)) entry(transaction_id,account_id)
    join public.ledger_accounts account on account.id=entry.account_id
    cross join lateral unnest(array[account.owner_user_id,account.counterparty_user_id]) owner(user_id)
    where entry.transaction_id is not null order by owner.user_id,entry.transaction_id
  loop perform public.notify_user_snapshot_changed(v_scope.user_id,'ledger_entry',v_scope.transaction_id::text); end loop;
  return null;
end;
$$;

-- One MVCC statement reads both head and materialized rows. The RPC is only
-- executable by the authenticated Edge service, whose actor ID comes from JWT.
create function public.get_history_sync_page(p_actor_user_id uuid, p_cursor text default null, p_page_size integer default 250)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with settings as (
    select epoch::text as epoch, coalesce((select revision from app_private.history_sync_heads where user_id=p_actor_user_id),0) as head,
      greatest(1,least(coalesce(p_page_size,250),500)) as page_size from app_private.history_sync_epoch where singleton
  ), parsed as (
    select *,case when p_cursor ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(0|[1-9][0-9]{0,18})$'
      then split_part(p_cursor,':',2)::numeric else null end as requested_revision from settings
  ), position as (
    select *,case when split_part(p_cursor,':',1)=epoch and requested_revision<=head
      then requested_revision::bigint else 0 end as after_revision,
      not coalesce(split_part(p_cursor,':',1)=epoch and requested_revision<=head,false) as reset from parsed
  ), page as (
    select rows.* from app_private.history_sync_rows rows cross join position
      where user_id=p_actor_user_id and revision>after_revision and revision<=head
      order by revision limit (select page_size from position)
  ), progress as (
    select coalesce(max(revision),(select head from position)) as last_revision from page
  )
  select jsonb_build_object('protocol',1,'cursor',epoch||':'||last_revision::text,'reset',reset,
    'hasMore',exists(select 1 from app_private.history_sync_rows rows where rows.user_id=p_actor_user_id
      and rows.revision>last_revision and rows.revision<=head),
    'changes',coalesce((select jsonb_agg(jsonb_build_object('collection',collection,'key',row_key,'row',row_data) order by revision) from page),'[]'::jsonb))
  from position cross join progress;
$$;
revoke all on function public.get_history_sync_page(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.get_history_sync_page(uuid,text,integer) to service_role;

-- Lock every source before backfill so there is no installation/backfill gap.
lock table public.financial_requests,public.friendship_invites,public.friendship_invite_deliveries,
  public.account_invites,public.account_invite_deliveries,public.relationships,
  public.ledger_transactions,public.ledger_entries,public.settlement_proposals,
  public.settlement_proposal_participants,public.happy_circle_score_events,public.audit_events,
  public.user_profiles in share row exclusive mode;
do $$
declare v_owner uuid; v_source record;
begin
  for v_owner in select id from public.user_profiles order by id loop
    for v_source in
      select 'financial_request' as kind, id::text as id from public.financial_requests
        where status<>'pending' and v_owner in(creator_user_id,responder_user_id,debtor_user_id,creditor_user_id)
      union select 'ledger_entry',history.item_id::text from public.v_relationship_history history
        join public.relationships relationship on relationship.id=history.relationship_id
        where history.item_kind='ledger_transaction' and relationship.status='active' and v_owner in(relationship.user_low_id,relationship.user_high_id)
      union select 'friendship_invite',id::text from public.friendship_invites
        where status in('accepted','rejected','canceled','expired') and v_owner in(inviter_user_id,target_user_id,claimant_user_id)
      union select 'account_invite',id::text from public.account_invites
        where status in('accepted','rejected','canceled','expired') and v_owner in(inviter_user_id,activated_user_id)
      union select 'settlement_proposal',proposal.id::text from public.settlement_proposals proposal
        join public.settlement_proposal_participants participant on participant.settlement_proposal_id=proposal.id
        where proposal.status in('rejected','stale','executed','expired') and participant.participant_user_id=v_owner
      union select 'happy_circle_score',settlement_proposal_id::text from public.happy_circle_score_events where user_id=v_owner
      union select 'audit_event',id::text from public.audit_events where actor_user_id=v_owner
      order by kind,id
    loop perform app_private.history_sync_source(v_owner,v_source.kind,v_source.id); end loop;
  end loop;
end;
$$;

revoke all on function app_private.history_sync_put(uuid,text,text,text,jsonb),
  app_private.history_sync_project(text,jsonb),app_private.history_sync_profiles(uuid,text,text,jsonb),
  app_private.history_sync_replace(uuid,text,text,jsonb),app_private.history_sync_source(uuid,text,text),
  app_private.tg_history_sync_profile_copies(),app_private.tg_history_sync_ledger_transaction(),
  app_private.tg_history_sync_audit_event() from public,anon,authenticated,service_role;
