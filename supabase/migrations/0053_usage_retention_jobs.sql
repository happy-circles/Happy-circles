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
begin
  with deleted as (
    delete from cron.job_run_details
    where coalesce(end_time, start_time) < timezone('utc', now()) - interval '7 days'
    returning 1
  )
  select count(*)::integer
    into v_cron_job_run_details_deleted
  from deleted;

  with deleted as (
    delete from net._http_response
    where created < timezone('utc', now()) - interval '2 days'
    returning 1
  )
  select count(*)::integer
    into v_net_http_response_deleted
  from deleted;

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

  return jsonb_build_object(
    'cronJobRunDetailsDeleted', v_cron_job_run_details_deleted,
    'netHttpResponseDeleted', v_net_http_response_deleted,
    'productEventsDeleted', v_product_events_deleted,
    'appSessionsDeleted', v_app_sessions_deleted
  );
end;
$$;

revoke all on function public.cleanup_supabase_usage_retention() from public, anon, authenticated;
grant execute on function public.cleanup_supabase_usage_retention() to service_role;

do $$
begin
  if to_regnamespace('cron') is null then
    return;
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'happy-circles-usage-retention-nightly'
  ) then
    perform cron.unschedule('happy-circles-usage-retention-nightly');
  end if;

  perform cron.schedule(
    'happy-circles-usage-retention-nightly',
    '35 3 * * *',
    'select public.cleanup_supabase_usage_retention();'
  );
end
$$;
