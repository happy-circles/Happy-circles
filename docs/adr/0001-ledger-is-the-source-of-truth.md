# ADR 0001: Ledger Is The Source Of Truth

## Status
Accepted

## Decision
Financial truth lives only in `ledger_transactions` and `ledger_entries`.

## Consequences
- Balances, bilateral debt, and cycle opportunities are derived.
- History cannot be overwritten or deleted.
- Every correction is represented as a new movement.
