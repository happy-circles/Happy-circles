-- Expand account-invite delivery claim state in its own short transaction.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.account_invite_deliveries
  add column if not exists claim_expires_at timestamptz;
