# Analytics Data Model

Happy Circles keeps product analytics separate from `audit_events`.

`audit_events` is the domain/security audit trail. Product analytics captures minimized usage signals for retention, funnels, and business dashboards.

| Table                           | What it stores                                                                                                   | Main questions answered                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `analytics_event_catalog`       | The allowlist of product event names and their descriptions.                                                     | Which events are valid and what each one means.                                                    |
| `app_sessions`                  | One authenticated app session/open with platform, app version, hashed device id, start, last seen, and end time. | DAU/WAU/MAU, last activity, approximate session duration, app version adoption.                    |
| `product_events`                | Append-only product events tied to a user and session.                                                           | Funnels, screen views, started/completed actions, abandoned flows.                                 |
| `analytics_daily_user_facts`    | Daily per-user rollups derived from raw events.                                                                  | Retention cohorts, active users by day, frequency of use.                                          |
| `analytics_daily_product_facts` | Daily global rollups from product events and domain tables.                                                      | New users, active users, invites, relationships, accepted requests, ledger volume, circles closed. |

## Privacy Rules

- Store only authenticated usage in v1.
- Do not store raw device ids; use `device_id_hash`.
- Do not store names, phone numbers, emails, invite tokens, or free-form user text in analytics metadata.
- Metadata is allowlisted and scalar-only through `sanitize_product_event_metadata`.
- Clients do not write analytics tables directly; Edge Functions call service-role RPCs.

## Metric Sources

| Metric                                   | Source                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Retention and active usage               | `product_events`, `app_sessions`, `analytics_daily_user_facts`                                                                |
| Invite funnel                            | `friendship_invites`, `friendship_invite_deliveries`, `account_invites`, `account_invite_deliveries`, selected product events |
| Transactions created/accepted/rejected   | `financial_requests`                                                                                                          |
| Confirmed financial truth and volume     | `ledger_transactions`, `ledger_entries`                                                                                       |
| Happy Circles proposed/approved/executed | `settlement_proposals`, `settlement_proposal_participants`, `settlement_executions`                                           |

Run `refresh_analytics_daily_facts(p_day date)` to rebuild daily facts idempotently for one UTC day.
