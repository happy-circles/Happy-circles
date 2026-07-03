# Supabase production/test separation runbook

This runbook cuts the current Supabase project over to clean production while
preserving existing accounts, and moves the current test data into a separate
test/demo project.

## Target state

- Current Supabase project: production, clean product state, same published app backend.
- New Supabase project: test/demo, cloned from the current project before cleanup.
- Production keeps current `auth.users`, `auth.identities`, `user_profiles`,
  `app_settings`, `analytics_event_catalog`, and storage buckets.
- Production deletes product state, sessions, refresh tokens, push devices,
  trusted devices, analytics events/facts, rate limits, support reports, invites,
  balances, ledgers, settlements, notification views, storage objects, audit
  events, and idempotency keys.

## Environment map

| Environment | Supabase project | Project ref | Intended usage |
| --- | --- | --- | --- |
| Production | Current App Store backend | `vknfhyfdtlvvfzptpqpj` | Real users, App Review, store builds |
| Test/demo | `happy-circles-test-demo` | `ciozrkhwekzbhsvgfqdg` | QA, demo data, internal builds, APK builds, development builds |

The production URL is the existing app backend. The test/demo URL is:

```text
https://ciozrkhwekzbhsvgfqdg.supabase.co
```

## Operating rules

- Never seed demo data into production.
- Never point `preview`, `development`, or `apk` EAS profiles at production.
- Never run destructive cleanup in production until a test/demo clone or backup
  has been verified.
- Use production only for App Store/TestFlight production releases and App
  Review validation.
- Use test/demo for screenshots, QA, manual testing, App Store review rehearsal,
  feature demos, and seeded data experiments.
- If production needs another clean reset, run
  `supabase/manual/07_production_clean_start.sql` only after updating the
  expected preserved user count and confirming backup/test-demo state.
- If test/demo needs fresh production-like data, clone or copy production into
  test/demo. Do not copy test/demo back into production except for intentional
  preserved reference data that has been reviewed table by table.
- Treat push tokens, trusted devices, sessions, analytics events, invites,
  requests, ledger rows, settlement rows, and storage objects as
  environment-local data.

## Current execution notes

- Production project ref: `vknfhyfdtlvvfzptpqpj`.
- Test/demo project: `happy-circles-test-demo`.
- Test/demo project ref: `ciozrkhwekzbhsvgfqdg`.
- Test/demo URL: `https://ciozrkhwekzbhsvgfqdg.supabase.co`.
- Supabase Branching was unavailable on the current plan, so test/demo was
  created as a separate project and populated from production.
- The restore point API was unavailable during execution, so schema, data,
  storage metadata/files, Edge Functions, secrets, and Auth provider settings
  were copied through the available Management, Storage, and CLI APIs.
- Auth sessions and refresh tokens were intentionally not copied to test/demo
  because project JWT secrets differ.
- The test/demo schema includes a compatibility no-op for the Realtime snapshot
  notification functions because the new project did not expose the same
  `realtime.messages` interface during migration replay. Snapshot fetches still
  work; revisit this before depending on test/demo for live Realtime broadcasts.
- EAS environment variables still need to be configured in the Expo dashboard or
  through an authenticated `eas env` CLI session.

## Preflight

1. In Supabase, take or verify a full backup of the current production project.
2. Create a new Supabase project for test/demo.
3. Clone or restore the current project into the test/demo project.
4. Copy required secrets/configuration into test/demo:
   - Auth providers and redirect URLs.
   - Edge Function secrets, including graph and push worker secrets.
   - Storage bucket configuration.
   - Email provider settings.
5. Verify test/demo has the current data before touching production:
   - `auth.users` count matches production.
   - `public.user_profiles` count matches production.
   - `storage.objects` count is nonzero if avatars currently exist.
   - Key app flows can log in against test/demo.

## Production cleanup

1. Open `supabase/manual/07_production_clean_start.sql`.
2. Confirm the expected preserved account count is still correct:
   - The script currently expects `23` `auth.users`.
   - If real users joined after the plan was made, stop and re-audit before
     changing this number.
3. Replace:

   ```sql
   REPLACE_WITH_BACKUP_AND_TEST_CLONE_VERIFIED
   ```

   with:

   ```sql
   BACKUP_AND_TEST_CLONE_VERIFIED
   ```

4. Run the script once in the Supabase SQL Editor for the current production
   project.
   - The script uses guarded `DELETE` statements instead of `TRUNCATE CASCADE`
     so preserved tables such as `public.user_profiles` cannot be deleted
     through foreign-key cascades.
5. Confirm the final result grid shows:
   - `auth.users = 23`
   - `public.user_profiles = 23`
   - `auth.sessions = 0`
   - `auth.refresh_tokens = 0`
   - `storage.objects = 0`
   - product-state tables such as `relationships`, `financial_requests`,
     `ledger_transactions`, `settlement_proposals`, `friendship_invites`,
     `account_invites`, `product_events`, `app_sessions`, `push_devices`, and
     `trusted_devices` are `0`.
6. Empty physical files from the `avatars` bucket in Supabase Storage if object
   bytes remain after metadata cleanup.

## Build environment split

Use separate EAS environment variable sets:

- `production`
  - `EXPO_PUBLIC_SUPABASE_URL`: current cleaned production Supabase URL.
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: current cleaned production publishable key.
- `preview`
  - `EXPO_PUBLIC_SUPABASE_URL`: new test/demo Supabase URL.
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: new test/demo publishable key.

`apps/mobile/eas.json` is configured so `development`, `preview`, and `apk`
build profiles use the EAS `preview` environment, while `production` uses the
EAS `production` environment.

Expected build routing:

| EAS profile | EAS environment | Supabase target |
| --- | --- | --- |
| `development` | `preview` | Test/demo |
| `preview` | `preview` | Test/demo |
| `apk` | `preview` | Test/demo |
| `production` | `production` | Production |

Before creating a store build, verify the EAS `production` environment contains
only the production Supabase URL and publishable key. Before creating a demo or
internal build, verify the EAS `preview` environment contains only the test/demo
Supabase URL and publishable key.

## Future refresh procedure

Use this when test/demo should be refreshed from production:

1. Confirm production is healthy and should be used as the source.
2. Take or verify a production backup.
3. Pause QA activity in test/demo.
4. Copy schema, data, storage objects, Edge Functions, Auth provider settings,
   redirect URLs, and required secrets into test/demo.
5. Do not copy `auth.sessions` or `auth.refresh_tokens`.
6. Verify row counts for `auth.users`, `public.user_profiles`, storage objects,
   and key product tables.
7. Run a preview/internal build against test/demo and smoke test login plus the
   main app flows.

## Validation

Run local checks after the repo change:

```powershell
pnpm security:check
pnpm test:supabase
pnpm typecheck
```

After production cleanup:

- Sign in with a preserved account and confirm the app shows a clean/empty
  state.
- Sign in with the App Review account and confirm login still works.
- Build or run an internal preview build and confirm it points at the test/demo
  Supabase project with the cloned data.
- Confirm push notifications do not target old production push tokens.
