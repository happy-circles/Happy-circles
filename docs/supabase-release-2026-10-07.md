# Supabase release 2026-10-07

Phase 1 is complete and verified in production: 88 migrations, 42 ACTIVE Edge Functions, and 34 compatible function bundles updated. Eight financial/account-deletion bundles remain on their previous versions until the transition for older clients is resolved and authentication QA passes.

## Verified starting state

- Production: `vknfhyfdtlvvfzptpqpj`, status `ACTIVE_HEALTHY`.
- Production migration history: 86 files, through `20260813051000_0086_settlement_trigger_acl`.
- Repository migration inventory: 88 files; the two pending migrations are `20260928202038_friendship_lifecycle_recovery.sql` and `20260928202134_private_contact_discovery.sql`.
- Production Edge Functions: 40, all `ACTIVE`, last updated 2026-08-14. Repository: 42 entrypoints.
- Missing production functions: `manage-contact-discovery`, `remind-friendship-invite`.
- Seven existing cron jobs are active. The pending discovery migration adds `happy-circles-contact-discovery-cleanup` every five minutes.
- SMTP is configured; email confirmation, Google and Apple providers are enabled. Auth redirects include `happycircles://**` and `https://app.happy-circles.com/**`.
- Security advisor: no ERROR, two WARN. The private-profile SECURITY DEFINER function filters by `auth.uid()` and has a fixed search path; leaked-password protection is disabled. Performance advisor: 33 INFO, no WARN/ERROR.
- The existing test/demo project `ciozrkhwekzbhsvgfqdg` returns 403 under the available Management credentials. Do not route preview builds to production or create a replacement project without resolving the intended test target.

## Validation and tools

