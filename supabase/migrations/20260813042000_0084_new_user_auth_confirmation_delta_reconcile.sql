-- Cover confirmations that landed between the initial bridge reconciliation and
-- the trigger-only commit. Future confirmations are already protected by 0083.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table auth.users in share row exclusive mode;

select app_private.reconcile_confirmed_account_invites();
