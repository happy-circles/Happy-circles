# Invitation-only user creation

The migration `20261010173949_invitation_required_registration.sql` and public Edge Function `prepare-social-registration` prepare the server-side signup gate. They do not enable the Auth hook or its final INSERT enforcement switch. Ordinary Google login keeps its existing OAuth flow; invited Google signup obtains a native Google identity token first. Apple signup uses its existing native token and nonce. Browser-only/new-user Google fallback uses invited email registration.

Production enforcement was enabled on October 10 after publishing the compatible mobile updates. See [the production release record](invitation-signup-gate-release-2026-10-10.md) for exact artifacts, completed checks and the live-provider/test-project validation limits. The steps below describe the intended rollout order; the release record describes what was actually executed.

## Server configuration

Configure these server-only Edge Function environment values, independently for production and test/demo:

- `SOCIAL_REGISTRATION_GOOGLE_AUDIENCES`: comma-separated Google client IDs accepted by the project's Supabase Google provider. Include the actual audience of native Google ID tokens, normally the configured web client ID.
- `SOCIAL_REGISTRATION_APPLE_AUDIENCES`: comma-separated Apple client IDs accepted by Supabase, including the native app bundle ID `com.happycircles.app` where applicable.

Missing audiences fail closed. Values come from trusted provider/project configuration, never from request claims. The endpoint verifies RS256 signatures with fixed first-party JWKS endpoints, issuer, audience, expiry, issued-at, verified email, and the original Apple nonce against its SHA256 claim. It never persists or logs ID/access tokens. It permits Apple relay addresses; invitations need not specify a recipient email.

Request:

```json
{
  "provider": "google",
  "idToken": "<fresh provider ID token>",
  "deliveryToken": "<invitation bearer token>"
}
```

Apple additionally sends `nonce`, the original random nonce also passed to Supabase, rather than the hashed nonce sent to Apple's native API. Success returns `{ "authorized": true, "expiresAt": "<timestamp>" }`. Proof/invitation lookup failures share a generic response. The endpoint has explicit per-client minute/hour and invitation-scope rate limits and a 40 KiB body bound. Only service role may call the reservation RPC; client-supplied email or provider subject is never trusted by the endpoint.

## Rollout order

1. Require passing full-schema Supabase migration/SQL tests in Security CI, mobile tests/typecheck/lint and release checks. The local PGlite verification covers the new migration and SQL tests against a minimal schema, not the full Auth server.
2. Apply the migration to test/demo first. Deploy `prepare-social-registration` with gateway JWT verification disabled, configure its audience values, and exercise real Google/Apple invited signup there. Keep `app_private.signup_gate_configuration.enforce_social_grants = false` and the Auth hook disabled during this additive phase.
3. Apply the same additive backend changes and endpoint configuration to production. Release the mobile change on the production update channel/runtime. Verify the native Google module, iOS URL scheme and Android signing configuration in the installed build; those native settings cannot be added by an OTA update.
4. After the invited-social mobile flow is available, enable both final gates. Set the private INSERT enforcement switch, then enable Supabase Auth's **Before User Created** Postgres hook pointing to `app_private.require_invited_signup` (`pg-functions://postgres/app_private/require_invited_signup`). Do not enable either gate before the mobile/endpoint dependencies are available.

```sql
update app_private.signup_gate_configuration
set enforce_social_grants = true
where singleton;
```

The private switch requires a database owner/management operation. It is not exposed to anon, authenticated, service-role or Auth-admin clients. The hook itself is executable only by `supabase_auth_admin` (and its owner).

5. Verify in test/demo, then production: existing Google OAuth/Apple/password login succeeds; new native and browser OAuth accounts attempted from “Tengo cuenta” are denied without inserting `auth.users`; valid QR/universal invitation signup creates a pending account; expired/revoked/claimed invitations fail; Apple hidden-email signup succeeds; a failed Auth transaction can retry its permit; and invitation activation still requires the existing profile/phone/device workflow. The hook error message carries the stable `account_invite_required` marker for the mobile copy. Do not assume Supabase propagates a custom hook error code as the Auth SDK's `error.code`.

Older app clients still use the same server gate. Their uninvited social account creation is denied once enforcement is enabled. Older invited-social flows need the released mobile update because they cannot obtain a server permit.

## State and rollback

The private grant reserves one social identity per invitation. Its expiry is the minimum of provider-token expiry, invitation expiry, delivery expiry and five minutes. A real user INSERT rechecks current invitation state under invite → delivery → grant locks, records the actual user UUID and consumes the grant inside the same transaction. Failed inserts roll back consumption. The hook runs outside that transaction and does not consume the grant or bind its provisional user UUID. When final enforcement is on, missing/replaced grants fail closed at INSERT too.

User creation does not claim or activate the account automatically. `handle_new_user`, email-confirmation claiming, phone proof, invitation claiming and activation keep their existing order. An unconsumed social reservation allows invited email fallback; a consumed reservation cannot admit another new account. As with the existing email flow, a bearer invitation can initiate email registration before its confirmation/claim, and only one account can later claim it.

For an emergency compatibility rollback, disable the Auth hook and set `enforce_social_grants = false` together. That temporarily restores the former permissive social signup behavior; keep the migration and proof endpoint installed so the corrected mobile build continues working. Never remove the private grants during a live signup. Grants disappear with their invitations; consumed grants cannot be reused merely because their short authorization window expires. Do not alter an existing user's account state or activate an invitation as part of the gate deployment.