Production changes were applied after commit `3a6b8d15a54e7a59897114055e591322d2ed8c32` passed [GitHub CI run 37717727174](https://github.com/happy-circles/Happy-circles/actions/runs/37717727174), including the SQL suite in an ephemeral Supabase stack. The local Docker daemon could not start; no existing stack was reset, no production SQL tests were run, and no Docker data was removed.

Use the official Supabase CLI v2.114.0 native Go binary. The official Windows release ZIP was verified against the GitHub release asset digest: `848d0eacc6f4f7722f9874eaa0498e0ac674236907e5f70b44f1dac059b27b68`.

Explicitly pass `--profile supabase`: the machine's saved profile points to a missing Aquapp profile file. This flag selects Supabase's official endpoints without changing the user's saved profile. Credentials are supplied through the existing environment and are never written into this document or command arguments.

The linked-production migration dry-run succeeded and reported exactly the two pending files. CLI `db push --linked --yes` applied both and preserved their filename versions in migration history. The subsequent dry-run reported that the remote database was up to date. The Management API migration endpoint was not used because it generates a new version instead of accepting these existing file versions. No seeds, role files, or remote resets were included.

## Phase 1: compatible backend release

Completed on 2026-10-07 between 21:30 and 21:32, America/Bogota (UTC-05:00).

1. Confirmed the committed release passed CI and rechecked the migration dry-run.
2. Applied the two migrations in filename order through CLI `db push --linked --yes`.
3. Deployed the 34 compatible Edge Functions below, using explicit names, `--project-ref vknfhyfdtlvvfzptpqpj`, `--use-api`, and the checked-in `verify_jwt` settings. No functions were pruned.
4. Verified 88 migration history entries, 42 ACTIVE functions, the new RPCs, discovery tables/triggers/cron, configured JWT verification, and advisors.

The backend dependencies for app and landing distribution are present. `trust-current-device` is included in Phase 1: its idempotent path returns the existing authorization only when the verified actor, device ID, exact JWT session, trusted state, and non-revoked state match. It does not mutate that device or renew sensitive-action proof. Creating or restoring authorization still requires recent authentication, with proof later than revocation when applicable. This change preserves old-client compatibility and allows the new client to reuse an already authorized session.

Phase 1 function inventory:

```text
activate-account-from-invite
analytics-ingest
cancel-account-invite
cancel-friendship-invite
claim-account-invite
claim-external-friendship-invite
create-account-invite
create-external-friendship-invite
create-internal-friendship-invite
create-people-outreach
get-account-invite-preview-public
get-app-snapshot
get-friendship-invite-preview
get-people-overview
manage-contact-discovery
process-graph-cycle-jobs
propose-cycle-settlement
propose-transaction-reversal
record-product-event
register-push-token
remind-friendship-invite
report-client-error
resolve-people-targets
respond-internal-friendship-invite
resume-account-invite
review-account-invite
review-external-friendship-invite
revoke-trusted-device
send-push-notifications
send-welcome-email
start-app-session
touch-current-device
trust-current-device
upload-avatar
```

All 42 local functions import `_shared/http.ts`. Phase 1 updated the shared helpers bundled into its 34 deployed functions; the eight deferred functions retain their existing production bundles. The remote inventory comparison confirmed exactly 34 bundles changed and that all eight deferred versions, timestamps, and JWT settings remained unchanged.

## Phase 2: session-bound device authorization

The published 1.0.2 client implements password step-up by calling `signInWithPassword()` and then returning success, without authorizing its new Supabase session through `trust-current-device`. Its financial payloads and headers do not identify the current device. The new strict endpoints require `trusted_devices.trusted_session_id` to match the verified JWT's `session_id`, so deploying them immediately would block existing clients after password reauthentication.

There is no safe server-only recovery from that older payload without widening authorization. Do not infer a trusted device from IP, user agent, or user identity. These eight production bundles were kept unchanged during review and the compatible release:

```text
accept-financial-request
amend-financial-request
approve-cycle-settlement
create-balance-request
execute-approved-cycle-settlement
reject-cycle-settlement
reject-financial-request
request-account-deletion
```

Deploy Phase 2 only after the new client is publicly available, the transition for remaining old clients has been resolved, and authentication QA passes. Store availability alone does not prove that all users updated. Verify password, Google, Apple, biometric unlock, session refresh, revocation, and account-switch paths against the new app before enabling these server guards. Production has 42 deployed functions after Phase 1 while intentionally retaining older code in these eight bundles; Phase 2 is not complete.

## Execution record

- Production dry-run: passed; exactly the two expected migrations.
- SQL CI: passed in [run 37717727174](https://github.com/happy-circles/Happy-circles/actions/runs/37717727174) for release commit `3a6b8d15a54e7a59897114055e591322d2ed8c32`.
- Applied migration receipts: `20260928202038` / `friendship_lifecycle_recovery` and `20260928202134` / `private_contact_discovery`.
- Production migration history: 88 entries, no missing local versions; final CLI dry-run reports up to date.
- Phase 1 Edge deployment: 34 updated bundles; 42/42 functions ACTIVE; no JWT configuration mismatches; eight deferred bundles confirmed unchanged.
- Discovery cleanup receipt: cron job ID `9`, name `happy-circles-contact-discovery-cleanup`, schedule `*/5 * * * *`, active.
- `resolve_people_targets_observed`, `manage_contact_discovery`, `remind_friendship_invite`, and `friendship_push_event_is_current` exist and are executable by `service_role`, not `anon` or `authenticated`.
- Both private discovery tables have RLS enabled; `contact_discovery_profile_changed` and `friendship_push_outbox` triggers are enabled.
- Security advisor after deployment: zero ERROR, the same two WARN, and three INFO for RLS-enabled tables without client policies. The private discovery tables are accessed through the service-only RPCs.
- Anonymous smoke requests to `manage-contact-discovery`, `remind-friendship-invite`, and `resolve-people-targets` returned 401. No users or product fixtures were created in production.
- Verified at 2026-10-07 21:32:44 America/Bogota (`2026-10-08T02:32:44.112Z`).
- Phase 2: eight bundles deferred pending old-client transition and authentication QA.
- Test/demo synchronization: still blocked by 403 under available credentials; access to the intended project remains pending. Preview must not be redirected to production.

Key function receipts, all ACTIVE with JWT verification enabled:

| Function | Function ID | Deployed version |
| --- | --- | --- |
| `manage-contact-discovery` | `8256599b-bc0a-42b9-8e1e-12923170d228` | 1 |
| `remind-friendship-invite` | `1ffb01be-f36c-4530-9e94-6fc175be0af7` | 1 |
| `trust-current-device` | `313070da-4ddf-4590-bbec-389849ff668f` | 2 |

The local operational record is `.tmp/supabase-phase1-verification.json`; it contains the full function inventory and the before/after comparison. It is an ignored local artifact, not a versioned repository dependency.
