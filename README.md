# Happy Circles

Happy Circles is a mobile app for confirmed personal debts. The product is intentionally built around two separate layers:

- `financial_requests` handles negotiation and acceptance.
- `ledger_transactions` and `ledger_entries` hold the immutable financial truth.

The core outcome is debt-circle closure. Users negotiate bilateral debts, confirm them explicitly, and the system derives a net graph with one edge per pair of users. Cycle settlements are proposed from that graph and executed as system-generated ledger movements, never by mutating history.

## Monorepo layout

- `apps/mobile`: Expo + React Native app shell with the MVP routes.
- `packages/domain`: pure domain rules, value objects, invariants, and graph algorithm.
- `packages/application`: use-case contracts and orchestration interfaces.
- `packages/infrastructure`: Supabase adapters, logging, and error mapping.
- `packages/shared`: DTOs, Zod schemas, and generated database types.
- `supabase`: SQL migrations, Edge Functions, and seed/test fixtures.
- `docs/adr`: architectural decision records.
- `docs/authentication-roadmap.md`: auth state, pending setup, and identity strategy.

## Financial design

- Money is stored as integer minor units only.
- Posted ledger movements are immutable.
- Corrections happen via accepted forward movements or contra entries.
- Idempotency is required for every critical write.
- The pair net edge is a projection, never the source of truth.
- `v_pair_net_edges_authoritative` is the reference definition.
- `pair_net_edges_cache` is a transactable cache that must stay reconstructible.

## Development

1. Install dependencies with `pnpm install`.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in your Supabase values if you want live data.
3. Start the mobile app with `pnpm dev:mobile`.
4. If Metro cache gets stale, rerun with `pnpm dev:mobile:clear`.
5. The mobile starter picks the first free Expo port automatically, starting from `8091`.
6. Run tests with `pnpm test`.
7. Run type checks with `pnpm typecheck`.

Important:
Do not run `npx expo ...` from the repository root. This repo is a monorepo and the Expo app lives in `apps/mobile`.

## Supabase workflow

- Apply SQL with the files in [`supabase/migrations`](./supabase/migrations).
- Deploy or run local Edge Functions from [`supabase/functions`](./supabase/functions).
- The initial seed is in [`supabase/seed.sql`](./supabase/seed.sql).

## Current implementation focus

This foundation ships the project structure, domain model, SQL schema, deterministic cycle detection, Edge Function skeletons for critical commands, app shell routes, and basic unit coverage for the critical financial rules.
