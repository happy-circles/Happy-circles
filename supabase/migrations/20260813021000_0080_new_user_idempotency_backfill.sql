-- Backfill the three new-user operations after their new function bodies
-- are visible. Keeping this separate avoids holding shared financial keys while
-- invite/profile data is repaired.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

update public.idempotency_keys
set completed_at = coalesce(completed_at, created_at),
    expires_at = coalesce(expires_at, created_at + interval '30 days')
where operation_name in (
    'create_account_invite',
    'activate_account_from_invite',
    'claim_external_friendship_invite'
  )
  and response_json is not null;

update public.idempotency_keys
set expires_at = coalesce(expires_at, created_at + interval '7 days')
where operation_name in (
    'create_account_invite',
    'activate_account_from_invite',
    'claim_external_friendship_invite'
  )
  and response_json is null;
