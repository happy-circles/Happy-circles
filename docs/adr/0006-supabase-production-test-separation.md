# ADR 0006: Supabase Production/Test Separation

## Status

Accepted; operationally amended on 2026-08-14.

## Decision

The published App Store backend is the clean production Supabase project. Demo,
QA, internal builds, APK builds, development builds, and seeded test data use a
separate Supabase test/demo project.

Production must not contain demo product state. It preserves real login
identities, profile rows, app settings, analytics catalog rows, and storage
buckets, but product data such as relationships, requests, ledger rows,
settlements, invites, analytics events, push devices, trusted devices, sessions,
and storage objects is environment-specific and disposable outside production.

## Consequences

- `production` EAS builds point at the production Supabase project.
- `preview`, `development`, and `apk` EAS builds point at the test/demo Supabase
  project.
- Demo data is never seeded into production.
- Production cleanup must use the guarded SQL runbook and must preserve
  `auth.users`, `auth.identities`, and `public.user_profiles`.
- Any future clone, reset, or restore must be verified with explicit row counts
  before changing production.
- Operational details live in
  `docs/supabase-prod-test-separation-runbook.md`.

## Operational amendment: production smoke APK

The original decision used the `apk` EAS profile for test/demo. For release
candidate `1.0.2`, that profile is reserved instead for a controlled,
non-store APK smoke against the production EAS environment. It uses production
credentials, does not auto-increment the store counter, and must not create demo
or seeded data.

This amendment does not move normal QA to production:

- `development` and `preview` remain on the test/demo project.
- General QA, screenshots, demos, and seeded scenarios remain on test/demo.
- The production APK is only for the final login/onboarding/device/OAuth smoke
  with dedicated release-test accounts before building the production AAB.
- The APK is never uploaded to Play Console; the store artifact remains the
  `production` AAB.
