# Auth Email Setup

Last reviewed: 2026-10-21 (America/Bogota; email delivery and production OTA).

This project uses `Supabase Auth` for email/password accounts and password recovery. The recommended production setup is:

- App handles sign-in, sign-up, and password reset screens.
- Supabase generates and validates auth recovery links.
- Resend sends the emails through your domain via Supabase custom SMTP.
- The onboarding welcome email is sent by a Supabase Edge Function through the Resend API.

## Current production gate

Email configuration verified on 2026-10-21 (America/Bogota):

- Supabase custom SMTP is configured for Auth email; confirmation/recovery email
  is separate from the welcome-email API call.
- `send-welcome-email` version 6 is deployed and `ACTIVE`, with JWT verification
  enabled. Its deployed source was read back and matches commit `256f0064`.
- `RESEND_API_KEY` is installed. The Resend key `Happy Circles welcome` has
  Sending access limited to `happy-circles.com`; its secret value is not stored
  in this repository.
- `WELCOME_EMAIL_ENABLED=true`,
  `WELCOME_EMAIL_FROM="Happy Circles <hola@happy-circles.com>"`, and
  `APP_WEB_ORIGIN=https://app.happy-circles.com` are configured in production.
- A real password recovery email reached the authorized test mailbox inbox at
  `2026-10-21T16:56:59Z`, with SPF and DKIM passing.
- A separate welcome test email was accepted by Resend at
  `2026-10-21T16:59:20Z` and reached Gmail inbox (Updates) at
  `2026-10-21T16:59:22Z` (`11:59:22` America/Bogota), with SPF and DKIM passing
  for `happy-circles.com`; it was not in Spam. The test sent the exact deployed
  HTML directly through Resend. It does not verify the onboarding trigger: the
  existing test account was already marked handled, and that idempotency state
  was preserved.
- The original email arrived in Gmail on iPhone, but the user reported that
  neither keyboard code suggestion nor copying the code worked. Confirmation
  and recovery templates were updated in production at
  `2026-10-21T17:08:39Z` to show the token as one continuous text value instead
  of eight table cells. The hosted HTML was read back and matched the local
  templates; 8-digit OTP length and `{{ .ConfirmationURL }}` were preserved.
- A recovery retry using the updated template was accepted at
  `2026-10-21T17:08:49.726Z` and reached Gmail inbox at
  `2026-10-21T17:08:52Z` (`12:08:52` America/Bogota), with SPF and DKIM passing.
  The received MIME includes plain text and HTML; the HTML has one continuous
  8-digit text node and no single-digit table cells. Copying on the iPhone
  remains pending verification. AutoFill in Gmail on iPhone is not guaranteed
  by this change.

The last plan check on 2026-08-14 found Supabase Auth Leaked Password Protection
(HIBP) disabled because the project plan did not include it. Treat it as a
plan-upgrade hardening item, separate from email activation.

## What the app now supports

- Email/password sign-in
- Email/password registration
- Password reset request from the sign-in screen
- Branded confirmation and password recovery email templates
- Branded welcome email after the required setup is complete and the account is active
- Universal-link recovery into `https://app.happy-circles.com/reset-password`
- Manual password recovery with the 8-digit email code when the link does not open the app
- Setting a new password inside the mobile app after opening the recovery email

Relevant files:

- `apps/mobile/src/providers/session-provider.tsx`
- `apps/mobile/src/features/invites/account-invite-entry-screen.tsx`
- `apps/mobile/src/features/auth/reset-password-screen.tsx`
- `apps/mobile/app/reset-password.tsx`
- `supabase/templates/auth/confirmation.html`
- `supabase/templates/auth/recovery.html`
- `supabase/functions/send-welcome-email/index.ts`

## Recommended production configuration

### 1. Domain

Use your production app domain for public links and brand consistency, for example:

- `app.happy-circles.com`

In Expo and app config this should stay aligned with:

- `EXPO_PUBLIC_APP_WEB_ORIGIN=https://app.happy-circles.com`

### 2. Resend

In Resend:

1. Add your sending domain.
2. Create the DNS records Resend asks for.
3. Verify the domain.
4. Create an API key.
5. Use a sender such as `Hola <hola@happy-circles.com>` or `Auth <auth@happy-circles.com>`.

### 3. Supabase Auth SMTP

In Supabase Dashboard:

1. Go to `Authentication -> Providers -> Email`.
2. Disable the default Supabase email sender for production.
3. Enable custom SMTP.
4. Set the SMTP host, port, username, and password using the SMTP credentials provided by Resend.
5. Set the sender email to the same verified domain you configured in Resend.

Important:

- The app does not call Resend directly for password recovery.
- Supabase must send those emails so the recovery tokens remain valid for Supabase Auth.

## Redirect URLs to allow in Supabase

In `Authentication -> URL Configuration`, allow at least these redirects:

- `https://app.happy-circles.com/reset-password`
- `https://app.happy-circles.com/setup-account`
- `https://app.happy-circles.com/join`
- `https://app.happy-circles.com/join/*`
- `https://app.happy-circles.com/invite/*`
- `happycircles://join`
- `happycircles://reset-password`
- `happycircles://setup-account`

If you still test with Expo development URLs, keep those temporary development redirects too.

## Email templates

The repo now includes branded Supabase Auth templates:

- Confirmation: `supabase/templates/auth/confirmation.html`
- Recovery: `supabase/templates/auth/recovery.html`

They use the Happy Circles palette from the app (`brandNavy`, `brandGreen`, `brandCoral`, soft surfaces) and keep both auth paths available:

- `{{ .ConfirmationURL }}` for the primary button.
- `{{ .Token }}` for the manual 8-digit code fallback.

