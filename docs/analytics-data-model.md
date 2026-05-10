# Analytics Data Model

Happy Circles keeps product analytics separate from `audit_events`.

`audit_events` is the domain/security audit trail. Product analytics captures minimized authenticated usage signals for activation, retention, engagement, funnels, and operational health.

All analytics days, cohorts, and refresh windows use UTC.

## Ingestion

Mobile sends product analytics through `POST /functions/v1/analytics-ingest` using the authenticated Supabase JWT.

The endpoint accepts:

- `clientSession`: `clientSessionId`, `platform`, `appVersion`, `deviceId`, `startedAt`
- `events`: up to 20 events with `clientEventId`, `eventName`, `occurredAt`, `screenName`, and `metadata`

`analytics-ingest` calls `ingest_product_analytics(...)`, which:

- creates or updates one `app_sessions` row per `clientSessionId`
- records `app_opened` idempotently for the session
- inserts batched `product_events` idempotently by `(actor_user_id, client_event_id)`
- sanitizes metadata per event through the runtime event catalog

Legacy endpoints `start-app-session` and `record-product-event` stay available for compatibility.

## Event Catalog

The source of truth for product events is the shared TypeScript catalog in `packages/shared/src/contracts/analytics.ts`.

`analytics_event_catalog` mirrors this catalog at runtime for database validation.

| Column | Purpose |
| --- | --- |
| `event_name` | Stable event identifier used by clients and SQL. |
| `description` | Human-readable event definition. |
| `event_family` | Functional group such as app, onboarding, finance, invites, settlements, or navigation. |
| `event_kind` | Event type: `navigation`, `intent`, `outcome`, or `lifecycle`. |
| `feature_key` | Product feature associated with the event. |
| `allowed_metadata_keys` | Per-event metadata allowlist used by the sanitizer. |
| `deprecated_at` | Marks events that should no longer be emitted. |

Metadata rules:

- no PII, tokens, free text, or sensitive IDs
- only keys listed in `allowed_metadata_keys`
- only scalar `string`, `number`, `boolean`, or `null`
- strings are truncated to 120 characters
- unknown metadata is dropped in SQL and rejected by the mobile client before enqueue

## Tables

| Table | What it stores | Main questions answered |
| --- | --- | --- |
| `analytics_event_catalog` | Runtime mirror of the typed event catalog. | Which events are valid, deprecated, and what metadata is allowed. |
| `app_sessions` | One authenticated app session/open with platform, app version, hashed device id, start, last seen, and end time. | DAU/WAU/MAU, last activity, approximate session duration, app version adoption. |
| `product_events` | Append-only minimized product events tied to a user and session. | Navigation, intent, experience signals, started/completed flows. |
| `analytics_daily_user_facts` | Daily per-user rollups derived from sessions and events. | Retention, active users, session depth, feature flags, core action counts. |
| `analytics_daily_product_facts` | Daily global rollups from product events and domain tables. | New users, active users, invites, relationships, accepted requests, ledger volume, circles closed. |
| `analytics_user_lifecycle_facts` | One row per user with first important lifecycle dates and invite source. | Activation funnel, customer retention, cohort quality. |
| `analytics_daily_event_facts` | Daily event-level rollups. | Event adoption, event frequency, power user concentration input. |
| `analytics_daily_feature_facts` | Daily feature-level rollups. | Feature adoption, depth, and repeated usage. |

## Official Metric Views

| View | Metrics |
| --- | --- |
| `v_analytics_active_usage` | DAU, WAU, MAU, stickiness. |
| `v_analytics_retention_cohorts` | D1, D7, D30 retention by first active cohort. |
| `v_analytics_activation_funnel` | Registered users, activated users, first relationship, first financial request, first accepted transaction. |
| `v_analytics_feature_adoption` | Feature active users, events per feature user, adoption over DAU. |
| `v_analytics_invite_virality` | Invite activity, invite acceptances, invite-sourced activations, viral coefficient proxy. |
| `v_analytics_engagement_depth` | Sessions, duration, screens, and core actions per active user. |
| `v_analytics_power_users` | Core action concentration among top 1%, 5%, and 10% of active users. |
| `v_analytics_operational_rfm` | Operational RFM segments and `repeat_transaction_rate` from confirmed internal financial activity, not revenue. |

## Metric Definitions

| Metric | Official source |
| --- | --- |
| DAU / WAU / MAU | `analytics_daily_user_facts` through `v_analytics_active_usage`. |
| Stickiness | `dau / mau` in `v_analytics_active_usage`. |
| Retention rate | Cohort activity in `v_analytics_retention_cohorts`. |
| Churn rate | Derived as `1 - retention_rate` for the same cohort window. |
| Activation rate | `activated_users / registered_users` in `v_analytics_activation_funnel`. |
| Funnel conversion | Step-to-step rates in `v_analytics_activation_funnel`. |
| Feature adoption | Feature active users over DAU in `v_analytics_feature_adoption`. |
| Session length and frequency | `v_analytics_engagement_depth`. |
| Customer retention | User retention from `v_analytics_retention_cohorts`; "customer" means authenticated user until explicit customer data exists. |
| Repeat purchase rate | Implemented as `repeat_transaction_rate` in `v_analytics_operational_rfm`. |
| RFM segmentation | `v_analytics_operational_rfm`, based on confirmed internal transactions. |
| Viral coefficient | Proxy in `v_analytics_invite_virality`: invite-sourced activations over inviter users. |
| Power user concentration | `v_analytics_power_users`. |
| Reactivation rate | Can be derived from lifecycle plus user facts; not exposed as a dedicated view yet. |
| Engagement depth | `v_analytics_engagement_depth`. |

Revenue, CAC, LTV, LTV:CAC, and NPS are intentionally not implemented until explicit trusted sources exist.

## Refresh

Run `refresh_analytics_daily_facts(p_day date)` to rebuild daily facts idempotently for one UTC day.

Run `refresh_analytics_recent_facts(p_days_back integer default 3)` to recompute today and recent UTC days.

Recommended `pg_cron` schedule:

```sql
select cron.schedule(
  'refresh-analytics-current-day-every-15-minutes',
  '*/15 * * * *',
  $$select public.refresh_analytics_daily_facts(timezone('utc', now())::date);$$
);

select cron.schedule(
  'refresh-analytics-recent-days-nightly',
  '15 3 * * *',
  $$select public.refresh_analytics_recent_facts(3);$$
);
```
