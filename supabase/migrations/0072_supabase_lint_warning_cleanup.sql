do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.propose_cycle_settlement(uuid,text,text,jsonb,jsonb,uuid[],uuid,uuid,text,uuid)'::regprocedure
  )
    into v_definition;

  v_updated_definition := replace(
    v_definition,
    'v_replacement_reason public.settlement_stale_reason := ''balance_changed'';',
    'v_replacement_reason public.settlement_stale_reason := ''balance_changed''::public.settlement_stale_reason;'
  );

  if v_updated_definition is distinct from v_definition then
    execute v_updated_definition;
  end if;
end
$$;

revoke all on function public.claim_push_notification_events(text, integer)
  from public, anon, authenticated;
revoke all on function public.notify_user_snapshot_changed(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.notify_users_snapshot_changed(uuid[], text, text, text)
  from public, anon, authenticated;
revoke all on function public.tg_realtime_account_invite_deliveries_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_account_invites_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_financial_requests_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_friendship_invite_deliveries_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_friendship_invites_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_happy_circle_score_events_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_ledger_entries_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_notification_views_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_pair_net_edges_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_relationships_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_settlement_participants_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_settlement_proposals_changed()
  from public, anon, authenticated;
revoke all on function public.tg_realtime_user_profiles_changed()
  from public, anon, authenticated;

grant execute on function public.claim_push_notification_events(text, integer)
  to service_role;
grant execute on function public.notify_user_snapshot_changed(uuid, text, text, text)
  to service_role;
grant execute on function public.notify_users_snapshot_changed(uuid[], text, text, text)
  to service_role;
grant execute on function public.tg_realtime_account_invite_deliveries_changed()
  to service_role;
grant execute on function public.tg_realtime_account_invites_changed()
  to service_role;
grant execute on function public.tg_realtime_financial_requests_changed()
  to service_role;
grant execute on function public.tg_realtime_friendship_invite_deliveries_changed()
  to service_role;
grant execute on function public.tg_realtime_friendship_invites_changed()
  to service_role;
grant execute on function public.tg_realtime_happy_circle_score_events_changed()
  to service_role;
grant execute on function public.tg_realtime_ledger_entries_changed()
  to service_role;
grant execute on function public.tg_realtime_notification_views_changed()
  to service_role;
grant execute on function public.tg_realtime_pair_net_edges_changed()
  to service_role;
grant execute on function public.tg_realtime_relationships_changed()
  to service_role;
grant execute on function public.tg_realtime_settlement_participants_changed()
  to service_role;
grant execute on function public.tg_realtime_settlement_proposals_changed()
  to service_role;
grant execute on function public.tg_realtime_user_profiles_changed()
  to service_role;

alter function public.sanitize_support_error_metadata(jsonb) stable;

do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.validate_cycle_settlement_payload(jsonb,jsonb,uuid[],uuid,uuid,text)'::regprocedure
  )
    into v_definition;

  v_updated_definition := replace(v_definition, E'\n  v_step integer;\n', E'\n');

  if v_updated_definition is distinct from v_definition then
    execute v_updated_definition;
  end if;
end
$$;

do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef(
    'public.refresh_analytics_recent_facts(integer)'::regprocedure
  )
    into v_definition;

  v_updated_definition := replace(v_definition, E'\n  v_offset integer;\n', E'\n');

  if v_updated_definition is distinct from v_definition then
    execute v_updated_definition;
  end if;
end
$$;
