-- Install the confirmation trigger in an auth-only transaction. Taking the
-- strongest lock up front avoids a lock upgrade after any invite row is held.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table auth.users in access exclusive mode;

drop trigger if exists on_auth_user_email_confirmed_claim_invite on auth.users;
create trigger on_auth_user_email_confirmed_claim_invite
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.claim_account_invite_after_email_confirmation();
