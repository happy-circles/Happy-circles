-- Install nightly cleanup last, after both reconciliations have committed.
-- Projects without pg_cron remain valid.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $$
begin
  if to_regnamespace('cron') is null then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'happy-circles-new-user-state-nightly') then
    perform cron.unschedule('happy-circles-new-user-state-nightly');
  end if;
  perform cron.schedule(
    'happy-circles-new-user-state-nightly',
    '20 3 * * *',
    'select public.cleanup_new_user_operational_state();'
  );
end
$$;
