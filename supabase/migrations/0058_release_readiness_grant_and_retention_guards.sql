revoke all on table public.happy_circle_score_events from public, anon, authenticated;
grant select on table public.happy_circle_score_events to authenticated;

create or replace function public.cleanup_supabase_usage_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cron_job_run_details_deleted integer := 0;
  v_net_http_response_deleted integer := 0;
  v_product_events_deleted integer := 0;
  v_app_sessions_deleted integer := 0;
  v_edge_rate_limits_deleted integer := 0;
  v_public_invite_preview_rate_limits_deleted integer := 0;
begin
  if to_regclass('cron.job_run_details') is not null then
    execute $sql$
      with deleted as (
        delete from cron.job_run_details
        where coalesce(end_time, start_time) < timezone('utc', now()) - interval '7 days'
        returning 1
      )
      select count(*)::integer
      from deleted
    $sql$
    into v_cron_job_run_details_deleted;
  end if;

  if to_regclass('net._http_response') is not null then
    execute $sql$
      with deleted as (
        delete from net._http_response
        where created < timezone('utc', now()) - interval '2 days'
        returning 1
      )
      select count(*)::integer
      from deleted
    $sql$
    into v_net_http_response_deleted;
  end if;

  with deleted as (
    delete from public.product_events
    where occurred_at < timezone('utc', now()) - interval '180 days'
    returning 1
  )
  select count(*)::integer
    into v_product_events_deleted
  from deleted;

  with deleted as (
    delete from public.app_sessions
    where coalesce(ended_at, last_seen_at, started_at) < timezone('utc', now()) - interval '180 days'
    returning 1
  )
  select count(*)::integer
    into v_app_sessions_deleted
  from deleted;

  with deleted as (
    delete from public.edge_rate_limits
    where window_started_at < timezone('utc', now()) - interval '2 days'
    returning 1
  )
  select count(*)::integer
    into v_edge_rate_limits_deleted
  from deleted;

  with deleted as (
    delete from public.public_invite_preview_rate_limits
    where window_started_at < timezone('utc', now()) - interval '2 days'
    returning 1
  )
  select count(*)::integer
    into v_public_invite_preview_rate_limits_deleted
  from deleted;

  return jsonb_build_object(
    'cronJobRunDetailsDeleted', v_cron_job_run_details_deleted,
    'netHttpResponseDeleted', v_net_http_response_deleted,
    'productEventsDeleted', v_product_events_deleted,
    'appSessionsDeleted', v_app_sessions_deleted,
    'edgeRateLimitsDeleted', v_edge_rate_limits_deleted,
    'publicInvitePreviewRateLimitsDeleted', v_public_invite_preview_rate_limits_deleted
  );
end;
$$;

revoke all on function public.cleanup_supabase_usage_retention() from public, anon, authenticated;
grant execute on function public.cleanup_supabase_usage_retention() to service_role;
