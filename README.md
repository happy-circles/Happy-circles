# Happy Circles

Happy Circles is a private finance app for confirmed balances between trusted people. It is built for a request-first workflow: users propose money movements, counterparties explicitly confirm them, and the system records accepted outcomes in an immutable ledger.

The product goal is to make small personal debt networks easier to close. Happy Circles derives a net graph from the ledger, finds debt cycles, proposes settlement circles, and executes approved circles as system-generated ledger movements without rewriting history.

## Current Product Surface

The repository currently contains two user-facing apps:

- `apps/mobile`: Expo + React Native app with authentication, onboarding, people, invitations, balances, analytics, transactions, settlements, profile, security, notifications, and audit surfaces.
- `apps/landing`: Next.js app for the public landing page, store/download routing, native app-link gateway routes, and iOS/Android association files.

The mobile app is backed by Supabase Auth, Postgres, Row Level Security, Storage, and Edge Functions. The web app supports Universal Links and Android App Links for operational routes such as `/join`, `/join/{token}`, `/invite/{token}`, `/reset-password`, and `/setup-account`.

## How The App Works

### Identity and Access

- Users authenticate through Supabase Auth with email/password, Google, and Apple flows.
- Accounts can be invite-gated through `account_access_state`.
- First-run setup collects required profile data, phone metadata, device trust, and optional contacts/notification permissions.
- Trusted devices and biometrics are local step-up protections used before sensitive client actions.
- Server-side authorization remains enforced through JWT identity, RLS policies, account state, relationship state, invite validity, and Edge Function checks.

### People and Invitations

- Users build a trusted people graph through internal friendship invites, external remote invites, QR invite links, and account invites for people who do not yet have an account.
- Delivery tokens are returned only to the flow that needs to share them. The database stores token hashes, not raw invite tokens.
- Public invite preview is intentionally narrow and masked.
- Remote contact resolution uses phone matching to decide whether the flow should create a friendship invite, account invite, or already-related response.

### Money Requests

- Money starts as a `financial_request`, not as a direct ledger write.
- The current user can create a balance-increase request with a counterparty, direction, amount, description, and transaction category.
- The responder can accept, reject, or amend the request.
- Accepted requests create immutable ledger transactions and entries.
- Transaction reversals are represented as forward domain actions, not destructive edits.

### Ledger and Balance Projection

- `ledger_transactions` and `ledger_entries` are the source of truth.
- Money is stored as integer minor units in `COP`.
- `v_pair_net_edges_authoritative` is the canonical pair-net projection.
- `pair_net_edges_cache` is an optimization that must remain reconstructible from ledger history.
- The mobile app reads live Supabase views and builds dashboard, balance, people, transaction, settlement, and audit DTOs through `apps/mobile/src/lib/live-data.ts`.

### Happy Circle Settlement

- Cycle detection runs on the authoritative pair-net graph.
- Detected cycles become settlement proposals with participant decisions.
- A proposal can be approved, rejected, and, once approved, executed.
- Execution creates system-sourced ledger movements that reduce redundant debt edges.
- `graph_cycle_jobs` provides the durable queue.
- `process-graph-cycle-jobs` is the worker. Critical commands enqueue work and trigger the worker in the background, with a scheduled Supabase fallback recommended for recovery.

### Analytics and Audit

- `audit_events` is the domain and security audit trail.
- Product analytics are stored separately in `app_sessions`, `product_events`, and daily rollups.
- Analytics metadata is allowlisted, scalar-only, and intentionally excludes names, phones, emails, invite tokens, and free-form user text.
- Clients send product usage through Edge Functions instead of writing analytics tables directly.

## Monorepo Layout

- `apps/mobile`: Expo Router mobile app and React Native UI.
- `apps/landing`: Next.js landing and app-link gateway.
- `packages/domain`: pure domain rules, value objects, ledger invariants, requests, relationships, settlements, and graph algorithms.
- `packages/application`: use-case contracts, command orchestration, query DTOs, and ports.
- `packages/infrastructure`: Supabase client adapters, structured logging, and application error mapping.
- `packages/shared`: DTO contracts, Zod schemas, enums, identifiers, and generated database types.
- `supabase/migrations`: ordered Postgres schema, RLS, views, RPCs, analytics, security, invites, and graph worker migrations.
- `supabase/functions`: Supabase Edge Functions for authenticated commands, public previews, analytics writes, and graph-cycle processing.
- `supabase/tests`: SQL-level verification fixtures for ledger/cache consistency, cycle proposals, invite flows, security hardening, analytics, and graph jobs.
- `docs/adr`: architectural decision records for ledger truth, request-first negotiation, pair-net modeling, deterministic cycle settlement, and snapshot validation.
- `docs`: operational notes for authentication, email delivery, app links, analytics, security, graph worker scheduling, release readiness, and UX/copy standards.

