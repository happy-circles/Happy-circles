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

Use project-specific values for the function URL, authorization token, and
`GRAPH_CYCLE_WORKER_SECRET`.

```sql
select cron.schedule(
  'process-graph-cycle-jobs-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/process-graph-cycle-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_OR_INTERNAL_TOKEN',
      'x-worker-secret', 'YOUR_GRAPH_CYCLE_WORKER_SECRET'
    ),
    body := '{"limit": 25, "workerId": "scheduled-graph-cycle-worker"}'::jsonb
  );
  $$
);
```

Reference: https://supabase.com/docs/guides/functions/schedule-functions
