#!/usr/bin/env node
import { loadLocalEnv, runManagementSql } from './_supabase-management.mjs';

loadLocalEnv();

const apply = process.argv.includes('--apply');

const sql = `
do $$
declare
  v_command text;
  v_job record;
begin
  select command
    into v_command
  from cron.job
  where jobname in (
    'process-graph-cycle-jobs-every-minute',
    'process-graph-cycle-jobs-every-10-minutes'
  )
  order by case
    when jobname = 'process-graph-cycle-jobs-every-10-minutes' then 0
    else 1
  end
  limit 1;

  if v_command is null then
    raise exception 'existing graph cycle cron command not found';
  end if;

  for v_job in
    select jobname
    from cron.job
    where jobname in (
      'process-graph-cycle-jobs-every-minute',
      'process-graph-cycle-jobs-every-10-minutes'
    )
  loop
    perform cron.unschedule(v_job.jobname);
  end loop;

  perform cron.schedule(
    'process-graph-cycle-jobs-every-10-minutes',
    '*/10 * * * *',
    v_command
  );
end
$$;
`;

async function main() {
  if (!apply) {
    console.log('Dry run. Re-run with --apply to update the remote Supabase cron job.');
    console.log(sql.trim());
    return;
  }

  await runManagementSql(sql, { readOnly: false });
  console.log('Updated graph cycle worker cron to every 10 minutes.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
