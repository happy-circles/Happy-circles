-- Mark existing non-OTP phone identities before proof-aware RPCs become visible.
-- The INSERT/phone-change guard from 0077 covers rows created concurrently after
-- this snapshot, so there is no unmarked deployment window.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table public.user_profiles in exclusive mode;

alter table public.user_profiles disable trigger realtime_user_profiles_changed;
alter table public.user_profiles disable trigger set_user_profiles_updated_at;

update public.user_profiles
set phone_identity_legacy_at = coalesce(phone_identity_legacy_at, created_at)
where nullif(btrim(phone_e164), '') is not null
  and phone_verified_at is null
  and phone_identity_legacy_at is null;

alter table public.user_profiles enable trigger set_user_profiles_updated_at;
alter table public.user_profiles enable trigger realtime_user_profiles_changed;
