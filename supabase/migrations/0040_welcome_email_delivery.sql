alter table public.user_profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists welcome_email_queued_at timestamptz,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists welcome_email_last_error text;

comment on column public.user_profiles.onboarding_completed_at is
  'First time the user had the required account setup completed.';
comment on column public.user_profiles.welcome_email_queued_at is
  'Transient claim timestamp used to avoid duplicate welcome email sends.';
comment on column public.user_profiles.welcome_email_sent_at is
  'Timestamp of the successful post-onboarding welcome email.';
comment on column public.user_profiles.welcome_email_last_error is
  'Last provider error captured while attempting the welcome email.';

update public.user_profiles profile
set onboarding_completed_at = coalesce(profile.onboarding_completed_at, timezone('utc', now())),
    welcome_email_sent_at = coalesce(profile.welcome_email_sent_at, timezone('utc', now())),
    welcome_email_queued_at = null,
    welcome_email_last_error = null
from auth.users auth_user
where profile.id = auth_user.id
  and profile.account_access_state = 'active'
  and auth_user.email_confirmed_at is not null
  and length(btrim(profile.display_name)) >= 3
  and position('@' in btrim(profile.display_name)) = 0
  and nullif(btrim(profile.phone_e164), '') is not null
  and nullif(btrim(profile.avatar_path), '') is not null
  and profile.welcome_email_sent_at is null;

create or replace function public.claim_welcome_email_delivery(p_actor_user_id uuid)
returns table(email text, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_stale_before timestamptz := v_now - interval '10 minutes';
begin
  perform public.assert_request_actor(p_actor_user_id);

  return query
  update public.user_profiles profile
  set onboarding_completed_at = coalesce(profile.onboarding_completed_at, v_now),
      welcome_email_queued_at = v_now,
      welcome_email_last_error = null
  where profile.id = p_actor_user_id
    and profile.account_access_state = 'active'
    and profile.welcome_email_sent_at is null
    and (
      profile.welcome_email_queued_at is null
      or profile.welcome_email_queued_at < v_stale_before
    )
    and length(btrim(profile.display_name)) >= 3
    and position('@' in btrim(profile.display_name)) = 0
    and nullif(btrim(profile.email), '') is not null
    and nullif(btrim(profile.phone_e164), '') is not null
    and nullif(btrim(profile.avatar_path), '') is not null
  returning profile.email, profile.display_name;
end;
$$;

revoke all on function public.claim_welcome_email_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_welcome_email_delivery(uuid) to service_role;

create or replace function public.mark_welcome_email_sent(p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  perform public.assert_request_actor(p_actor_user_id);

  update public.user_profiles
  set onboarding_completed_at = coalesce(onboarding_completed_at, v_now),
      welcome_email_sent_at = coalesce(welcome_email_sent_at, v_now),
      welcome_email_queued_at = null,
      welcome_email_last_error = null
  where id = p_actor_user_id;
end;
$$;

revoke all on function public.mark_welcome_email_sent(uuid) from public, anon, authenticated;
grant execute on function public.mark_welcome_email_sent(uuid) to service_role;

create or replace function public.release_welcome_email_delivery(
  p_actor_user_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_request_actor(p_actor_user_id);

  update public.user_profiles
  set welcome_email_queued_at = null,
      welcome_email_last_error = left(nullif(btrim(coalesce(p_error, '')), ''), 240)
  where id = p_actor_user_id
    and welcome_email_sent_at is null;
end;
$$;

revoke all on function public.release_welcome_email_delivery(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_welcome_email_delivery(uuid, text) to service_role;
