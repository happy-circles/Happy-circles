# Security Architecture

Happy Circles treats Supabase as the enforcement layer, not only as storage. Client code may improve UX and local protection, but authorization must be verifiable in Postgres RLS or Edge Functions.

## Data Access

- Public tables use RLS. New tables must ship with `enable row level security` in the same migration that creates them.
- User-facing public views must use `security_invoker=true` so the caller's RLS policies apply.
- Private profile data belongs in own-profile endpoints or views. Cross-user profile surfaces should expose only `id`, `display_name`, `avatar_path`, minimal account state, and timestamps.
- `app_settings` is public only for allowlisted runtime keys: `currency`, `app_web_origin`, and `mobile_min_supported_version`.

## Edge Functions and RPC

- Authenticated Edge Functions require Supabase JWT verification and also validate the actor with `_shared/http.ts`.
- Sensitive RPCs that accept `p_actor_user_id` are not a client contract. They are executable by `service_role` only and should be called through Edge Functions.
- Edge errors return stable public codes and a `requestId`. Internal database or validation detail is logged server-side with that `requestId`.

## Invitation Tokens

- Delivery tokens are never persisted raw. Creation/resend flows generate the token in memory, store only `token_hash`, and return the raw token once to the owner flow that needs to share the link.
- Idempotency responses strip `deliveryToken` before persistence, so retries may mint a fresh delivery token instead of recovering a raw secret from the database.
- Public account invite preview is intentionally unauthenticated, but it returns a minimal payload, masks recipient phone data, uses a generic unavailable reason, and rate-limits by token hash plus a hashed client fingerprint.

## Device Trust

- Biometrics and device trust are local step-up protections. They must not be treated as server-side proof if the client can modify the backing state.
- Server-side authorization should be based on JWT identity, RLS, relationship/account state, and invite/token validity.
- Account invite activation does not authorize from `trusted_devices`; the server records device metadata only as account context.

## Migration Checklist

- New table: RLS enabled, explicit grants, select/update/delete policies, and tests for another user's data.
- New view: `security_invoker=true`, no raw tokens, no unnecessary PII, and an introspection test.
- New RPC: classify as public preview, authenticated read, or sensitive command. Sensitive commands should be `service_role` only.
- New Edge Function: `verify_jwt=true` unless it is explicitly public, safe error shape, and request logging with `requestId`.
- New dependency: run `pnpm audit --audit-level=moderate` and document any accepted residual risk.
