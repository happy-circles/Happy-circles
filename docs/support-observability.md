# Support Observability

Happy Circles uses a user-shareable `supportId` to connect a visible app error with backend logs and sanitized client context.

## What The User Sees

When an Edge Function or app data sync fails, the mobile app appends a short code to the visible message:

```text
Codigo de soporte: HC-1A2B-3C4D-5E6F.
```

Ask the user for that code, the approximate time, and what they were trying to do. The code is safe to share because it contains no account data, token, phone, email, or payload.

## How It Works

- The mobile app generates a `supportId` before calling an Edge Function.
- The app sends that value as `x-request-id`.
- Shared Edge Function handling returns the same value as `requestId` and includes it in server logs.
- On failure, the app writes a sanitized row through `report-client-error`.
- Reports are stored in `support_error_reports`; clients cannot read or write the table directly.

## Where To Look

Start with the support code:

```sql
select *
from public.support_error_reports
where support_id = 'HC-1A2B-3C4D-5E6F';
```

Then search Supabase Edge Function logs for the same value. For normal command failures, the backend log event is usually:

- `edge_rpc_error`
- `edge_public_rpc_error`
- `upload_avatar_error`

For background or operational failures, also check function-specific events such as:

- `graph_cycle_worker_trigger_failed`
- `welcome_email_provider_rejected`
- `welcome_email_mark_failed`

## Reconstructing A Case

Use the report row to identify:

- `user_id`
- `occurred_at`
- `kind`
- `function_name`
- `request_id`
- `screen_name`
- `route`
- `platform`
- `app_version`
- `error_code`
- `error_message`

Then query product usage around the same time:

```sql
select event_name, screen_name, occurred_at, metadata_json
from public.product_events
where user_id = '<user-id>'
  and occurred_at between '<time>'::timestamptz - interval '10 minutes'
                      and '<time>'::timestamptz + interval '10 minutes'
order by occurred_at;
```

For business-state reconstruction, query `audit_events` for the same user and window:

```sql
select event_name, entity_type, entity_id, request_id, metadata_json, created_at
from public.audit_events
where actor_user_id = '<user-id>'
  and created_at between '<time>'::timestamptz - interval '10 minutes'
                     and '<time>'::timestamptz + interval '10 minutes'
order by created_at;
```

## Privacy Rules

Do not put raw payloads, names, emails, phones, invite tokens, descriptions, or contact-book text into support reports. The database sanitizer only keeps allowlisted scalar metadata keys:

- `action`
- `functionName`
- `operation`
- `reason`
- `result`
- `source`
- `status`

The detailed server-side error remains in Edge Function logs under the same `requestId`.
