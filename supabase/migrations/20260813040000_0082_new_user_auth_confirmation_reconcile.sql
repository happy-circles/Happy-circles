-- Reconcile the bridge window and define email-confirmation claiming. Auth is
-- locked before invite/profile state so an in-flight signup can drain without a
-- cross-table cycle. A lock timeout makes deployment retryable and fail-closed.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone_country_iso2 text;
  v_phone_country_calling_code text;
  v_phone_national_number text;
  v_phone_e164 text;
begin
  v_phone_country_iso2 := nullif(upper(coalesce(new.raw_user_meta_data ->> 'phone_country_iso2', '')), '');
  v_phone_country_calling_code := nullif(coalesce(new.raw_user_meta_data ->> 'phone_country_calling_code', ''), '');
  v_phone_national_number := nullif(coalesce(new.raw_user_meta_data ->> 'phone_national_number', ''), '');
  v_phone_e164 := nullif(coalesce(new.raw_user_meta_data ->> 'phone_e164', ''), '');

  insert into public.user_profiles (
    id,
    email,
    display_name,
    phone_country_iso2,
    phone_country_calling_code,
    phone_national_number,
    phone_e164,
    phone_identity_legacy_at,
    account_access_state
  ) values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), ''),
    v_phone_country_iso2,
    v_phone_country_calling_code,
    v_phone_national_number,
    v_phone_e164,
    case when v_phone_e164 is null then null else timezone('utc', now()) end,
    'needs_invite'
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      phone_country_iso2 = coalesce(excluded.phone_country_iso2, public.user_profiles.phone_country_iso2),
      phone_country_calling_code = coalesce(excluded.phone_country_calling_code, public.user_profiles.phone_country_calling_code),
      phone_national_number = coalesce(excluded.phone_national_number, public.user_profiles.phone_national_number),
      phone_e164 = coalesce(excluded.phone_e164, public.user_profiles.phone_e164);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.claim_account_invite_after_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_token_hash text;
begin
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then
    return new;
  end if;

  v_token_hash := nullif(
    coalesce(new.raw_user_meta_data ->> 'account_invite_delivery_token_hash', ''),
    ''
  );
  if v_token_hash is null or v_token_hash !~ '^[0-9a-f]{64}$' then
    return new;
  end if;

  begin
    -- The core resolves and locks invite -> delivery -> profile. Passing null
    -- identity assertions avoids reading the profile before those locks.
    perform public.claim_account_invite_for_registration_hash(
      new.id,
      v_token_hash,
      null,
      null
    );
  exception when others then
    -- Confirmation is primary. The retained intent/manual reconciliation path
    -- can recover without rolling back a valid Auth transaction.
    raise warning 'post-confirmation invite claim skipped for user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.claim_account_invite_after_email_confirmation()
  from public, anon, authenticated;

create or replace function app_private.reconcile_confirmed_account_invites()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, app_private, pg_temp
as $$
declare
  v_candidate record;
  v_metadata_count integer := 0;
  v_candidate_count integer := 0;
  v_reconciled_count integer := 0;
  v_now timestamptz := timezone('utc', now());