Keep `{{ .Token }}` as one continuous text value, without per-digit table cells
or inserted spaces. Both templates introduce it with
`Tu código de verificación es:`, allow text selection with `user-select: all`,
and include a copying hint. This change applies to newly sent emails and does
not require a native app update.

The deep link and the manual code must live in the same email body. Do not configure a separate "link email" and "code email" for the same auth event. If two emails arrive for one sign-up or one recovery request, check for an extra hosted Supabase template/trigger or an accidental resend action.

Local Supabase is configured in `supabase/config.toml`:

- `auth.email.template.confirmation`
- `auth.email.template.recovery`
- `auth.email.otp_length = 8`

For hosted Supabase projects, copy the HTML into `Authentication -> Emails -> Templates` and keep these subjects:

- Confirmation subject: `Confirma tu cuenta de Happy Circles`
- Recovery subject: `Restablece tu clave de Happy Circles`

Do not replace Supabase's generated confirmation or recovery URL with a hardcoded app URL. Supabase must keep generating those action links so the Auth tokens remain valid.

The invite template is intentionally unchanged.

## Welcome email

The welcome email is not a Supabase Auth template. It is sent by:

- `supabase/functions/send-welcome-email/index.ts`

The app invokes it from `apps/mobile/src/providers/session-provider.tsx` only when all of these are true:

- The user is signed in.
- The email is confirmed.
- Required profile requirements are complete: name and phone; the profile photo
  is optional.
- The device is trusted.
- The account access state is `active`.

The delivery is guarded by database columns on `public.user_profiles`:

- `onboarding_completed_at`
- `welcome_email_queued_at`
- `welcome_email_sent_at`
- `welcome_email_last_error`

`welcome_email_sent_at` makes the send idempotent. The migration also marks accounts that were already complete and active before this feature as already handled, so deploying this should not send a welcome blast to existing users.

Required Edge Function secrets:

- `RESEND_API_KEY` - required only for the optional production welcome email
- `APP_WEB_ORIGIN=https://app.happy-circles.com`
- `WELCOME_EMAIL_FROM="Happy Circles <hola@happy-circles.com>"`
- `WELCOME_EMAIL_REPLY_TO=` optional
- `WELCOME_EMAIL_ENABLED=true`

## Email OTP length and iPhone AutoFill

The app UI expects 8-digit email codes for confirmation and recovery. Keep Supabase Email OTP length aligned with that value in Auth settings.

Resend transports the Auth email; Supabase generates its code. There is no
additional Resend setting in this flow that can force the iPhone keyboard to
suggest it. [Apple's iOS 17 documentation](https://support.apple.com/es-co/118723)
describes AutoFill in Safari for codes received in Apple Mail. That does not
establish support for the Gmail app on iPhone. Validate code selection/copying
and keyboard suggestion separately in the actual email app and device; a
continuous token improves the fallback without proving AutoFill works.

The public App Store version is `1.0.3`, released on 2026-10-08. Its source
commit `3a6b8d15` already includes `oneTimeCode`; that hint was not added by
today's email change. The `OtpCodeInput` update expands the native
input from a `1x1` transparent control (`opacity: 0`) to the full code row at
56 px height, normal opacity and transparent text, to expose the native Paste
menu. Mobile typecheck, file ESLint, browser paste of eight digits and input
hit testing at five points passed. This input change was published to Android
and iOS on the `production` channel from `256f0064`, with runtime
`hc-sdk54-20260928-1`. The served manifests and bundle hashes were verified for
both platforms. Existing compatible `1.0.3` builds receive it through OTA;
no new store binary was created. See the [release receipt](otp-email-release-2026-10-21.md).
The email HTML correction requires no app update. Copying/pasting on the
physical iPhone and Gmail keyboard suggestion still await the user's test.

## Leaked password protection

On Supabase Pro or above, enable Leaked Password Protection so password creation
and reset can reject credentials found in Have I Been Pwned. The current plan
does not expose that setting. This is an Auth security control, not a Resend
setting: adding `RESEND_API_KEY` does not enable it, and enabling HIBP does not
validate email delivery.

## Mobile deep link notes

The app uses:

- Scheme: `happycircles`
- Recovery route: `/reset-password`
- Production app-link origin: `https://app.happy-circles.com`

That means `supabase.auth.resetPasswordForEmail()` now points users back into:

- `https://app.happy-circles.com/reset-password`

For production email auth flows, the app uses HTTPS Universal Links / Android App Links so iOS and Android share the same redirect URLs. Development builds can set `EXPO_PUBLIC_AUTH_REDIRECT_MODE=scheme` to keep using `happycircles://...`.

## Verification checklist

1. Request password reset from the sign-in screen.
2. Confirm the email arrives from your domain through Resend.
3. Open the link on a phone with the app installed.
4. Confirm the app opens on the reset-password screen.
5. Request another reset and verify the 8-digit code manually from the recovery screen.
6. Confirm the app opens on the reset-password screen after code verification.
7. Set a new password.
8. Sign out and sign back in with the new password.
9. Complete onboarding with a fresh release-test account and confirm exactly one
   welcome email is sent, with `welcome_email_sent_at` recorded.
10. After a future upgrade to Supabase Pro, try a known compromised test
    password and confirm HIBP rejects it during the supported flow.

## Failure modes to check first

- SMTP not configured in Supabase
- Sender domain not verified in Resend
- Redirect URL missing from Supabase allow-list
- Opening the email link on a device that does not have the app or cannot resolve the custom scheme
- Using Expo Go instead of a proper development build for auth-link testing
- Missing `app.happy-circles.com` DNS, Apple association file, or Android asset links
- Missing `RESEND_API_KEY` for the separate welcome-email Edge Function
- Leaked Password Protection (HIBP) disabled in Supabase Auth
