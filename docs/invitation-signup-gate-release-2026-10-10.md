# Invitation signup gate production release — October 10, 2026

An existing account with `needs_invite` or `needs_activation` could complete authentication and remain on the invitation route with the success/loading state still holding the controls. The mobile update clears that transient state and presents usable invitation entry controls. A valid invitation continues through the existing activation workflow.

Previously, ordinary social login could create a new Supabase Auth account before an invitation was supplied. Production now requires a valid invitation for new email accounts and an invitation-bound, server-verified identity permit for new Google/Apple accounts. Existing-account authentication remains on its existing flow. Creating an Auth account still does not activate the profile or bypass phone/device checks.

## Published source and backend

- Released source: `dffa93e25846c7fe9f476ca4c670d0a951d35f7c`.
- [Security CI run 38073694383](https://github.com/happy-circles/Happy-circles/actions/runs/38073694383) passed for that exact commit, including the full Supabase schema/migration/SQL suite.
- Production project: `vknfhyfdtlvvfzptpqpj`. The reviewed migration `20261010173949_invitation_required_registration.sql` was applied; all 93 local/remote migrations aligned afterward.
- `prepare-social-registration` is ACTIVE, version 1. Gateway JWT verification is disabled because the endpoint validates the supplied provider identity itself. Server-only Google/Apple audience values match the existing trusted Auth provider configuration.
- At `2026-10-10T18:08:41.106Z`, both final controls were enabled and read back: `app_private.signup_gate_configuration.enforce_social_grants = true`, and Before User Created hook `pg-functions://postgres/app_private/require_invited_signup` enabled.
- Google and Apple providers remain enabled. Anonymous signup remains disabled.

The backend was installed additively with enforcement disabled. The final gates were enabled only after both production platform updates and their endpoint/runtime prerequisites were verified.

## Mobile artifacts

EAS project `9b63f5f3-3c81-4d3d-bc54-1a81b998d20a`; runtime `hc-sdk54-20260928-1`. Each platform was published separately using the production EAS environment, a clean checkout at the released source, and pinned EAS CLI 21.7.1.

| Channel          | Platform | Update ID                              | Group ID                               |
| ---------------- | -------- | -------------------------------------- | -------------------------------------- |
| production-smoke | Android  | `01a126fa-0e60-7aa8-b5a0-b0debae3ed33` | `078c738b-0cfb-4236-aa27-ca0cbefea7e4` |
| production-smoke | iOS      | `01a126fb-81ce-760c-81f2-22bdebf993ca` | `ae648ff8-0470-4595-8c51-f09796d4f090` |
| production       | Android  | `01a126fe-6ee3-74d4-b01a-a710f7107ed6` | `d6609b5e-f096-4639-ab6a-6eb18a31fe41` |
| production       | iOS      | `01a126ff-dbe8-7e3c-98d8-c12f913857a8` | `1ee0ddd6-3231-4cbb-9801-ba46286eb062` |

The served manifests identify the expected updates and production backend. The public publishable key from the manifest was accepted by that project's Auth settings endpoint (HTTP 200). Backend configuration comes from `Constants.expoConfig.extra`; the backend URL is not required to appear literally in Hermes bytecode. No test backend or server credentials were found in the published manifests/bundles. CDN-served bundle hashes matched the preserved exports, and smoke/production bundles were identical per platform:

- Android SHA256 (base64url): `ic6mYZwIQkJBeGLpGAx_7J3b32LZZnks0S0qX2Iw8Hg`.
- iOS SHA256 (base64url): `slfjfo_ljfLL6TIKDvaKSqreJ3erYc0bNFtXFd5NHKg`.

The installed 1.0.3 artifacts already contain the native Google/Apple dependencies and required configuration. No native configuration changed relative to their source, so this release needed no new store binary. Clients download the update at startup and apply it on a subsequent app launch. Older binaries outside this runtime require a compatible store update.

## Verification and limits

- Local mobile/Edge regression suite: 1,105 tests in 149 files passed. Lint, workspace typecheck, dependency audit, release-environment checks, landing build and security checks passed. CI additionally passed the full Supabase suite.
- Isolated PGlite verification passed the new migration and SQL assertions. It supplements the full CI run and does not run the hosted Auth server.
- A fresh anonymous Android 1.0.3 emulator clone downloaded the smoke update, launched it in a new online process, and launched again in a new offline process: two successful launches, zero failed launches/fatal errors, invitation entry rendered in both. The base AVD was not used for account authentication.
- At `2026-10-10T18:08:45.680Z`, a real production `/auth/v1/signup` request without an invitation returned HTTP 403 with `account_invite_required`. Database checks confirmed no Auth user or profile was created. A read-only uninvited social hook evaluation also returned 403.
- A bogus provider proof to the public registration endpoint returned its generic HTTP 400 validation failure without granting registration.
- Final readback at `18:12:53 UTC` confirmed both gates and the endpoint remain enabled. A read-only email hook evaluation using a current valid invitation was allowed. The affected account remained `needs_invite` with no activation performed.
- EAS remained on Free without add-ons or a new build. Readback at `18:11:56 UTC`: 15/1000 updaters, 103 MiB/100 GiB, 3/30 builds, zero overage and zero estimated cost. Usage counters can lag downloads.

The connected test/demo project's Management API role rejected SQL access with HTTP 403 before query execution. No migration or configuration change was attempted there. Validation therefore used the full CI schema suite, isolated regression checks, Android smoke execution and the staged production checks above. A real invited Google/Apple signup on a physical device was not performed. iOS publication was checked through its native artifact, export and served manifest/bundle; it was not exercised on a physical iPhone. The affected user's successful activation still requires their own interaction.

## Account recovery and evidence

Preserve existing accounts. A pending account should open its valid invitation, authenticate with its existing provider/account and complete the normal activation flow. Do not delete/recreate the account or manually activate it as part of this release. Invitation links and user identifiers are intentionally excluded from this record.

Private local release receipts, environment checks and all four exports are preserved under `.tmp/invited-auth-release-20261010/`. Android screenshots, logs and launch receipts are under `.tmp/invitation-registration-emulator-qa/`. These ignored local files are not part of the public source history.

For a backend emergency rollback, follow [the rollout and rollback procedure](invitation-signup-gate-rollout-2026-10-10.md): disable the Auth hook and private INSERT enforcement together, leaving the migration and endpoint in place. That temporarily restores permissive signup, so an OTA rollback to a client lacking the permit flow must be coordinated with backend compatibility. Do not delete active grants or change user/invitation activation state.
