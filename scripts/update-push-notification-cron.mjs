#!/usr/bin/env node
import {
  loadLocalEnv,
  readEnv,
  resolveProjectRef,
  runManagementSql,
} from './_supabase-management.mjs';

loadLocalEnv();

const apply = process.argv.includes('--apply');
const projectRef = resolveProjectRef();
const workerSecret = readEnv('PUSH_NOTIFICATION_WORKER_SECRET', ['GRAPH_CYCLE_WORKER_SECRET']);

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql({ redactSecret = false } = {}) {
  const secret = redactSecret ? 'YOUR_PUSH_NOTIFICATION_WORKER_SECRET' : workerSecret;
  if (!secret) {
    throw new Error('Missing PUSH_NOTIFICATION_WORKER_SECRET or GRAPH_CYCLE_WORKER_SECRET.');
  }

  const workerUrl = `https://${projectRef}.supabase.co/functions/v1/send-push-notifications`;

  return `
do $$
declare
  v_job record;
begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then
    raise exception 'pg_cron and pg_net are required for scheduled push notifications';
  end if;

  for v_job in
    select jobname
    from cron.job
    where jobname in (
      'send-push-notifications-every-minute',
      'send-push-notifications-every-5-minutes'
    )
  loop
    perform cron.unschedule(v_job.jobname);
  end loop;

  perform cron.schedule(
    'send-push-notifications-every-5-minutes',
    '*/5 * * * *',
    $cron$
    select net.http_post(
      url := ${sqlLiteral(workerUrl)},
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', ${sqlLiteral(secret)}
      ),
      body := '{"limit": 50, "workerId": "scheduled-push-notification-worker"}'::jsonb
    );
    $cron$
  );
end
$$;
`;
}

async function main() {
  if (!apply) {
    console.log('Dry run. Re-run with --apply to update the remote Supabase cron job.');
    console.log(buildSql({ redactSecret: true }).trim());
    return;
  }

  await runManagementSql(buildSql(), { readOnly: false });
  console.log('Updated push notification worker cron to every 5 minutes.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
