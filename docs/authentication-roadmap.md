# Authentication Roadmap

This document captures the current auth state in the mobile app, the missing external configuration, and the recommended path to support multiple login methods without creating duplicate users.

## Current state in code

The mobile app already has these auth flows wired in code:

- Email + password sign-in
- Email + password registration
- Google sign-in via Supabase OAuth
- Apple sign-in for iOS via native Apple Authentication and `signInWithIdToken()`
- Deep-link callback handling for Supabase auth redirects
- A unified auth screen with shared fields for sign-in and registration

Relevant files:

- `apps/mobile/src/providers/session-provider.tsx`
- `apps/mobile/src/features/auth/sign-in-screen.tsx`
- `apps/mobile/app.config.ts`

Important limitation:

- Social login cannot be validated correctly in Expo Go because the app needs its own registered deep-link scheme. Use a development build for end-to-end testing.

## What is still missing

The code is ahead of the operational setup. These pieces are still pending:

1. Define mobile identifiers in Expo config

- Add `ios.bundleIdentifier`
- Add `android.package`

2. Finish external provider configuration

- Google Cloud OAuth client configured and connected to Supabase
- Apple Developer setup configured and connected to Supabase
- Supabase redirect URLs kept aligned with the app scheme

3. Add development-build support for device testing

- Install `expo-dev-client`
- Add `eas.json`
- Build a development client for iOS and Android when needed

4. Add identity management UX inside the app

- Show which methods are already linked to the current user
- Let a signed-in user link Google
- Let a signed-in user link Apple
- Let a signed-in user add or update email/password
- Let a signed-in user add or update phone

5. Add a post-auth completion flow

- If a social user has no phone, ask for phone
- If a social user has no display name, ask for display name
- Do not block first access longer than necessary

## Recommended identity model

The correct mental model is:

- One person = one Supabase user
- That user can have many identities
- Identities can be email, phone, Google, Apple, or anonymous

Supabase supports:

- Automatic linking when the same verified email appears across identities
- Manual linking for cases where emails differ or where the user wants to add another provider later

Recommended product rule:

- Keep one canonical account per person
- Let users attach many login methods to that same account
- Prefer linking over creating a second account

## Duplicate prevention strategy

This app should defend against duplicates at three levels.

### 1. Auth-level deduplication

Use Supabase identity linking.

- Same verified email across Google, Apple, and email/password should resolve to the same user via automatic linking
- Manual linking should be enabled in Supabase and exposed in app settings for edge cases

Reference:

- [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)

### 2. Profile-level deduplication

The app already stores normalized phone values in `public.user_profiles`, and the schema already has a unique index on `phone_e164`.

That is good and should remain.

Why it matters:

- It prevents two profiles from claiming the same phone number
- It gives the app a strong secondary identity for social users
- It helps future phone-based auth and contact matching

### 3. UX-level deduplication

Even with backend protections, the UI must not let identity drift happen silently.

Recommended UX rules:

- If a user signs in with Google or Apple and the profile has no phone, ask for phone
- If linking a new identity fails because it belongs to another account, show a clear "this method is already linked elsewhere" message
- Add a "Linked methods" section in settings
- Let users explicitly connect and disconnect providers

## Recommended auth roadmap

### Phase 1. Stable baseline

Target:

- Email + password
- Google
- Apple on iOS

Required work:

- Finish external provider setup
- Add development-build support
- Confirm Google redirect works on device
- Confirm Apple works on iPhone

### Phase 2. Account linking

Target:

- One account can hold multiple identities safely

Required work:

- Enable manual linking in Supabase
- Add "Linked methods" settings UI
- Add `linkIdentity()` flows for Google and Apple
- Add email/password attachment flow to social accounts

Reference:

- [Supabase linkIdentity()](https://supabase.com/docs/reference/javascript/auth-linkidentity)

### Phase 3. Profile completion

Target:

- Every permanent user ends up with enough profile data for the app

Required work:

- Collect missing display name
- Collect and verify phone when required
- Keep social sign-in fast, then complete profile in a second step

### Phase 4. Optional stronger auth

Target:

- Higher trust for financial actions

Options:

- TOTP MFA
- Phone MFA
- Device trust plus biometric unlock

Reference:

- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)

## What about phone auth

Phone auth is viable, but it changes product and operational complexity.

Supabase supports phone login with OTP, but it requires an SMS provider such as Twilio, MessageBird, or Vonage.

References:

- [Supabase Phone Login](https://supabase.com/docs/guides/auth/phone-login)
- [Supabase Auth overview](https://supabase.com/docs/guides/auth)

### Option A. Phone as a linked identity

This is the best next step if phone matters to the product.

How it works:

- The user signs in with email, Google, or Apple
- The app asks them to verify and link their phone
- The same account then has phone as another identity

Why this is good:

- Strong deduplication via `phone_e164`
- Better recovery path across devices
- Good fit for a finance app that already models contacts by phone

### Option B. Phone as a primary login method

How it works:

- The user signs in with SMS OTP every time

Pros:

- No password to remember
- Clear "one phone, one identity" feel

Cons:

- SMS delivery has cost
- SMS OTP is weaker than many people assume
- Number recycling and carrier issues are real
- Adds operational work around abuse, rate limits, and CAPTCHA

Recommendation:

- Use phone as a linked identity first
- Only make it primary if the product really benefits from SMS-first onboarding

## What about "the user only exists on that phone"

There are two very different ideas here.

### Option A. Anonymous or device-only account

Supabase supports anonymous sign-ins.

That would let the app create a real authenticated user without email, phone, or social login.

References:

- [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase Users](https://supabase.com/docs/guides/auth/users)

Pros:

- Very low friction
- Feels tied to the current install or current device

Cons:

- If the user signs out, reinstalls, changes phone, or clears storage, the account can be lost
- Anonymous users still hit your database and require abuse controls
- It is a poor primary identity model for a finance app

Recommendation:

- Do not use anonymous auth as the main account type for Happy Circles
- Only use it if you want a temporary pre-signup state and later upgrade it to a permanent account

### Option B. Permanent user plus device trust

This is usually what people actually want.

How it works:

- The person has a normal permanent account
- The app remembers trusted devices
- Sensitive actions can require biometric unlock or MFA

Why this is better:

- The account survives phone changes
- The app can still feel strongly tied to the current device
- It is safer for a debt or finance product

Recommendation:

- Prefer permanent identity plus device trust over true device-only identity

## Recommended product decision

For this app, the safest and cleanest path is:

1. Keep email + password
2. Add Google
3. Add Apple on iOS
4. Require or strongly encourage phone linking after first sign-in
5. Add manual identity linking in settings
6. Avoid anonymous/device-only as the main auth model

That gives:

- cross-device recovery
- fewer duplicate accounts
- better contact matching
- a cleaner path to stronger verification later

## Concrete TODO list

### In code

- Add `ios.bundleIdentifier` and `android.package` to Expo config
- Install `expo-dev-client`
- Add `eas.json`
- Add linked-identities settings UI
- Add `linkIdentity()` flows
- Add post-social profile completion screen
- Add phone verification flow if phone becomes required

### In Supabase

- Keep Google provider enabled
- Keep Apple provider enabled when ready
- Keep redirect allow-list aligned with `happycircles://**`
- Enable manual linking
- Review rate limits before enabling phone OTP or anonymous sign-ins

### In operations

- Google Cloud OAuth setup
- Apple Developer setup
- Development builds for social-auth testing
- SMS provider setup only if phone OTP becomes a product requirement
