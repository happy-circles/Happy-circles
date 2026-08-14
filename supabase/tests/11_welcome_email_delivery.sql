insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000001101',
  'authenticated',
  'authenticated',
  'welcome@example.com',
  extensions.crypt('Circles1234', extensions.gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Welcome User"}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now()),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000001102',
  'authenticated',
  'authenticated',
  'welcome-incomplete@example.com',
  extensions.crypt('Circles1234', extensions.gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Incomplete"}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now()),
  '',
  '',
  '',
  ''
)
on conflict (id) do update
set email = excluded.email,
    aud = excluded.aud,
    role = excluded.role,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;

insert into public.user_profiles (
  id,
  email,
  display_name,
  account_access_state,
  phone_e164,
  avatar_path
)
values (
  '00000000-0000-0000-0000-000000001101',
  'welcome@example.com',
  'Welcome User',
  'active',
  '+573001111111',
  null
),
(
  '00000000-0000-0000-0000-000000001102',
  'welcome-incomplete@example.com',
  'Incomplete',
  'active',
  null,
  null
)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    account_access_state = excluded.account_access_state,
    phone_e164 = excluded.phone_e164,
    avatar_path = excluded.avatar_path,
    onboarding_completed_at = null,
    welcome_email_queued_at = null,
    welcome_email_sent_at = null,
    welcome_email_last_error = null;

do $$
declare
  v_user_id constant uuid := '00000000-0000-0000-0000-000000001101';
  v_incomplete_user_id constant uuid := '00000000-0000-0000-0000-000000001102';
  v_claim record;
  v_lease_id uuid;
begin
  select *
    into v_claim
  from public.claim_welcome_email_delivery(v_user_id);

  if not found or v_claim.email <> 'welcome@example.com' then
    raise exception 'expected complete user without avatar to claim welcome email delivery';
  end if;

  if not exists (
    select 1
    from public.user_profiles
    where id = v_user_id
      and onboarding_completed_at is not null
      and welcome_email_queued_at is not null
      and welcome_email_sent_at is null
  ) then
    raise exception 'expected claim to mark onboarding completion and queued timestamp';
  end if;

  if exists (select 1 from public.claim_welcome_email_delivery(v_user_id)) then
    raise exception 'expected duplicate claim to be blocked while queued';
  end if;

  perform public.release_welcome_email_delivery(v_user_id, 'resend failed');

  if not exists (
    select 1
    from public.user_profiles
    where id = v_user_id
      and welcome_email_queued_at is null
      and welcome_email_last_error = 'resend failed'
  ) then
    raise exception 'expected release to clear queue and store error';
  end if;

  if not exists (select 1 from public.claim_welcome_email_delivery(v_user_id)) then
    raise exception 'expected released delivery to be claimable again';
  end if;

  perform public.mark_welcome_email_sent(v_user_id);

  if not exists (
    select 1
    from public.user_profiles
    where id = v_user_id
      and welcome_email_sent_at is not null
      and welcome_email_queued_at is null
      and welcome_email_last_error is null
  ) then
    raise exception 'expected mark sent to persist final welcome email state';
  end if;

  if exists (select 1 from public.claim_welcome_email_delivery(v_user_id)) then
    raise exception 'expected sent delivery to be unclaimable';
  end if;

  if exists (select 1 from public.claim_welcome_email_delivery(v_incomplete_user_id)) then
    raise exception 'expected incomplete profile to be unclaimable';
  end if;

  update public.user_profiles
  set welcome_email_sent_at = null,
      welcome_email_queued_at = null,
      welcome_email_lease_id = null,
      welcome_email_last_error = null
  where id = v_user_id;

  perform public.mark_onboarding_completed(v_user_id);
  select lease_id into v_lease_id
  from public.claim_welcome_email_delivery_v2(v_user_id);

  if v_lease_id is null then
    raise exception 'expected v2 claim to issue a lease token';
  end if;

  if public.release_welcome_email_delivery_v2(
    v_user_id,
    gen_random_uuid(),
    'wrong worker'
  ) then
    raise exception 'expected stale worker with wrong lease to be ignored';
  end if;

  if not public.mark_welcome_email_sent_v2(v_user_id, v_lease_id) then
    raise exception 'expected active lease owner to mark welcome email sent';
  end if;
end
$$;

select '1..1';
select 'ok 1 - welcome email delivery is idempotent and gated by setup completion';
