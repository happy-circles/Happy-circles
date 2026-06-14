alter table realtime.messages enable row level security;

drop policy if exists push_devices_client_deny_all on public.push_devices;
create policy push_devices_client_deny_all
on public.push_devices
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists push_notification_events_client_deny_all on public.push_notification_events;
create policy push_notification_events_client_deny_all
on public.push_notification_events
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists happy_circles_snapshot_broadcast_select on realtime.messages;
create policy happy_circles_snapshot_broadcast_select
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = ('user:' || (select auth.uid())::text)
);

create or replace function public.notify_user_snapshot_changed(
  p_user_id uuid,
  p_kind text,
  p_source_item_id text default null,
  p_version text default null
)
returns void
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  v_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  v_source_item_id text := nullif(btrim(coalesce(p_source_item_id, '')), '');
  v_sent_at timestamptz := timezone('utc', now());
begin
  if p_user_id is null or v_kind is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'eventId', gen_random_uuid()::text,
      'kind', v_kind,
      'sourceItemId', v_source_item_id,
      'version', coalesce(nullif(btrim(coalesce(p_version, '')), ''), v_sent_at::text),
      'sentAt', v_sent_at::text
    ),
    'snapshot_changed',
    'user:' || p_user_id::text,
    true
  );
exception
  when others then
    raise warning 'snapshot_realtime_broadcast_failed user=% kind=% detail=%',
      p_user_id,
      v_kind,
      sqlerrm;
end;
$$;

revoke all on function public.notify_user_snapshot_changed(uuid, text, text, text) from public;
grant execute on function public.notify_user_snapshot_changed(uuid, text, text, text) to service_role;

