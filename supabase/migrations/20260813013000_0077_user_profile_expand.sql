-- Expand profile state in a short, single-hot-table transaction. Foreign keys
-- are deliberately deferred to Phase B, after client rollout and index
-- creation, so this compatibility migration does not lock the live invite and
-- profile tables together.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.user_profiles
  add column if not exists pending_account_invite_id uuid,
  add column if not exists pending_account_invite_delivery_id uuid,
  add column if not exists account_invite_claimed_at timestamptz,
  add column if not exists account_invite_claim_expires_at timestamptz,
  add column if not exists welcome_email_lease_id uuid,
  add column if not exists phone_identity_legacy_at timestamptz;

-- Column ACLs are applied in the same transaction as the ADD COLUMN so related
-- users covered by profile RLS never get a window to read internal claim/lease
-- state. Installed clients keep the complete pre-expand projection.
revoke select on table public.user_profiles from authenticated;
grant select (
  id,
  email,
  display_name,
  avatar_path,
  account_access_state,
  invited_by_user_id,
  activated_via_account_invite_id,
  activated_at,
  phone_country_iso2,
  phone_country_calling_code,
  phone_national_number,
  phone_e164,
  phone_verified_at,
  created_at,
  updated_at,
  deletion_requested_at,
  deleted_at,
  onboarding_completed_at,
  welcome_email_queued_at,
  welcome_email_sent_at,
  welcome_email_last_error
) on table public.user_profiles to authenticated;

create or replace function public.clear_phone_verification_on_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if nullif(btrim(new.phone_e164), '') is null then
      new.phone_verified_at := null;
      new.phone_identity_legacy_at := null;
    elsif new.phone_verified_at is null then
      new.phone_identity_legacy_at := coalesce(
        new.phone_identity_legacy_at,
        timezone('utc', now())
      );
    else
      new.phone_identity_legacy_at := null;
    end if;
  elsif new.phone_e164 is distinct from old.phone_e164 then
    if nullif(btrim(new.phone_e164), '') is null then
      new.phone_verified_at := null;
      new.phone_identity_legacy_at := null;
    elsif current_user in ('authenticated', 'anon')
      or new.phone_verified_at is null
      or new.phone_verified_at is not distinct from old.phone_verified_at then
      new.phone_verified_at := null;
      new.phone_identity_legacy_at := timezone('utc', now());
    else
      new.phone_identity_legacy_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_phone_verification_on_change()
  from public, anon, authenticated;

drop trigger if exists clear_phone_verification_on_change on public.user_profiles;
create trigger clear_phone_verification_on_change
before update of phone_e164 on public.user_profiles
for each row execute function public.clear_phone_verification_on_change();

drop trigger if exists initialize_phone_identity_proof on public.user_profiles;
create trigger initialize_phone_identity_proof
before insert on public.user_profiles
for each row execute function public.clear_phone_verification_on_change();

revoke update (
  pending_account_invite_id,
  pending_account_invite_delivery_id,
  account_invite_claimed_at,
  account_invite_claim_expires_at,
  welcome_email_lease_id,
  phone_verified_at,
  phone_identity_legacy_at
) on table public.user_profiles from authenticated;
