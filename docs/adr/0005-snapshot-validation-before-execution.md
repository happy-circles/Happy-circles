# ADR 0005: Snapshot Validation Before Execution

## Status
Accepted

## Decision
Settlement proposals store a graph snapshot hash and can execute only if the current graph still matches that hash.

## Consequences
- No stale proposal can post obsolete system movements.
- Acceptance is separated from execution safely.
- The system remains strongly consistent even when balances change concurrently.
