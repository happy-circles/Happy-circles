-- Materialize legacy claims under one canonical, bounded data lock. New function
-- bodies and the earlier phone-identity backfill have already committed.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

lock table public.account_invites in exclusive mode;
lock table public.account_invite_deliveries in exclusive mode;
lock table public.user_profiles in exclusive mode;

-- These are internal repairs. Suppress snapshot fan-out and preserve the
-- user-visible profile updated_at timestamp while they run.
alter table public.user_profiles disable trigger realtime_user_profiles_changed;
alter table public.user_profiles disable trigger set_user_profiles_updated_at;

select app_private.backfill_legacy_account_invite_claims();

alter table public.user_profiles enable trigger set_user_profiles_updated_at;
alter table public.user_profiles enable trigger realtime_user_profiles_changed;
