begin;
set local statement_timeout = '30s';

insert into auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'signup-gate-inviter@example.com', '{"provider":"email"}', '{}', now(), now());
insert into public.user_profiles(id, email, display_name, account_access_state)
values ('00000000-0000-0000-0000-00000000ee01', 'signup-gate-inviter@example.com', 'Signup Gate Inviter', 'active')
on conflict(id) do update set account_access_state = 'active';

update app_private.signup_gate_configuration set enforce_social_grants = true where singleton;

do $$
declare
  v_invite uuid := gen_random_uuid();
  v_delivery uuid := gen_random_uuid();
  v_user uuid := '00000000-0000-0000-0000-00000000ee02';
  v_other_user uuid := '00000000-0000-0000-0000-00000000ee03';
  v_token text := 'test-signup-gate-private-bearer-token-001';
  v_social_event jsonb := '{"user":{"id":"00000000-0000-0000-0000-00000000ee99","email":"invited-social@example.com","app_metadata":{"provider":"google"},"user_metadata":{"sub":"signup-gate-google-subject"}}}';
  v_email_event jsonb;
  v_result jsonb;
  v_expires_at timestamptz;
begin
  if has_function_privilege('anon', 'public.prepare_social_registration(text,text,text,text,timestamp with time zone)', 'execute')
    or has_function_privilege('authenticated', 'public.prepare_social_registration(text,text,text,text,timestamp with time zone)', 'execute')
    or not has_function_privilege('service_role', 'public.prepare_social_registration(text,text,text,text,timestamp with time zone)', 'execute')
    or has_function_privilege('anon', 'app_private.require_invited_signup(jsonb)', 'execute')
    or has_function_privilege('service_role', 'app_private.require_invited_signup(jsonb)', 'execute')
    or not has_function_privilege('supabase_auth_admin', 'app_private.require_invited_signup(jsonb)', 'execute')
    or has_table_privilege('anon', 'app_private.social_registration_grants', 'select')
    or has_table_privilege('authenticated', 'app_private.social_registration_grants', 'insert')
    or has_table_privilege('service_role', 'app_private.social_registration_grants', 'insert') then
    raise exception 'signup gate must keep grants and proof assertions private';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'app_private.social_registration_grants'::regclass) then
    raise exception 'signup permit table must have RLS';
  end if;

  insert into public.account_invites(id, inviter_user_id, status, expires_at)
  values(v_invite, '00000000-0000-0000-0000-00000000ee01', 'pending_activation', now() + interval '1 hour');
  insert into public.account_invite_deliveries(id, invite_id, token_hash, channel, status, expires_at)
  values(v_delivery, v_invite, public.hash_invite_token(v_token), 'qr', 'issued', now() + interval '1 hour');
  v_email_event := jsonb_build_object('user', jsonb_build_object(
    'email', 'invited-social@example.com', 'app_metadata', jsonb_build_object('provider', 'email'),
    'user_metadata', jsonb_build_object('account_invite_delivery_token_hash', public.hash_invite_token(v_token))
  ));

  if app_private.require_invited_signup(v_social_event) -> 'error' is null
    or app_private.require_invited_signup('{"user":{"app_metadata":{"provider":"email"}}}') -> 'error' is null
    or app_private.require_invited_signup(jsonb_set(v_social_event, '{user,is_anonymous}', 'true')) -> 'error' is null then
    raise exception 'new users without server authorization must be denied';
  end if;
  if app_private.require_invited_signup(v_email_event) <> '{}'::jsonb then
    raise exception 'valid QR invitation must authorize email signup without recipient email';
  end if;

  v_result := public.prepare_social_registration(v_token, 'google', 'signup-gate-google-subject', 'Invited-Social@Example.com', clock_timestamp() + interval '2 minutes');
  v_expires_at := (v_result ->> 'expiresAt')::timestamptz;
  if v_result ->> 'authorized' <> 'true' or v_expires_at > clock_timestamp() + interval '2 minutes'
    or app_private.require_invited_signup(v_social_event) <> '{}'::jsonb then
    raise exception 'verified social identity must be authorized for the credential lifetime';
  end if;
  if app_private.require_invited_signup(v_email_event) <> '{}'::jsonb then
    raise exception 'unconsumed social proof must allow invited email fallback';
  end if;
  if app_private.require_invited_signup(jsonb_set(v_social_event, '{user,email}', '"someone-else@example.com"')) -> 'error' is null
    or app_private.require_invited_signup(jsonb_set(v_social_event, '{user,user_metadata,sub}', '"different-subject"')) -> 'error' is null then
    raise exception 'signup permit must be tied to exact provider identity and email';
  end if;
  perform public.prepare_social_registration(v_token, 'google', 'signup-gate-google-subject', 'invited-social@example.com', clock_timestamp() + interval '1 hour');
  if (select expires_at from app_private.social_registration_grants where invite_id = v_invite) > clock_timestamp() + interval '5 minutes' then
    raise exception 'social authorization must never exceed five minutes';
  end if;
  begin
    perform public.prepare_social_registration(v_token, 'google', 'other-subject', 'other@example.com', clock_timestamp() + interval '1 hour');
    raise exception 'expected reservation conflict';
  exception when raise_exception then
    if sqlerrm <> 'account_invite_required' then raise; end if;
  end;

  update public.account_invite_deliveries set revoked_at = clock_timestamp() where id = v_delivery;
  if app_private.require_invited_signup(v_social_event) -> 'error' is null then raise exception 'revoked invitation must revoke signup permit immediately'; end if;
  begin
    insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
    values(v_user, 'invited-social@example.com', '{"provider":"google"}', '{"sub":"signup-gate-google-subject"}');
    raise exception 'expected revoked permit to reject actual insert';
  exception when raise_exception then
    if sqlerrm <> 'account_invite_required' then raise; end if;
  end;
  update public.account_invite_deliveries set revoked_at = null where id = v_delivery;

  update app_private.social_registration_grants set expires_at = clock_timestamp() - interval '1 second' where invite_id = v_invite;
  if app_private.require_invited_signup(v_social_event) -> 'error' is null then raise exception 'expired proof must be rejected'; end if;
  -- Auth calls the hook outside the INSERT transaction. Reassign an expired reservation after
  -- the original identity was admitted; its later INSERT must fail even when lookup no longer matches.
  perform public.prepare_social_registration(v_token, 'google', 'replacement-subject', 'replacement@example.com', clock_timestamp() + interval '1 hour');
  begin
    insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
    values(v_user, 'invited-social@example.com', '{"provider":"google"}', '{"sub":"signup-gate-google-subject"}');
    raise exception 'expected reassigned hook grant to reject actual insert';
  exception when raise_exception then
    if sqlerrm <> 'account_invite_required' then raise; end if;
  end;
  update app_private.social_registration_grants set expires_at = clock_timestamp() - interval '1 second' where invite_id = v_invite;
  perform public.prepare_social_registration(v_token, 'google', 'signup-gate-google-subject', 'invited-social@example.com', clock_timestamp() + interval '1 hour');

  -- A later Auth failure rolls back consumption, so network/error retries are possible.
  begin
    insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
    values(v_user, 'invited-social@example.com', '{"provider":"google"}', '{"sub":"signup-gate-google-subject"}');
    raise exception 'simulated signup transaction failure';
  exception when raise_exception then
    if sqlerrm <> 'simulated signup transaction failure' then raise; end if;
  end;
  if (select consumed_at from app_private.social_registration_grants where invite_id = v_invite) is not null then
    raise exception 'rolled-back user insert must leave its permit retriable';
  end if;
  insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
  values(v_user, 'invited-social@example.com', '{"provider":"google"}', '{"sub":"signup-gate-google-subject"}');
  if (select consumed_user_id from app_private.social_registration_grants where invite_id = v_invite) <> v_user then
    raise exception 'permit must consume using actual auth.users id, never hook provisional id';
  end if;
  if (select account_access_state from public.user_profiles where id = v_user) = 'active' then
    raise exception 'user creation must never autoactivate account access';
  end if;
  if app_private.require_invited_signup(v_social_event) -> 'error' is null
    or app_private.require_invited_signup(v_email_event) -> 'error' is null then
    raise exception 'consumed invitation must not admit a second new account';
  end if;
  begin
    insert into auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
    values(v_other_user, 'invited-social@example.com', '{"provider":"google"}', '{"sub":"signup-gate-google-subject"}');
    raise exception 'expected consumed grant to deny a second insert';
  exception when raise_exception then
    if sqlerrm <> 'account_invite_required' then raise; end if;
  end;
  -- Successful sign-in response loss can retry its already-created identity, but cannot release the reservation.
  perform public.prepare_social_registration(v_token, 'google', 'signup-gate-google-subject', 'invited-social@example.com', clock_timestamp() + interval '1 hour');
  begin
    perform public.prepare_social_registration(v_token, 'apple', 'different-subject', 'another@example.com', clock_timestamp() + interval '1 hour');
    raise exception 'expected consumed invitation to remain unavailable';
  exception when raise_exception then
    if sqlerrm <> 'account_invite_required' then raise; end if;
  end;
end;
$$;
rollback;
select '1..1';
select 'ok 1 - invitation-only signup verifies identity, current delivery, transactional consumption and email fallback';
