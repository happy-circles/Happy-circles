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

- `src/providers/session-runtime/session-controller.tsx`: split remaining action handlers into session domain hooks after profile/auth flows are stable. `src/providers/session-provider.tsx` is now only the public context facade.
- `src/features/balance/balance-lens-carousel.tsx`: split focus cards, detail panels and carousel mechanics. The public balance screen is now under its first reduction budget.
- `src/features/home/add-person-contacts-sheet-controller.ts`: split directory resolution/cache from QR and outreach actions. The public dashboard and contacts sheet screens are now under their first reduction budget.
- `src/features/invites/account-invite-entry-flow.tsx`: split token entry, remembered auth and recovery form components. The public invite entry, create account and invite preview screens are now under their first reduction budgets.
- `src/features/profile/profile-screen-runtime.tsx`: split security, notifications, account and danger-zone sections. `profile-screen.tsx` is now only the public facade.
- `src/features/activity/activity-screen-runtime.tsx`: split category tabs, pending renderer and history renderer. `activity-screen.tsx` is now only the public facade.
- `src/features/people/person-detail-screen-runtime.tsx`: split summary, action panels and timeline. `person-detail-screen.tsx` is now only the public facade.
- `src/features/register/register-flow-screen-runtime.tsx`: split person selector, amount form, category picker and submit state. `register-flow-screen.tsx` is now only the public facade.
- `src/features/onboarding/setup-account-screen-runtime.tsx`: split profile, phone, security, invite activation and avatar actions. `setup-account-screen.tsx` is now only the public facade.
- `src/components/identity-flow-runtime.tsx`: split shell, identity layer, form primitives and layout helpers. `identity-flow.tsx` is now only the shared public facade.
- `src/lib/history-cases-runtime.ts`: split case matching, labels, impact formatting and feed conversion. `history-cases.ts` remains the public facade.
- `src/features/settlements/settlement-detail-screen-runtime.tsx`: split participants, timeline, approval actions and status header.
- `src/features/transactions/transactions-screen-runtime.tsx`: split filters, list rows, empty states and route param parsing.
- `src/features/categories/categories-index-screen-runtime.tsx`: split category grouping, rows and empty states.
- `src/components/projection-forecast-card-runtime.tsx`, `src/components/pending-financial-request-card-runtime.tsx`, `src/components/transaction-event-card-runtime.tsx` and `src/components/brand-verification-lockup-runtime.tsx`: split derivations from visual primitives while keeping public component wrappers stable.
- `src/lib/live-data/builders/*-runtime.ts` and `src/lib/live-data/types-runtime.ts`: split large live-data builders by subdomain while keeping the compact builder/type entrypoints stable.

`src/mobile-architecture-boundaries.test.ts` protects these budgets and the helper purity rule.