begin
  select count(*)::integer
    into v_metadata_count
  from auth.users auth_user
  join public.user_profiles profile on profile.id = auth_user.id
  where auth_user.email_confirmed_at is not null
    and profile.account_access_state in ('needs_invite', 'needs_activation')
    and nullif(
      coalesce(auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash', ''),
      ''
    ) is not null;

  -- Two confirmed users pointing at the same still-open bearer token are never
  -- resolved by choosing one. Abort atomically for manual investigation.
  if exists (
    select auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash'
    from auth.users auth_user
    join public.user_profiles profile on profile.id = auth_user.id
    join public.account_invite_deliveries delivery
      on delivery.token_hash = auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash'
    join public.account_invites invite on invite.id = delivery.invite_id
    where auth_user.email_confirmed_at is not null
      and profile.account_access_state in ('needs_invite', 'needs_activation')
      and (auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash')
        ~ '^[0-9a-f]{64}$'
      and invite.status = 'pending_activation'
      and invite.expires_at > v_now
      and delivery.status in ('issued', 'authenticated')
      and delivery.expires_at > v_now
      and delivery.revoked_at is null
    group by auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash'
    having count(*) > 1
  ) then
    raise exception 'confirmed_account_invite_reconciliation_ambiguous_token';
  end if;

  -- Distinct bearer deliveries for the same invite are still one reservation.
  -- Never let loop order choose between two confirmed claimant identities.
  if exists (
    select invite.id
    from auth.users auth_user
    join public.user_profiles profile on profile.id = auth_user.id
    join public.account_invite_deliveries delivery
      on delivery.token_hash = auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash'
    join public.account_invites invite on invite.id = delivery.invite_id
    where auth_user.email_confirmed_at is not null
      and profile.account_access_state in ('needs_invite', 'needs_activation')
      and (auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash')
        ~ '^[0-9a-f]{64}$'
      and invite.status = 'pending_activation'
      and invite.expires_at > v_now
      and delivery.status in ('issued', 'authenticated')
      and delivery.expires_at > v_now
      and delivery.revoked_at is null
    group by invite.id
    having count(distinct auth_user.id) > 1
  ) then
    raise exception 'confirmed_account_invite_reconciliation_ambiguous_invite';
  end if;

  -- An otherwise eligible token must not overwrite a different pending claim or
  -- a contradictory inviter/activation reference.
  if exists (
    select 1
    from auth.users auth_user
    join public.user_profiles profile on profile.id = auth_user.id
    join public.account_invite_deliveries delivery
      on delivery.token_hash = auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash'
    join public.account_invites invite on invite.id = delivery.invite_id
    where auth_user.email_confirmed_at is not null
      and profile.account_access_state in ('needs_invite', 'needs_activation')
      and (auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash')
        ~ '^[0-9a-f]{64}$'
      and invite.status = 'pending_activation'
      and invite.expires_at > v_now
      and delivery.status in ('issued', 'authenticated')
      and delivery.expires_at > v_now
      and delivery.revoked_at is null
      and invite.inviter_user_id <> auth_user.id
      and (invite.activated_user_id is null or invite.activated_user_id = auth_user.id)
      and (
        delivery.authenticated_user_id is null
        or delivery.authenticated_user_id = auth_user.id
      )
      and (
        profile.activated_via_account_invite_id is not null
        or (
          profile.invited_by_user_id is not null
          and profile.invited_by_user_id <> invite.inviter_user_id
        )
        or not (
          (
            profile.pending_account_invite_id is null
            and profile.pending_account_invite_delivery_id is null
          )
          or (
            profile.pending_account_invite_id = invite.id
            and profile.pending_account_invite_delivery_id = delivery.id
          )
        )
      )
  ) then
    raise exception 'confirmed_account_invite_reconciliation_needs_manual_review';
  end if;

  select count(*)::integer
    into v_candidate_count
  from auth.users auth_user
  join public.user_profiles profile on profile.id = auth_user.id
  join public.account_invite_deliveries delivery
    on delivery.token_hash = auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash'
  join public.account_invites invite on invite.id = delivery.invite_id
  where auth_user.email_confirmed_at is not null
    and profile.account_access_state in ('needs_invite', 'needs_activation')
    and (auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash')
      ~ '^[0-9a-f]{64}$'
    and nullif(btrim(profile.phone_e164), '') is not null
    and lower(btrim(profile.email)) = lower(btrim(auth_user.email))
    and invite.intended_recipient_phone_e164 = profile.phone_e164
    and invite.status = 'pending_activation'
    and invite.expires_at > v_now
    and invite.inviter_user_id <> auth_user.id
    and (invite.activated_user_id is null or invite.activated_user_id = auth_user.id)
    and delivery.status in ('issued', 'authenticated')
    and delivery.expires_at > v_now
    and delivery.revoked_at is null
    and (delivery.authenticated_user_id is null or delivery.authenticated_user_id = auth_user.id)
    and (
      delivery.status = 'issued'
      or delivery.claim_expires_at is null
      or delivery.claim_expires_at > v_now
    )
    and profile.activated_via_account_invite_id is null
    and (profile.invited_by_user_id is null or profile.invited_by_user_id = invite.inviter_user_id)
    and (
      (
        profile.pending_account_invite_id is null
        and profile.pending_account_invite_delivery_id is null
      )
      or (
        profile.pending_account_invite_id = invite.id
        and profile.pending_account_invite_delivery_id = delivery.id
      )
    );

  for v_candidate in
    select
      auth_user.id as user_id,
      auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash' as token_hash
    from auth.users auth_user
    join public.user_profiles profile on profile.id = auth_user.id
    join public.account_invite_deliveries delivery
      on delivery.token_hash = auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash'
    join public.account_invites invite on invite.id = delivery.invite_id
    where auth_user.email_confirmed_at is not null
      and profile.account_access_state in ('needs_invite', 'needs_activation')
      and (auth_user.raw_user_meta_data ->> 'account_invite_delivery_token_hash')
        ~ '^[0-9a-f]{64}$'
      and nullif(btrim(profile.phone_e164), '') is not null
      and lower(btrim(profile.email)) = lower(btrim(auth_user.email))
      and invite.intended_recipient_phone_e164 = profile.phone_e164
      and invite.status = 'pending_activation'
      and invite.expires_at > v_now
      and invite.inviter_user_id <> auth_user.id
      and (invite.activated_user_id is null or invite.activated_user_id = auth_user.id)
      and delivery.status in ('issued', 'authenticated')
      and delivery.expires_at > v_now
      and delivery.revoked_at is null
      and (delivery.authenticated_user_id is null or delivery.authenticated_user_id = auth_user.id)
      and (
        delivery.status = 'issued'
        or delivery.claim_expires_at is null
        or delivery.claim_expires_at > v_now
      )
      and profile.activated_via_account_invite_id is null
      and (profile.invited_by_user_id is null or profile.invited_by_user_id = invite.inviter_user_id)
      and (
        (
          profile.pending_account_invite_id is null
          and profile.pending_account_invite_delivery_id is null
        )
        or (
          profile.pending_account_invite_id = invite.id
          and profile.pending_account_invite_delivery_id = delivery.id
        )
      )
    order by auth_user.id
  loop
    perform public.claim_account_invite_for_registration_hash(
      v_candidate.user_id,
      v_candidate.token_hash,
      null,
      null
    );
    v_reconciled_count := v_reconciled_count + 1;
  end loop;

  if v_reconciled_count <> v_candidate_count then
    raise exception 'confirmed_account_invite_reconciliation_count_mismatch';
  end if;

  return jsonb_build_object(
    'metadataCount', v_metadata_count,
    'reconciledCount', v_reconciled_count,
    'manualCount', v_metadata_count - v_reconciled_count
  );
end;
$$;

revoke all on function app_private.reconcile_confirmed_account_invites()
  from public, anon, authenticated;
grant execute on function app_private.reconcile_confirmed_account_invites()
  to service_role;

-- Freeze only Auth writers while the bridge-window snapshot is reconciled. Each
-- candidate core acquires advisory -> invite -> delivery -> profile itself; no
-- public-table lock is held while waiting for an invite advisory lock.
lock table auth.users in share row exclusive mode;

select app_private.reconcile_confirmed_account_invites();
