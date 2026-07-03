#!/usr/bin/env node
import { loadLocalEnv, runManagementSql } from './_supabase-management.mjs';

loadLocalEnv();

const apply = process.argv.includes('--apply');

const sql = `
do $analytics_cron$
declare
  v_job record;
begin
  if to_regnamespace('cron') is null then
    raise exception 'pg_cron is required for scheduled analytics refreshes';
  end if;

  for v_job in
    select jobname
    from cron.job
    where jobname in (
      'refresh-analytics-current-day-every-15-minutes',
      'refresh-analytics-recent-days-nightly'
    )
  loop
    perform cron.unschedule(v_job.jobname);
  end loop;

  perform cron.schedule(
    'refresh-analytics-current-day-every-15-minutes',
    '*/15 * * * *',
    $cron$select public.refresh_analytics_daily_facts(timezone('utc', now())::date);$cron$
  );

  perform cron.schedule(
    'refresh-analytics-recent-days-nightly',
    '15 3 * * *',
    $cron$select public.refresh_analytics_recent_facts(3);$cron$
  );
end
$analytics_cron$;
`;

async function main() {
  if (!apply) {
    console.log('Dry run. Re-run with --apply to update the remote Supabase cron jobs.');
    console.log(sql.trim());
    return;
  }

  await runManagementSql(sql, { readOnly: false });
  console.log('Updated analytics refresh cron jobs.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
