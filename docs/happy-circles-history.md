# Happy Circles history and KPIs

Happy Circles uses one product rule across the app:

> History shows every Circle event. KPIs only count real ledger facts.

## Concepts

- Proposal: a settlement proposal that people can approve or reject.
- Version: a proposal can replace a previous proposal when balances change.
- Lifecycle event: a rejected, expired, canceled, or stale proposal. It explains what happened, but it did not move money in the ledger.
- Ledger movement: a posted settlement row with category `cycle`. This is the real balance-changing event.
- Happy faces: rewards from `happy_circle_score_events`. They are not derived from transaction amounts.

## Activity kinds

The mobile app classifies Circle activity in `apps/mobile/src/lib/cycle-activity.ts`:

- `active_proposal`: pending, waiting for approvals, or ready to complete.
- `lifecycle_rejected`: rejected, expired, or canceled proposal.
- `lifecycle_replaced`: stale proposal replaced by a newer version.
- `ledger_posted`: posted or executed settlement movement.
- `unknown_cycle`: legacy fallback when the row is Circle-like but cannot be proven.

## Grouping

Circle history groups by `happyCircleCaseId` when present. Legacy rows fall back to `originSettlementProposalId`.

This lets one case show stale versions and ledger movements in one timeline without counting each row as a separate Circle.

## KPI truth rules

- Closed Circles: one per group with at least one `ledger_posted` row.
- Crossed money: the personal visible ledger amount from `ledger_posted` groups only.
- Saved transactions: only from the executed settlement detail when available.
- Happy faces: only from the score DTO.

Rejected, expired, canceled, stale, and mutated proposal versions never count as closed Circles, crossed money, or saved transactions.

## Presentation

Lifecycle-only rows stay visible for transparency. Their amounts are shown struck through and use copy such as `No cambio el saldo` or `Version reemplazada`.

Posted ledger rows show normal amounts and can be used by Circles, Transactions, People, and Home as real history.
