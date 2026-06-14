do $$
declare
  v_missing_trigger text;
begin
  if not exists (
    select 1
    from pg_proc proc
    join pg_namespace n on n.oid = proc.pronamespace
    where n.nspname = 'public'
      and proc.proname = 'notify_user_snapshot_changed'
      and proc.pronargs = 4
  ) then
    raise exception 'expected notify_user_snapshot_changed to exist';
  end if;

  if not exists (
    select 1
    from pg_proc proc
    join pg_namespace n on n.oid = proc.pronamespace
    where n.nspname = 'public'
      and proc.proname = 'notify_users_snapshot_changed'
      and proc.pronargs = 4
  ) then
    raise exception 'expected notify_users_snapshot_changed to exist';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.notify_user_snapshot_changed(uuid,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'expected service_role execute on notify_user_snapshot_changed';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'happy_circles_snapshot_broadcast_select'
  ) then
    raise exception 'expected private realtime snapshot broadcast policy';
  end if;

  select expected.trigger_name
    into v_missing_trigger
  from (
    values
      ('realtime_user_profiles_changed'),
      ('realtime_financial_requests_changed'),
      ('realtime_friendship_invites_changed'),
      ('realtime_friendship_invite_deliveries_changed'),
      ('realtime_account_invites_changed'),
      ('realtime_account_invite_deliveries_changed'),
      ('realtime_relationships_changed'),
      ('realtime_pair_net_edges_changed'),
      ('realtime_ledger_entries_changed'),
      ('realtime_settlement_proposals_changed'),
      ('realtime_settlement_participants_changed'),
      ('realtime_notification_views_changed'),
      ('realtime_happy_circle_score_events_changed')
  ) as expected(trigger_name)
  where not exists (
    select 1
    from pg_trigger
    where tgname = expected.trigger_name
      and not tgisinternal
  )
  limit 1;

  if v_missing_trigger is not null then
    raise exception 'expected realtime trigger % to exist', v_missing_trigger;
  end if;
end
$$;

select '1..1';
select 'ok 1 - realtime snapshot notifications are private and wired to snapshot tables';
