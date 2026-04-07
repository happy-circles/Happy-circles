# ADR 0003: Pair Net Edge Dual Model

## Status
Accepted

## Decision
The pair net edge is represented twice:

- `v_pair_net_edges_authoritative`: canonical SQL derivation from the ledger.
- `pair_net_edges_cache`: a transactable cache for efficient reads.

## Consequences
- The cache can be validated or rebuilt from the authoritative view.
- Performance optimizations do not compromise correctness.
