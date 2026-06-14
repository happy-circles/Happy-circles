# Push notification worker

Push notifications use `push_notification_events` as a durable queue and
`send-push-notifications` as the worker.

## Immediate processing

Business Edge Functions enqueue push events and trigger the worker in the
background. This is the normal path for fast delivery.

## Scheduled fallback

Configure a Supabase scheduled invocation so pending push events are recovered
if an immediate background trigger is missed. The fallback should run every 5
minutes; this keeps monthly invocations low while preventing stranded pending
events.

The repo includes a helper:

```bash
pnpm supabase:cron:push-notifications
pnpm supabase:cron:push-notifications --apply
```

Required environment:

- `SUPABASE_PROJECT_REF` or `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_ACCESS_TOKEN`
- `PUSH_NOTIFICATION_WORKER_SECRET` or `GRAPH_CYCLE_WORKER_SECRET`

The cron runs:

```sql
select net.http_post(
  url := 'https://PROJECT_REF.supabase.co/functions/v1/send-push-notifications',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-worker-secret', 'YOUR_PUSH_NOTIFICATION_WORKER_SECRET'
  ),
  body := '{"limit": 50, "workerId": "scheduled-push-notification-worker"}'::jsonb
);
```

Keep the worker secret outside the repo and paste it only in secure deployment
channels.

## Delivery troubleshooting

If `push_notification_events.last_error` is `InvalidCredentials`, the worker and
queue are running, but Expo rejected delivery because the app's push credentials
are not valid for the target platform. Fix the Expo/EAS push credentials for
APNs/FCM, then let the scheduled worker retry pending events.

## EAS push credentials

Check the current EAS push credential status:

```bash
pnpm eas:push-credentials
```

For iOS, create an Apple Push Notifications service key in Apple Developer and
keep the `.p8` file outside git. Then upload and assign it:

```bash
pnpm eas:push-credentials -- --apply \
  --ios-apns-key-p8 ./AuthKey_KEYID.p8 \
  --ios-apns-key-id KEYID
```

For Android, download a Firebase/Google Cloud private service account JSON key
with FCM permissions. This is not `google-services.json`. Then upload and assign
it:

```bash
pnpm eas:push-credentials -- --apply \
  --android-service-account ./firebase-service-account.json
```

Keep APNs `.p8`, `credentials.json`, and private service-account JSON files out
of source control. `google-services.json` is separate and may be added to
`apps/mobile/` for Android builds; the app config picks it up automatically when
the file exists.