create or replace function public.notify_users_snapshot_changed(
  p_user_ids uuid[],
  p_kind text,
  p_source_item_id text default null,
  p_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct user_id
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as user_ids(user_id)
    where user_id is not null
  loop
    perform public.notify_user_snapshot_changed(v_user_id, p_kind, p_source_item_id, p_version);
  end loop;
end;
$$;

revoke all on function public.notify_users_snapshot_changed(uuid[], text, text, text) from public;
grant execute on function public.notify_users_snapshot_changed(uuid[], text, text, text) to service_role;

create or replace function public.tg_realtime_user_profiles_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_profiles%rowtype;
  v_related_user_ids uuid[];
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select coalesce(
    array_agg(
      case
        when relationship.user_low_id = v_row.id then relationship.user_high_id
        else relationship.user_low_id
      end
    ),
    array[]::uuid[]
  )
    into v_related_user_ids
  from public.relationships relationship
  where relationship.status = 'active'
    and v_row.id in (relationship.user_low_id, relationship.user_high_id);

  perform public.notify_users_snapshot_changed(
    array_append(v_related_user_ids, v_row.id),
    'user_profile',
    v_row.id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_user_profiles_changed on public.user_profiles;
create trigger realtime_user_profiles_changed
after insert or update or delete on public.user_profiles
for each row execute function public.tg_realtime_user_profiles_changed();

create or replace function public.tg_realtime_financial_requests_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.financial_requests%rowtype;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  perform public.notify_users_snapshot_changed(
    array[
      v_row.creator_user_id,
      v_row.responder_user_id,
      v_row.debtor_user_id,
      v_row.creditor_user_id
    ],
    'financial_request',
    v_row.id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_financial_requests_changed on public.financial_requests;
create trigger realtime_financial_requests_changed
after insert or update or delete on public.financial_requests
for each row execute function public.tg_realtime_financial_requests_changed();

create or replace function public.tg_realtime_friendship_invites_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new public.friendship_invites%rowtype;
  v_old public.friendship_invites%rowtype;
  v_source_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new := new;
    v_source_id := new.id;
  end if;

  if tg_op <> 'INSERT' then
    v_old := old;
    v_source_id := old.id;
  end if;

  perform public.notify_users_snapshot_changed(
    array[
      v_new.inviter_user_id,
      v_new.target_user_id,
      v_new.claimant_user_id,
      v_old.inviter_user_id,
      v_old.target_user_id,
      v_old.claimant_user_id
    ],
    'friendship_invite',
    v_source_id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_friendship_invites_changed on public.friendship_invites;
create trigger realtime_friendship_invites_changed
after insert or update or delete on public.friendship_invites
for each row execute function public.tg_realtime_friendship_invites_changed();

create or replace function public.tg_realtime_friendship_invite_deliveries_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.friendship_invite_deliveries%rowtype;
  v_invite public.friendship_invites%rowtype;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where id = v_row.invite_id;

  if found then
    perform public.notify_users_snapshot_changed(
      array[v_invite.inviter_user_id, v_invite.target_user_id, v_invite.claimant_user_id],
      'friendship_invite_delivery',
      v_row.invite_id::text
    );
  end if;

  return null;
end;
$$;

drop trigger if exists realtime_friendship_invite_deliveries_changed on public.friendship_invite_deliveries;
create trigger realtime_friendship_invite_deliveries_changed
after insert or update or delete on public.friendship_invite_deliveries
for each row execute function public.tg_realtime_friendship_invite_deliveries_changed();

create or replace function public.tg_realtime_account_invites_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new public.account_invites%rowtype;
  v_old public.account_invites%rowtype;
  v_source_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new := new;
    v_source_id := new.id;
  end if;

  if tg_op <> 'INSERT' then
    v_old := old;
    v_source_id := old.id;
  end if;

  perform public.notify_users_snapshot_changed(
    array[
      v_new.inviter_user_id,
      v_new.activated_user_id,
      v_old.inviter_user_id,
      v_old.activated_user_id
    ],
    'account_invite',
    v_source_id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_account_invites_changed on public.account_invites;
create trigger realtime_account_invites_changed
after insert or update or delete on public.account_invites
for each row execute function public.tg_realtime_account_invites_changed();

create or replace function public.tg_realtime_account_invite_deliveries_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.account_invite_deliveries%rowtype;
  v_invite public.account_invites%rowtype;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select *
    into v_invite
  from public.account_invites
  where id = v_row.invite_id;

  if found then
    perform public.notify_users_snapshot_changed(
      array[v_invite.inviter_user_id, v_invite.activated_user_id, v_row.authenticated_user_id],
      'account_invite_delivery',
      v_row.invite_id::text
    );
  end if;

  return null;
end;
$$;

drop trigger if exists realtime_account_invite_deliveries_changed on public.account_invite_deliveries;
create trigger realtime_account_invite_deliveries_changed
after insert or update or delete on public.account_invite_deliveries
for each row execute function public.tg_realtime_account_invite_deliveries_changed();

create or replace function public.tg_realtime_relationships_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new public.relationships%rowtype;
  v_old public.relationships%rowtype;
  v_source_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new := new;
    v_source_id := new.id;
  end if;

  if tg_op <> 'INSERT' then
    v_old := old;
    v_source_id := old.id;
  end if;

  perform public.notify_users_snapshot_changed(
    array[v_new.user_low_id, v_new.user_high_id, v_old.user_low_id, v_old.user_high_id],
    'relationship',
    v_source_id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_relationships_changed on public.relationships;
create trigger realtime_relationships_changed
after insert or update or delete on public.relationships
for each row execute function public.tg_realtime_relationships_changed();

create or replace function public.tg_realtime_pair_net_edges_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new public.pair_net_edges_cache%rowtype;
  v_old public.pair_net_edges_cache%rowtype;
  v_source_item_id text;
begin
  if tg_op <> 'DELETE' then
    v_new := new;
    v_source_item_id := new.user_low_id::text || ':' || new.user_high_id::text;
  end if;

  if tg_op <> 'INSERT' then
    v_old := old;
    v_source_item_id := old.user_low_id::text || ':' || old.user_high_id::text;
  end if;

  perform public.notify_users_snapshot_changed(
    array[v_new.user_low_id, v_new.user_high_id, v_old.user_low_id, v_old.user_high_id],
    'pair_net_edge',
    v_source_item_id
  );

  return null;
end;
$$;

drop trigger if exists realtime_pair_net_edges_changed on public.pair_net_edges_cache;
create trigger realtime_pair_net_edges_changed
after insert or update or delete on public.pair_net_edges_cache
for each row execute function public.tg_realtime_pair_net_edges_changed();

create or replace function public.tg_realtime_ledger_entries_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ledger_entries%rowtype;
  v_owner_user_id uuid;
  v_counterparty_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select owner_user_id, counterparty_user_id
    into v_owner_user_id, v_counterparty_user_id
  from public.ledger_accounts
  where id = v_row.ledger_account_id;

  if found then
    perform public.notify_users_snapshot_changed(
      array[v_owner_user_id, v_counterparty_user_id],
      'ledger_entry',
      v_row.ledger_transaction_id::text
    );
  end if;

  return null;
end;
$$;

drop trigger if exists realtime_ledger_entries_changed on public.ledger_entries;
create trigger realtime_ledger_entries_changed
after insert or update or delete on public.ledger_entries
for each row execute function public.tg_realtime_ledger_entries_changed();

create or replace function public.tg_realtime_settlement_proposals_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.settlement_proposals%rowtype;
  v_participant_user_ids uuid[];
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  select coalesce(array_agg(participant_user_id), array[]::uuid[])
    into v_participant_user_ids
  from public.settlement_proposal_participants
  where settlement_proposal_id = v_row.id;

  perform public.notify_users_snapshot_changed(
    array_append(v_participant_user_ids, v_row.created_by_user_id),
    'settlement_proposal',
    v_row.id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_settlement_proposals_changed on public.settlement_proposals;
create trigger realtime_settlement_proposals_changed
after insert or update or delete on public.settlement_proposals
for each row execute function public.tg_realtime_settlement_proposals_changed();

create or replace function public.tg_realtime_settlement_participants_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new public.settlement_proposal_participants%rowtype;
  v_old public.settlement_proposal_participants%rowtype;
  v_source_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new := new;
    v_source_id := new.settlement_proposal_id;
  end if;

  if tg_op <> 'INSERT' then
    v_old := old;
    v_source_id := old.settlement_proposal_id;
  end if;

  perform public.notify_users_snapshot_changed(
    array[v_new.participant_user_id, v_old.participant_user_id],
    'settlement_participant',
    v_source_id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_settlement_participants_changed on public.settlement_proposal_participants;
create trigger realtime_settlement_participants_changed
after insert or update or delete on public.settlement_proposal_participants
for each row execute function public.tg_realtime_settlement_participants_changed();

create or replace function public.tg_realtime_notification_views_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notification_views%rowtype;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  perform public.notify_user_snapshot_changed(
    v_row.user_id,
    'notification_view',
    v_row.notification_key
  );

  return null;
end;
$$;

drop trigger if exists realtime_notification_views_changed on public.notification_views;
create trigger realtime_notification_views_changed
after insert or update or delete on public.notification_views
for each row execute function public.tg_realtime_notification_views_changed();

create or replace function public.tg_realtime_happy_circle_score_events_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.happy_circle_score_events%rowtype;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  perform public.notify_user_snapshot_changed(
    v_row.user_id,
    'happy_circle_score',
    v_row.settlement_proposal_id::text
  );

  return null;
end;
$$;

drop trigger if exists realtime_happy_circle_score_events_changed on public.happy_circle_score_events;
create trigger realtime_happy_circle_score_events_changed
after insert or update or delete on public.happy_circle_score_events
for each row execute function public.tg_realtime_happy_circle_score_events_changed();
