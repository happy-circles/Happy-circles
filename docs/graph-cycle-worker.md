# Graph cycle worker

The graph cycle flow uses `graph_cycle_jobs` as the durable queue and
`process-graph-cycle-jobs` as the worker.

## Immediate processing

`accept-financial-request`, `execute-approved-cycle-settlement`, and
`propose-cycle-settlement` enqueue jobs and trigger the worker in the background.

## Scheduled fallback

Configure a Supabase scheduled invocation so pending jobs are recovered if an
immediate background trigger is missed. Supabase schedules Edge Functions from
Postgres with `pg_cron` and `pg_net`.

The fallback should run every 10 minutes. Immediate triggers still handle the
normal path after transactions, proposals, and executions. Keep the worker
secret outside the repo and paste it only in the Supabase SQL editor or another
secure deployment channel.

```sql
select cron.unschedule('process-graph-cycle-jobs-every-minute')
where exists (
  select 1
  from cron.job
  where jobname = 'process-graph-cycle-jobs-every-minute'
);

select cron.unschedule('process-graph-cycle-jobs-every-10-minutes')
where exists (
  select 1
  from cron.job
  where jobname = 'process-graph-cycle-jobs-every-10-minutes'
);

select cron.schedule(
  'process-graph-cycle-jobs-every-10-minutes',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/process-graph-cycle-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', 'YOUR_GRAPH_CYCLE_WORKER_SECRET'
    ),
    body := '{"limit": 25, "workerId": "scheduled-graph-cycle-worker"}'::jsonb
  );
  $$
);
```

Reference: https://supabase.com/docs/guides/functions/schedule-functions
