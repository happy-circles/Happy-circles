# Supabase release 2026-10-07

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

Production changes wait for the release commit and successful GitHub CI, including the SQL suite in an ephemeral Supabase stack. The local Docker daemon could not start; no existing stack was reset, no production SQL tests were run, and no Docker data was removed.

Use the official Supabase CLI v2.114.0 native Go binary. The official Windows release ZIP was verified against the GitHub release asset digest: `848d0eacc6f4f7722f9874eaa0498e0ac674236907e5f70b44f1dac059b27b68`.

Explicitly pass `--profile supabase`: the machine's saved profile points to a missing Aquapp profile file. This flag selects Supabase's official endpoints without changing the user's saved profile. Credentials are supplied through the existing environment and are never written into this document or command arguments.

The linked-production migration dry-run succeeded and reported exactly the two pending files. Use `db push --linked` to preserve their filename versions in migration history. Do not use the Management API migration endpoint here: it generates a new version instead of accepting these existing file versions. Do not include seeds, role files, or remote resets.

## Phase 1: compatible backend release

1. Confirm the committed release passed CI and recheck migration dry-run.
2. Apply the two migrations in filename order through CLI `db push --linked --yes`.
3. Deploy the 33 compatible Edge Functions below, using explicit names, `--project-ref vknfhyfdtlvvfzptpqpj`, `--use-api`, and the checked-in `verify_jwt` settings. Do not use `--prune`.
4. Verify 88 migration history entries, 42 ACTIVE functions, the three new RPCs, discovery tables/trigger/cron, configured JWT verification, and advisors.
5. Publish the app and landing builds only after their backend dependencies exist.

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
upload-avatar
```

All 42 local functions import `_shared/http.ts`. Phase 1 updates the shared helpers bundled into its 33 deployed functions; the nine deferred functions retain their existing production bundles.

## Phase 2: session-bound device authorization

The published client implements password step-up by calling `signInWithPassword()` and then returning success, without authorizing its new Supabase session through `trust-current-device`. Its financial payloads and headers do not identify the current device. The new strict endpoints require `trusted_devices.trusted_session_id` to match the verified JWT's `session_id`, so deploying them immediately would block existing clients after password reauthentication.

There is no safe server-only recovery from that older payload without widening authorization. Do not infer a trusted device from IP, user agent, or user identity. Keep these nine production bundles unchanged during review and the compatible release:

```text
accept-financial-request
amend-financial-request
approve-cycle-settlement
create-balance-request
execute-approved-cycle-settlement
reject-cycle-settlement
reject-financial-request
request-account-deletion
trust-current-device
```

Deploy Phase 2 only after the new client is publicly available and the transition for remaining old clients has been addressed. Store availability alone does not prove that all users updated. Verify password, Google, Apple, biometric unlock, session refresh, revocation, and account-switch paths against the new app before enabling these server guards. The release can have 42 deployed functions after Phase 1 while still intentionally retaining older code in these nine bundles.

## Execution record

- Production dry-run: passed; exactly the two expected migrations.
- SQL CI: pending.
- Production migrations and Phase 1 Edge deployment: pending.
- Phase 2: deferred for published-client compatibility.
- Test/demo synchronization: pending access to the intended project.