## Architectural Principles

- The ledger is the financial source of truth.
- Posted ledger movements are immutable.
- Corrections happen through accepted forward movements or contra entries.
- Financial writes require idempotency keys.
- Pair-net edges are projections, not truth.
- Sensitive writes go through Edge Functions and service-role RPCs, not direct client table access.
- User-facing views must preserve RLS semantics and avoid unnecessary PII.
- Invitation and analytics data should be minimal by default.

## Development

Install dependencies:

```bash
pnpm install
```

Run the mobile app:

```bash
pnpm dev:mobile
```

Useful mobile variants:

```bash
pnpm dev:mobile:clear
pnpm dev:mobile:go
pnpm dev:mobile:tunnel
```

Run the landing app:

```bash
pnpm dev:landing
```

Quality checks:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build:landing
pnpm security:check
pnpm test:supabase
```

Important: do not run `npx expo ...` from the repository root. This is a pnpm monorepo and the Expo app lives in `apps/mobile`.

Supabase usage helpers:

```bash
pnpm supabase:usage
pnpm supabase:cron:graph-cycle -- --apply
pnpm supabase:cleanup:avatars
pnpm supabase:cleanup:avatars -- --apply
```

## Environment

Start from the checked-in examples:

- `.env.example`: combined root reference for local development and deployment variables.
- `apps/mobile/.env.example`: Expo public runtime variables.
- `apps/landing/.env.example`: Next.js app-link and store routing variables.

Mobile variables:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_APP_WEB_ORIGIN`
- `EXPO_PUBLIC_AUTH_REDIRECT_MODE`

Landing and app-link variables:

- `NEXT_PUBLIC_APP_WEB_ORIGIN`
- `NEXT_PUBLIC_APP_SCHEME`
- `NEXT_PUBLIC_APP_STORE_URL`
- `NEXT_PUBLIC_PLAY_STORE_URL`
- `NEXT_PUBLIC_WAITLIST_URL`
- `APPLE_TEAM_ID` or `APPLE_APP_ID`
- `IOS_BUNDLE_IDENTIFIER`
- `ANDROID_PACKAGE_NAME`
- `ANDROID_SHA256_CERT_FINGERPRINTS`

Backend worker variable:

- `GRAPH_CYCLE_WORKER_SECRET`

Operational Supabase script variables:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY` only for deleting orphaned Storage objects with `--apply`

Production deployments must set `GRAPH_CYCLE_WORKER_SECRET`; the graph-cycle worker intentionally returns an operational error and processes no jobs when the secret is missing.

Never commit real `.env` files.

## Supabase Workflow

- Apply migrations in order from `supabase/migrations`.
- Use `supabase/seed.sql`, `supabase/dev`, and `supabase/scripts` for demo and remote development data workflows. Demo users and demo reset helpers must not live in production migrations.
- Deploy Edge Functions from `supabase/functions`.
- Keep `supabase/config.toml` aligned with function auth requirements.
- Run SQL verification fixtures from `supabase/tests` after schema changes that affect ledger, invites, analytics, storage, security, or graph-cycle behavior.
- Configure the scheduled graph-cycle fallback described in `docs/graph-cycle-worker.md` for deployed environments.

## App-Link Workflow

The landing app serves the operational gateway for:

- `/join`
- `/join/{token}`
- `/invite/{token}`
- `/reset-password`
- `/setup-account`

It also serves:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Production setup still requires DNS, Vercel domain attachment, Apple Team ID, Android release SHA-256 fingerprints, Supabase Auth redirect allow-list entries, and rebuilt native apps after associated-domain or intent-filter changes.

## Documentation Index

- `docs/authentication-roadmap.md`: authentication state, pending setup, and identity strategy.
- `docs/auth-email-setup.md`: Supabase, Resend, and auth email delivery setup.
- `docs/app-link-gateway.md`: web gateway, Universal Links, Android App Links, and auth redirects.
- `docs/security-architecture.md`: RLS, Edge Function, invite-token, device-trust, and migration rules.
- `docs/analytics-data-model.md`: product analytics schema, privacy rules, and metric sources.
- `docs/support-observability.md`: support codes, client error reports, and how to trace user-reported failures.
- `docs/graph-cycle-worker.md`: durable graph job queue and scheduled worker fallback.
- `docs/store-release-readiness.md`: App Store and Play Store release checklist.
- `docs/ux-copy-standards.md`: visible copy, UI state, and design source guidance.

## Current Implementation Status

This repo is beyond an app shell. It includes the mobile product flows, landing gateway, Supabase schema, RLS posture, Edge Function command layer, immutable ledger model, deterministic cycle settlement domain logic, graph-cycle job worker, product analytics model, security hardening, and focused TypeScript and SQL test coverage.

External production setup remains required for domains, store URLs, native app association, Supabase Auth email delivery, and scheduled graph worker execution.
