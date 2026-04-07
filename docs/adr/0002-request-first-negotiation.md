# ADR 0002: Request-First Negotiation

## Status
Accepted

## Decision
User-created debts and manual settlements begin as `financial_requests`. They affect nothing financially until accepted.

## Consequences
- Rejections and counteroffers do not touch the ledger.
- The product preserves mutual confirmation as a hard rule.
- The UI can present negotiation clearly without leaking unconfirmed state into balances.
