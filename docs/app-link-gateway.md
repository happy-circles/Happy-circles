# App Link Gateway

Happy Circles uses two public web surfaces:

- `https://app.happy-circles.com`: current public landing, legal/support pages, store buttons, and operational app links that should open the native app.
- `https://www.happy-circles.com`: optional marketing domain once DNS is attached.

The `app.happy-circles.com` routes are served by the landing Next.js project, but they behave as a gateway:

- `/join`
- `/join/{token}`
- `/invite/{token}`
- `/reset-password`
- `/setup-account`

Each route renders a minimal fallback screen and attempts to open the native app through the `happycircles` scheme. If iOS Universal Links or Android App Links are configured and the app is installed, the OS should open the app before the browser fallback renders.

## Native association files

The landing app serves:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Required production environment variables:

- `APPLE_TEAM_ID`
- `IOS_BUNDLE_IDENTIFIER=com.happycircles.app`
- `ANDROID_PACKAGE_NAME=com.happycircles.app`
- `ANDROID_SHA256_CERT_FINGERPRINTS`

If `APPLE_TEAM_ID` or `ANDROID_SHA256_CERT_FINGERPRINTS` are missing, the association route intentionally returns no app association instead of publishing placeholder values.

## Auth redirects

Production email auth redirects should use HTTPS app links:

- `https://app.happy-circles.com/reset-password`
- `https://app.happy-circles.com/setup-account?step=profile`

Password recovery emails should also display Supabase's `{{ .Token }}`. If the app link does not open the native app, users can paste that 8-digit recovery code in the app and continue to the same reset-password screen.

The mobile app defaults to:

- `EXPO_PUBLIC_APP_WEB_ORIGIN=https://app.happy-circles.com`
- `EXPO_PUBLIC_AUTH_REDIRECT_MODE=universal-link`

For local/dev builds that cannot use Universal Links, set:

- `EXPO_PUBLIC_AUTH_REDIRECT_MODE=scheme`

That switches email auth redirects back to `happycircles://...`.

## Supabase allow-list

In Supabase Auth URL Configuration, allow:

- `https://app.happy-circles.com/reset-password`
- `https://app.happy-circles.com/setup-account`
- `https://app.happy-circles.com/join`
- `https://app.happy-circles.com/join/*`
- `https://app.happy-circles.com/invite/*`
- `happycircles://join`
- `happycircles://reset-password`
- `happycircles://setup-account`

Keep the `happycircles://...` entries while development builds or older app versions still rely on scheme redirects.

## External setup still required

- Keep `app.happy-circles.com` attached to the Vercel project; add `www.happy-circles.com` only if a separate marketing domain is needed.
- Add the Apple Team ID to Vercel.
- Add Android release SHA-256 certificate fingerprints to Vercel.
- Rebuild and ship iOS/Android after changing associated domains or Android intent filters.
- Configure Supabase SMTP/Resend and update Auth redirect allow-list.
