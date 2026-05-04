# UX and Copy Standards

Happy Circles no longer uses Figma as a product source of truth. Product polish should come from the running app, operational docs, and the shared mobile theme.

## Sources of Truth

- Visual tokens: `apps/mobile/src/lib/theme.ts`.
- Mobile flows: `apps/mobile/src/features` and Expo Router routes under `apps/mobile/app`.
- Web gateway and landing flows: `apps/landing/app` and `docs/app-link-gateway.md`.
- Operational behavior: existing docs under `docs` and Supabase migrations/functions.

## Copy Rules

- User-facing Spanish copy uses accents and natural phrasing.
- Avoid internal labels such as fallback names, implementation roles, table names, or debug state.
- Button labels describe the next action, not the implementation step.
- Loading labels should name the action in progress, for example `Preparando invitación...`.
- Disabled actions should pair with nearby helper text that explains what is missing.

## State Checklist

- Idle: the user can understand the next step without reading internal terminology.
- Loading: the active control says what is happening and prevents duplicate submission.
- Disabled: required input or permission state is clear.
- Empty: explain what is missing and the next useful action.
- Error: describe the recovery path in user language.
- Permission blocked: provide a settings or fallback path when available.

## Review Cadence

When touching a product flow, review copy, disabled/loading states, empty/error states, and alignment with `theme.ts` in the same change. Larger file refactors should stay opportunistic and only happen when the touched flow needs them.
