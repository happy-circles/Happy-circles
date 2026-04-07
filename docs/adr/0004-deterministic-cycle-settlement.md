# ADR 0004: Deterministic Cycle Settlement

## Status
Accepted

## Decision
Cycle settlement proposals are computed from the pair net graph using a deterministic algorithm over strongly connected components.

## Consequences
- Proposal generation is explainable and testable.
- Repeated runs over the same graph produce the same proposals.
- The MVP favors determinism and clarity over global optimality.
