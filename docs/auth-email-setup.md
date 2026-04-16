# Auth Email Setup

This project uses `Supabase Auth` for email/password accounts and password recovery. The recommended production setup is:

- App handles sign-in, sign-up, and password reset screens.
- Supabase generates and validates auth recovery links.
- Resend sends the emails through your domain via Supabase custom SMTP.

## What the app now supports

- Email/password sign-in
- Email/password registration
- Password reset request from the sign-in screen
- Deep-link recovery into `happycircles://reset-password`
- Setting a new password inside the mobile app after opening the recovery email

Relevant files:

- `apps/mobile/src/providers/session-provider.tsx`
- `apps/mobile/src/features/auth/sign-in-screen.tsx`
- `apps/mobile/src/features/auth/reset-password-screen.tsx`
- `apps/mobile/app/reset-password.tsx`

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

- `happycircles://reset-password`
- `happycircles://home`
- `https://app.happy-circles.com/reset-password`
- `https://app.happy-circles.com/home`

If you still test with Expo development URLs, keep those temporary development redirects too.

## Email templates

In Supabase email templates:

- Update the recovery template branding and copy.
- Keep the recovery action using Supabase's generated action URL.
- Do not hardcode a raw app URL in the email body if Supabase already injects the action link.

Suggested recovery copy:

- Subject: `Restablece tu clave de Happy Circles`
- From: `Happy Circles <auth@happy-circles.com>`

## Mobile deep link notes

The app uses:

- Scheme: `happycircles`
- Recovery route: `/reset-password`

That means `supabase.auth.resetPasswordForEmail()` now points users back into:

- `happycircles://reset-password`

For native email auth flows, the app now forces the stable custom scheme instead of relying on Expo runtime URLs. That keeps the Supabase allow-list fixed for password recovery and email confirmation.

## Verification checklist

1. Request password reset from the sign-in screen.
2. Confirm the email arrives from your domain through Resend.
3. Open the link on a phone with the app installed.
4. Confirm the app opens on the reset-password screen.
5. Set a new password.
6. Sign out and sign back in with the new password.

## Failure modes to check first

- SMTP not configured in Supabase
- Sender domain not verified in Resend
- Redirect URL missing from Supabase allow-list
- Opening the email link on a device that does not have the app or cannot resolve the custom scheme
- Using Expo Go instead of a proper development build for auth-link testing
