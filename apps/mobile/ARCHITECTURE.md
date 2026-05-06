# Mobile Architecture Rules

This app keeps product behavior in screens, but moves reusable decisions into small pure modules.

## Boundaries

- Public imports stay stable. Feature code should keep importing live data from `@/lib/live-data` and session from `@/providers/session-provider`.
- Providers are orchestrators. Storage, auth callback parsing, status derivation, trust checks and setup state belong in `src/providers/session/`.
- Screens compose data, local state and visual components. Sorting, route parsing, copy selection, amount formatting and target derivation belong in `*-helpers.ts` modules beside the screen.
- Helper modules must stay pure: no React, React Native, React Query, Supabase clients, providers or hooks.
- Live-data builders must stay pure and under `src/lib/live-data/builders/`; fetchers and mutations are separate runtime boundaries.
- Do not add new public imports from internal live-data or session subfolders unless a module is deliberately promoted.

## Large File Baseline

The current large files are accepted as the post-refactor baseline because each now has extracted helpers and targeted tests. Future work should reduce these files, not grow them.

Primary candidates for later mechanical splits:

- `src/providers/session-provider.tsx`: move remaining action handlers into session domain hooks after profile/auth flows are stable.
- `src/features/balance/balance-overview-screen.tsx`: split carousel, focus panels and empty states into local components.
- `src/features/home/dashboard-screen.tsx`: split dashboard sections and notification marking hook.
- `src/features/home/add-person-contacts-sheet.tsx`: split rows, permission state and invite action footer.
- `src/features/invites/account-invite-entry-screen.tsx`: split token entry, remembered auth and recovery form components.
- `src/features/profile/profile-screen.tsx`: split security, notifications, account and danger-zone sections.
- `src/features/activity/activity-screen.tsx`: split category tabs, pending renderer and history renderer.
- `src/features/people/person-detail-screen.tsx`: split summary, action panels and timeline.

`src/mobile-architecture-boundaries.test.ts` protects these budgets and the helper purity rule.
