\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-0000000000d4';
  v_response jsonb;
  v_response_again jsonb;
  v_profile public.user_profiles%rowtype;
  v_unrevoked_devices integer;
begin
  insert into public.trusted_devices (
    user_id,
    device_id,
    platform,
    trust_state,
    trusted_at
  )
  values (
    v_user_id,
    'test-delete-device',
    'ios',
    'trusted',
    timezone('utc', now())
  )
  on conflict (user_id, device_id) do update
  set
    trust_state = 'trusted',
    trusted_at = excluded.trusted_at,
    revoked_at = null;

  v_response := public.request_account_deletion(v_user_id, 'test-account-deletion-request');
  v_response_again := public.request_account_deletion(v_user_id, 'test-account-deletion-request');

  if v_response ->> 'requestId' <> v_response_again ->> 'requestId' then
    raise exception 'expected idempotent account deletion response';
  end if;

  if v_response ->> 'status' <> 'completed' then
    raise exception 'expected completed deletion request, got %', v_response;
  end if;

  select *
    into v_profile
  from public.user_profiles
  where id = v_user_id;

  if not found then
    raise exception 'expected profile to be retained for ledger references';
  end if;

  if v_profile.email <> 'deleted+000000000000000000000000000000d4@happy-circles.invalid' then
    raise exception 'expected anonymized email, got %', v_profile.email;
  end if;

  if v_profile.display_name <> 'Cuenta eliminada' then
    raise exception 'expected anonymized display name, got %', v_profile.display_name;
  end if;

  if v_profile.phone_e164 is not null
    or v_profile.phone_national_number is not null
    or v_profile.avatar_path is not null
    or v_profile.deleted_at is null
  then
    raise exception 'expected account PII to be cleared';
  end if;

  select count(*)
    into v_unrevoked_devices
  from public.trusted_devices
  where user_id = v_user_id
    and trust_state <> 'revoked';

  if v_unrevoked_devices <> 0 then
    raise exception 'expected trusted devices to be revoked, got %', v_unrevoked_devices;
  end if;

  if not exists (
    select 1
    from public.account_deletion_requests
    where user_id = v_user_id
      and status = 'completed'
  ) then
    raise exception 'expected account deletion request audit row';
  end if;

  if not exists (
    select 1
    from public.audit_events
    where actor_user_id = v_user_id
      and entity_type = 'user_profile'
      and event_name = 'account_deletion_completed'
  ) then
    raise exception 'expected account deletion audit event';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - account deletion anonymizes PII and preserves ledger identity';
