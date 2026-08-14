do $$
declare
  v_inviter constant uuid := '00000000-0000-0000-0000-000000002301';
  v_claimant constant uuid := '00000000-0000-0000-0000-000000002302';
  v_unconfirmed constant uuid := '00000000-0000-0000-0000-000000002303';
  v_legacy_claimant constant uuid := '00000000-0000-0000-0000-000000002304';
  v_backfill_claimant constant uuid := '00000000-0000-0000-0000-000000002305';
  v_phone_identity_user constant uuid := '00000000-0000-0000-0000-000000002306';
  v_window_user constant uuid := '00000000-0000-0000-0000-000000002307';
  v_expired_window_user constant uuid := '00000000-0000-0000-0000-000000002308';
  v_ambiguous_user_a constant uuid := '00000000-0000-0000-0000-000000002309';
  v_ambiguous_user_b constant uuid := '00000000-0000-0000-0000-000000002310';
  v_phone constant text := '+573009992302';
  v_legacy_phone constant text := '+573009992304';
  v_backfill_phone constant text := '+573009992305';
  v_phone_identity_initial constant text := '+573009992306';
  v_phone_identity_changed constant text := '+573009992307';
  v_window_phone constant text := '+573009992308';
  v_expired_window_phone constant text := '+573009992309';
  v_ambiguous_phone_a constant text := '+573009992310';
  v_ambiguous_phone_b constant text := '+573009992311';
  v_create jsonb;
  v_replay jsonb;
  v_claim jsonb;
  v_activation jsonb;
  v_terminal_replay jsonb;
  v_revocation jsonb;
  v_legacy_create jsonb;
  v_legacy_claim jsonb;
  v_legacy_activation jsonb;
  v_backfill_result jsonb;
  v_backfill_state jsonb;
  v_touch jsonb;
  v_window_create jsonb;
  v_ambiguous_create jsonb;
  v_reconciliation jsonb;
  v_token_hash text;
  v_invite_id uuid;
  v_delivery_id uuid;
  v_backfill_invite_id uuid;
  v_backfill_delivery_id uuid;
  v_released_delivery_id uuid;
  v_expired_invite_id uuid;
  v_expired_delivery_id uuid;
  v_backfill_authenticated_at timestamptz;
  v_backfill_rollout_expires_at timestamptz;
  v_audit_count integer;
  v_affected_rows integer;
  v_visible_rows integer;
  v_device_column text;
  v_edge_read_relation text;
  v_profile_column text;
begin
  foreach v_edge_read_relation in array array[
    'relationships',
    'pair_net_edges_cache',
    'financial_requests',
    'ledger_accounts',
    'ledger_transactions',
    'ledger_entries',
    'settlement_proposals',
    'settlement_proposal_participants',
    'happy_circle_score_events',
    'notification_views',
    'audit_events',
    'user_profiles',
    'friendship_invites',
    'friendship_invite_deliveries',
    'account_invites',
    'account_invite_deliveries',
    'v_open_debts',
    'v_relationship_history',
    'v_inbox_items',
    'v_friendship_invites_live',
    'v_friendship_invite_deliveries_live',
    'v_account_invites_live',
    'v_account_invite_deliveries_live'
  ]
  loop
    if not has_table_privilege(
      'service_role', format('public.%I', v_edge_read_relation), 'SELECT'
    ) then
      raise exception 'service_role cannot read Edge snapshot relation %', v_edge_read_relation;
    end if;
  end loop;

  if has_table_privilege('service_role', 'public.relationships', 'INSERT')
    or has_table_privilege('service_role', 'public.relationships', 'UPDATE')
    or has_table_privilege('service_role', 'public.relationships', 'DELETE')
    or has_table_privilege('service_role', 'public.account_invites', 'INSERT')
    or has_table_privilege('service_role', 'public.account_invites', 'UPDATE')
    or has_table_privilege('service_role', 'public.account_invites', 'DELETE') then
    raise exception 'Edge read contract must not grant service_role direct mutation privileges';
  end if;

  -- Exercise the security-invoker views as service_role so missing privileges on
  -- their underlying tables fail here instead of surfacing as snapshot 403s.
  begin
    execute 'set local role service_role';
    foreach v_edge_read_relation in array array[
      'relationships',
      'v_open_debts',
      'v_relationship_history',
      'v_inbox_items',
      'v_friendship_invites_live',
      'v_friendship_invite_deliveries_live',
      'v_account_invites_live',
      'v_account_invite_deliveries_live'
    ]
    loop
      execute format('select 1 from public.%I limit 0', v_edge_read_relation);
    end loop;
    execute 'select id, inviter_user_id, activated_user_id, status from public.account_invites limit 0';
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  if not has_table_privilege('authenticated', 'public.trusted_devices', 'SELECT')
    or not has_any_column_privilege('authenticated', 'public.trusted_devices', 'INSERT')
    or not has_any_column_privilege('authenticated', 'public.trusted_devices', 'UPDATE')
    or has_table_privilege('authenticated', 'public.trusted_devices', 'INSERT')
    or has_table_privilege('authenticated', 'public.trusted_devices', 'UPDATE')
    or has_table_privilege('authenticated', 'public.trusted_devices', 'DELETE') then
    raise exception 'legacy clients require scoped SELECT/INSERT/UPDATE, but never broad mutation grants, on trusted_devices';
  end if;

  foreach v_device_column in array array[
    'user_id', 'device_id', 'platform', 'device_name', 'app_version', 'last_seen_at'
  ]
  loop
    if not has_column_privilege(
      'authenticated', 'public.trusted_devices', v_device_column, 'INSERT'
    ) then
      raise exception 'legacy clients cannot insert trusted_devices.%', v_device_column;
    end if;
  end loop;

  foreach v_device_column in array array[
    'platform', 'device_name', 'app_version', 'last_seen_at',
    'trust_state', 'trusted_at', 'revoked_at'
  ]
  loop
    if not has_column_privilege(
      'authenticated', 'public.trusted_devices', v_device_column, 'UPDATE'
    ) then
      raise exception 'legacy clients cannot update trusted_devices.%', v_device_column;
    end if;
  end loop;

  foreach v_device_column in array array[
    'trusted_session_id', 'trust_proof_method', 'trust_proof_at'
  ]
  loop
    if has_column_privilege(
      'authenticated', 'public.trusted_devices', v_device_column, 'INSERT'
    ) or has_column_privilege(
      'authenticated', 'public.trusted_devices', v_device_column, 'UPDATE'
    ) then
      raise exception 'authenticated clients must not write trusted_devices.%', v_device_column;
    end if;
  end loop;

  if to_regprocedure('public.activate_account_from_invite(uuid,text,text,text)') is null
    or to_regprocedure('public.activate_account_from_invite(uuid,text,text,text,text)') is null then
    raise exception 'both legacy and session-bound account activation signatures must exist';
  end if;

  if not has_function_privilege(
      'service_role',
      'public.activate_account_from_invite(uuid,text,text,text)'::regprocedure,
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.activate_account_from_invite(uuid,text,text,text)'::regprocedure,
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.activate_account_from_invite(uuid,text,text,text)'::regprocedure,
      'EXECUTE'
    ) then
    raise exception 'legacy account activation signature must remain service-role-only';
  end if;

  if not has_function_privilege(
      'service_role',
      'public.activate_account_from_invite(uuid,text,text,text,text)'::regprocedure,
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.activate_account_from_invite(uuid,text,text,text,text)'::regprocedure,
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.activate_account_from_invite(uuid,text,text,text,text)'::regprocedure,
      'EXECUTE'
    ) then
    raise exception 'session-bound account activation signature must remain service-role-only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.trust_current_device(uuid,text,text,text,text,text,text,timestamptz)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'trust transition RPC must remain service-role-only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.revoke_trusted_device(uuid,text,text,text)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'device revocation RPC must remain service-role-only';
  end if;

  if has_column_privilege(
    'authenticated', 'public.user_profiles', 'phone_verified_at', 'UPDATE'
  ) or has_column_privilege(
    'authenticated', 'public.user_profiles', 'phone_identity_legacy_at', 'UPDATE'
  ) then
    raise exception 'authenticated clients must not set phone identity proof/source columns';
  end if;

  if has_table_privilege('authenticated', 'public.user_profiles', 'SELECT') then
    raise exception 'authenticated retained broad SELECT on user_profiles';
  end if;

  foreach v_profile_column in array array[
    'pending_account_invite_id',
    'pending_account_invite_delivery_id',
    'account_invite_claimed_at',
    'account_invite_claim_expires_at',
    'phone_identity_legacy_at',
    'welcome_email_lease_id'
  ]
  loop
    if has_column_privilege(
      'authenticated', 'public.user_profiles', v_profile_column, 'SELECT'
    ) then
      raise exception 'authenticated can read private user_profiles.%', v_profile_column;
    end if;
  end loop;

  foreach v_profile_column in array array[
    'id', 'email', 'display_name', 'avatar_path', 'account_access_state',
    'invited_by_user_id', 'activated_via_account_invite_id', 'activated_at',
    'phone_country_iso2', 'phone_country_calling_code', 'phone_national_number',
    'phone_e164', 'phone_verified_at', 'created_at', 'updated_at',
    'deletion_requested_at', 'deleted_at', 'onboarding_completed_at',
    'welcome_email_queued_at', 'welcome_email_sent_at', 'welcome_email_last_error'
  ]
  loop
    if not has_column_privilege(
      'authenticated', 'public.user_profiles', v_profile_column, 'SELECT'
    ) then
      raise exception 'legacy user_profiles.% SELECT compatibility was removed', v_profile_column;
    end if;
  end loop;

  if not has_function_privilege(
      'authenticated', 'public.get_current_user_private_profile()'::regprocedure, 'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'public.get_current_user_private_profile()'::regprocedure, 'EXECUTE'
    ) then
    raise exception 'private profile RPC ACL is not authenticated-only';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_inviter,
    'authenticated', 'authenticated', 'hardening-inviter@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', 'Hardening Inviter'),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  ) on conflict (id) do nothing;

  update public.user_profiles
  set display_name = 'Hardening Inviter',
      phone_e164 = '+573009992301',
      account_access_state = 'active'
  where id = v_inviter;
  update public.user_profiles
  set phone_verified_at = timezone('utc', now())
  where id = v_inviter;

  -- A row trusted by a pre-session client remains usable by that installed
  -- client, but the first new-client touch progressively retires its unbound trust.
  insert into public.trusted_devices (
    user_id, device_id, platform, device_name, app_version, trust_state,
    trusted_at, last_seen_at, trusted_session_id, trust_proof_method, trust_proof_at
  ) values (
    v_inviter, 'legacy-touch-device', 'ios', 'Legacy touched device', '0.1.2',
    'trusted', timezone('utc', now()), timezone('utc', now()), null, null, null
  );

  v_touch := public.touch_current_device(
    v_inviter, 'legacy-touch-device', 'ios', 'Legacy touched device', '0.2.0'
  );
  if v_touch ->> 'trustState' <> 'pending'
    or v_touch ->> 'trustedAt' is not null
    or not exists (
      select 1
      from public.trusted_devices
      where user_id = v_inviter
        and device_id = 'legacy-touch-device'
        and trust_state = 'pending'
        and trusted_at is null
        and trusted_session_id is null
        and trust_proof_method is null
        and trust_proof_at is null
    ) then
    raise exception 'touch_current_device did not progressively retire legacy unbound trust: %',
      v_touch;
  end if;

  -- Re-run the migration helper against an isolated pre-0073 reservation. It
  -- preserves the historical claim time while granting one rollout grace window;
  -- the subtransaction rollback prevents cross-test fixture interference.
  begin
    update public.account_invites
    set status = 'canceled',
        resolution_actor = 'system',
        resolution_reason = 'temporarily_hidden_by_backfill_canary',
        resolved_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where status = 'pending_activation'
      and activated_user_id is not null;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_backfill_claimant,
      'authenticated', 'authenticated', 'hardening-backfill-claimant@example.com',
      extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', 'Backfill Claimant', 'phone_e164', v_backfill_phone),
      timezone('utc', now()) - interval '2 hours', timezone('utc', now()), '', '', '', ''
    );

    update public.user_profiles
    set display_name = 'Backfill Claimant',
        phone_e164 = v_backfill_phone,
        account_access_state = 'needs_invite',
        invited_by_user_id = null,
        pending_account_invite_id = null,
        pending_account_invite_delivery_id = null,
        account_invite_claimed_at = null,
        account_invite_claim_expires_at = null
    where id = v_backfill_claimant;

    v_backfill_authenticated_at := timezone('utc', now()) - interval '2 hours';
    insert into public.account_invites (
      inviter_user_id, activated_user_id, status, intended_recipient_alias,
      intended_recipient_phone_e164, source_context, expires_at, created_at, updated_at
    ) values (
      v_inviter, v_backfill_claimant, 'pending_activation', 'Backfill Claimant',
      v_backfill_phone, 'sql_hardening_backfill', timezone('utc', now()) + interval '7 days',
      v_backfill_authenticated_at - interval '1 hour', v_backfill_authenticated_at
    ) returning id into v_backfill_invite_id;

    insert into public.account_invite_deliveries (
      invite_id, token_hash, channel, source_context, status, expires_at,
      authenticated_user_id, authenticated_at, created_at, updated_at
    ) values (
      v_backfill_invite_id, public.hash_invite_token('hardening-backfill-token'),
      'remote', 'sql_hardening_backfill', 'authenticated',
      timezone('utc', now()) + interval '7 days', v_backfill_claimant,
      v_backfill_authenticated_at, v_backfill_authenticated_at - interval '1 hour',
      v_backfill_authenticated_at
    ) returning id into v_backfill_delivery_id;

    v_backfill_rollout_expires_at := timezone('utc', now()) + interval '24 hours';
    v_backfill_result := app_private.backfill_legacy_account_invite_claims();
    if v_backfill_result <> jsonb_build_object(
      'materializedCount', 1, 'liveCount', 1, 'releasedCount', 0
    ) then
      raise exception 'legacy reservation backfill counts were unexpected: %',
        v_backfill_result;
    end if;

    select jsonb_build_object(
      'accountAccessState', profile.account_access_state,
      'invitedByUserId', profile.invited_by_user_id,
      'pendingInviteId', profile.pending_account_invite_id,
      'pendingDeliveryId', profile.pending_account_invite_delivery_id,
      'accountInviteClaimedAt', profile.account_invite_claimed_at,
      'accountInviteClaimExpiresAt', profile.account_invite_claim_expires_at,
      'deliveryClaimExpiresAt', delivery.claim_expires_at,
      'expectedClaimedAt', v_backfill_authenticated_at,
      'expectedClaimExpiresAt', v_backfill_rollout_expires_at
    ) into v_backfill_state
    from public.user_profiles profile
    left join public.account_invite_deliveries delivery
      on delivery.id = profile.pending_account_invite_delivery_id
    where profile.id = v_backfill_claimant;

    if not exists (
      select 1
      from public.user_profiles profile
      join public.account_invite_deliveries delivery
        on delivery.id = profile.pending_account_invite_delivery_id
      where profile.id = v_backfill_claimant
        and profile.account_access_state = 'needs_activation'
        and profile.invited_by_user_id = v_inviter
        and profile.pending_account_invite_id = v_backfill_invite_id
        and profile.pending_account_invite_delivery_id = v_backfill_delivery_id
        and profile.account_invite_claimed_at = v_backfill_authenticated_at
        and profile.account_invite_claim_expires_at = v_backfill_rollout_expires_at
        and delivery.claim_expires_at = v_backfill_rollout_expires_at
    ) then
      raise exception 'legacy reservation backfill did not preserve claim time plus rollout grace: %',
        v_backfill_state;
    end if;

    raise exception 'hardening_backfill_fixture_rollback';
  exception when others then
    if sqlerrm <> 'hardening_backfill_fixture_rollback' then raise; end if;
  end;

  -- Phase A treats phones supplied by installed/new clients as legacy identity
  -- until SMS OTP exists. Verification upgrades that source without client DML.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_phone_identity_user,
    'authenticated', 'authenticated', 'hardening-phone-identity@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', 'Phone Identity', 'phone_e164', v_phone_identity_initial
    ),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

  if not exists (
    select 1 from public.user_profiles
    where id = v_phone_identity_user
      and phone_e164 = v_phone_identity_initial
      and phone_identity_legacy_at is not null
      and phone_verified_at is null
  ) then
    raise exception 'handle_new_user did not retain Phase A legacy phone identity';
  end if;

  perform public.mark_profile_phone_verified(v_phone_identity_user, v_phone_identity_initial);
  if not exists (
    select 1 from public.user_profiles
    where id = v_phone_identity_user
      and phone_verified_at is not null
      and phone_identity_legacy_at is null
  ) then
    raise exception 'mark_profile_phone_verified did not replace legacy phone identity';
  end if;

  update public.user_profiles
  set phone_e164 = v_phone_identity_changed
  where id = v_phone_identity_user;
  if not exists (
    select 1 from public.user_profiles
    where id = v_phone_identity_user
      and phone_e164 = v_phone_identity_changed
      and phone_verified_at is null
      and phone_identity_legacy_at is not null
  ) then
    raise exception 'changing a verified phone did not return it to legacy identity';
  end if;

  perform public.mark_profile_phone_verified(v_phone_identity_user, v_phone_identity_changed);
  if not exists (
    select 1 from public.user_profiles
    where id = v_phone_identity_user
      and phone_verified_at is not null
      and phone_identity_legacy_at is null
  ) then
    raise exception 'phone verification did not clear the replacement legacy source';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_legacy_claimant,
    'authenticated', 'authenticated', 'hardening-legacy-claimant@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', 'Legacy Claimant', 'phone_e164', v_legacy_phone),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

  update public.user_profiles
  set display_name = 'Legacy Claimant',
      phone_e164 = v_legacy_phone
  where id = v_legacy_claimant;

  insert into public.relationships (user_low_id, user_high_id, status)
  values (
    least(v_inviter, v_phone_identity_user),
    greatest(v_inviter, v_phone_identity_user),
    'active'
  )
  on conflict (user_low_id, user_high_id)
  do update set status = 'active';

  insert into public.trusted_devices (
    user_id, device_id, platform, device_name, app_version, trust_state, last_seen_at
  ) values (
    v_legacy_claimant, 'legacy-rls-foreign-device', 'ios', 'Foreign legacy device',
    '0.1.2', 'pending', timezone('utc', now())
  );

  -- Exercise the effective legacy-client RLS boundary, not only ACL metadata.
  -- Populate both claim settings used by supported auth.uid() implementations.
  begin
    perform set_config('request.jwt.claim.sub', v_inviter::text, true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', v_inviter, 'role', 'authenticated')::text,
      true
    );
    execute 'set local role authenticated';

    select count(*) into v_visible_rows
    from public.user_profiles
    where id = v_phone_identity_user
      and display_name = 'Phone Identity';
    if v_visible_rows <> 1 then
      raise exception 'related user lost legacy visible profile columns';
    end if;

    begin
      execute format(
        'select pending_account_invite_id from public.user_profiles where id = %L::uuid',
        v_phone_identity_user::text
      );
      raise exception 'related user could read private pending invite state';
    exception
      when insufficient_privilege then null;
    end;

    select count(*) into v_visible_rows
    from public.get_current_user_private_profile()
    where id = v_inviter;
    if v_visible_rows <> 1 then
      raise exception 'private profile RPC did not return the authenticated self row';
    end if;

    select count(*) into v_visible_rows
    from public.get_current_user_private_profile()
    where id <> v_inviter;
    if v_visible_rows <> 0 then
      raise exception 'private profile RPC exposed a non-self row';
    end if;

    insert into public.trusted_devices (
      user_id, device_id, platform, device_name, app_version, last_seen_at
    ) values (
      v_inviter, 'legacy-rls-own-device', 'ios', 'Legacy own device', '0.1.2',
      timezone('utc', now())
    );

    update public.trusted_devices
    set app_version = '0.1.3',
        last_seen_at = timezone('utc', now())
    where user_id = v_inviter
      and device_id = 'legacy-rls-own-device';
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 1 then
      raise exception 'authenticated legacy client could not update its own trusted device';
    end if;

    begin
      update public.trusted_devices
      set trusted_session_id = 'forged-session',
          trust_proof_method = 'forged-proof',
          trust_proof_at = timezone('utc', now())
      where user_id = v_inviter
        and device_id = 'legacy-rls-own-device';
      raise exception 'authenticated client could forge trusted-device proof columns';
    exception
      when insufficient_privilege then null;
    end;

    begin
      insert into public.trusted_devices (
        user_id, device_id, platform, last_seen_at,
        trusted_session_id, trust_proof_method, trust_proof_at
      ) values (
        v_inviter, 'forged-proof-device', 'ios', timezone('utc', now()),
        'forged-session', 'forged-proof', timezone('utc', now())
      );
      raise exception 'authenticated client could insert forged trusted-device proof';
    exception
      when insufficient_privilege then null;
    end;

    select count(*) into v_visible_rows
    from public.trusted_devices
    where user_id = v_legacy_claimant;
    if v_visible_rows <> 0 then
      raise exception 'authenticated RLS exposed another user''s trusted devices';
    end if;

    update public.trusted_devices
    set app_version = 'forbidden-cross-user-update'
    where user_id = v_legacy_claimant;
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 0 then
      raise exception 'authenticated RLS allowed updating another user''s trusted device';
    end if;

    begin
      insert into public.trusted_devices (
        user_id, device_id, platform, device_name, app_version, last_seen_at
      ) values (
        v_legacy_claimant, 'legacy-rls-foreign-device-2', 'ios', 'Foreign device', '0.1.2',
        timezone('utc', now())
      );
      raise exception 'authenticated RLS allowed inserting another user''s trusted device';
    exception
      when insufficient_privilege then null;
    end;

    begin
      delete from public.trusted_devices
      where user_id = v_inviter
        and device_id = 'legacy-rls-own-device';
      raise exception 'authenticated role retained forbidden DELETE access to trusted_devices';
    exception
      when insufficient_privilege then null;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{}', true);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', true);
      perform set_config('request.jwt.claims', '{}', true);
      raise;
  end;

  -- Simulate a user inserted already-confirmed during the bridge window: the
  -- profile-only signup trigger must not claim in the Auth INSERT transaction,
  -- and the fail-closed reconciliation must materialize the exact open token.
  v_window_create := public.create_account_invite(
    v_inviter, 'hardening-window-create-0001', 'remote', 'sql_hardening_window',
    'Window User', v_window_phone, 'mobile'
  );
  v_token_hash := public.hash_invite_token(v_window_create ->> 'deliveryToken');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_window_user,
    'authenticated', 'authenticated', 'hardening-window@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', 'Window User',
      'phone_e164', v_window_phone,
      'account_invite_delivery_token_hash', v_token_hash
    ),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

  if exists (
    select 1 from public.account_invites
    where id = (v_window_create ->> 'inviteId')::uuid
      and activated_user_id is not null
  ) then
    raise exception 'confirmed-at-insert bridge signup claimed inside handle_new_user';
  end if;

  v_reconciliation := app_private.reconcile_confirmed_account_invites();
  if (v_reconciliation ->> 'reconciledCount')::integer < 1
    or not exists (
      select 1
      from public.user_profiles
      where id = v_window_user
        and account_access_state = 'needs_activation'
        and pending_account_invite_id = (v_window_create ->> 'inviteId')::uuid
        and pending_account_invite_delivery_id = (v_window_create ->> 'deliveryId')::uuid
    ) then
    raise exception 'bridge-window confirmed signup was not reconciled: %', v_reconciliation;
  end if;

  -- Expired/terminal metadata remains a manual case and is never revived.
  insert into public.account_invites (
    inviter_user_id, status, intended_recipient_alias,
    intended_recipient_phone_e164, source_context, expires_at
  ) values (
    v_inviter, 'expired', 'Expired Window User', v_expired_window_phone,
    'sql_hardening_expired_window', timezone('utc', now()) - interval '1 minute'
  ) returning id into v_expired_invite_id;

  insert into public.account_invite_deliveries (
    invite_id, token_hash, channel, source_context, status, expires_at
  ) values (
    v_expired_invite_id,
    public.hash_invite_token('hardening-expired-window-token'),
    'remote', 'sql_hardening_expired_window', 'expired',
    timezone('utc', now()) - interval '1 minute'
  ) returning id into v_expired_delivery_id;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_expired_window_user,
    'authenticated', 'authenticated', 'hardening-expired-window@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', 'Expired Window User',
      'phone_e164', v_expired_window_phone,
      'account_invite_delivery_token_hash',
      public.hash_invite_token('hardening-expired-window-token')
    ),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

  perform app_private.reconcile_confirmed_account_invites();
  if exists (
    select 1 from public.account_invites
    where id = v_expired_invite_id and activated_user_id is not null
  ) or not exists (
    select 1 from public.account_invite_deliveries
    where id = v_expired_delivery_id
      and status = 'expired'
      and authenticated_user_id is null
  ) or not exists (
    select 1 from public.user_profiles
    where id = v_expired_window_user and account_access_state = 'needs_invite'
  ) then
    raise exception 'reconciliation revived an expired/manual invite';
  end if;

  -- Ambiguous ownership aborts its subtransaction before any candidate changes.
  v_ambiguous_create := public.create_account_invite(
    v_inviter, 'hardening-ambiguous-create-0001', 'remote', 'sql_hardening_ambiguous',
    'Ambiguous User', v_ambiguous_phone_a, 'mobile'
  );
  v_token_hash := public.hash_invite_token(v_ambiguous_create ->> 'deliveryToken');

  insert into public.account_invite_deliveries (
    invite_id, token_hash, channel, source_context, status, expires_at
  ) values (
    (v_ambiguous_create ->> 'inviteId')::uuid,
    public.hash_invite_token('hardening-ambiguous-sibling-token'),
    'remote', 'sql_hardening_ambiguous_sibling', 'issued',
    timezone('utc', now()) + interval '7 days'
  );

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
  (
    '00000000-0000-0000-0000-000000000000', v_ambiguous_user_a,
    'authenticated', 'authenticated', 'hardening-ambiguous-a@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', 'Ambiguous User A', 'phone_e164', v_ambiguous_phone_a,
      'account_invite_delivery_token_hash', v_token_hash
    ),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000', v_ambiguous_user_b,
    'authenticated', 'authenticated', 'hardening-ambiguous-b@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', 'Ambiguous User B', 'phone_e164', v_ambiguous_phone_b,
      'account_invite_delivery_token_hash',
      public.hash_invite_token('hardening-ambiguous-sibling-token')
    ),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

  begin
    perform app_private.reconcile_confirmed_account_invites();
    raise exception 'ambiguous reconciliation unexpectedly succeeded';
  exception when others then
    if position('confirmed_account_invite_reconciliation_ambiguous_invite' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.account_invites
    where id = (v_ambiguous_create ->> 'inviteId')::uuid
      and activated_user_id is not null
  ) or exists (
    select 1 from public.account_invite_deliveries
    where id = (v_ambiguous_create ->> 'deliveryId')::uuid
      and (status <> 'issued' or authenticated_user_id is not null)
  ) or exists (
    select 1 from public.user_profiles
    where id in (v_ambiguous_user_a, v_ambiguous_user_b)
      and account_access_state <> 'needs_invite'
  ) then
    raise exception 'ambiguous reconciliation changed state before aborting';
  end if;

  v_create := public.create_account_invite(
    v_inviter, 'hardening-create-0001', 'remote', 'sql_hardening',
    'Hardening Claimant', v_phone, 'mobile'
  );
  v_replay := public.create_account_invite(
    v_inviter, 'hardening-create-0001', 'remote', 'sql_hardening',
    'Hardening Claimant', v_phone, 'mobile'
  );

  if v_create ->> 'deliveryToken' is null
    or v_create ->> 'deliveryToken' <> v_replay ->> 'deliveryToken'
    or v_create ->> 'deliveryId' <> v_replay ->> 'deliveryId' then
    raise exception 'create invite replay must return the exact bearer token and delivery';
  end if;

  begin
    perform public.create_account_invite(
      v_inviter, 'hardening-create-0001', 'remote', 'different-request',
      'Hardening Claimant', v_phone, 'mobile'
    );
    raise exception 'expected idempotency request mismatch';
  exception when others then
    if position('idempotency_key_reused' in sqlerrm) = 0 then raise; end if;
  end;

  -- A separately claimed account exercises the four-argument contract used by
  -- already-installed clients. Compatibility is limited to a legacy trusted row
  -- that has not been bound to any authenticated session.
  v_legacy_create := public.create_account_invite(
    v_inviter, 'hardening-legacy-create-0001', 'remote', 'sql_hardening_legacy',
    'Legacy Claimant', v_legacy_phone, 'mobile'
  );
  v_legacy_claim := public.claim_account_invite_for_registration_hash(
    v_legacy_claimant,
    public.hash_invite_token(v_legacy_create ->> 'deliveryToken'),
    'hardening-legacy-claimant@example.com',
    v_legacy_phone
  );
  if v_legacy_claim ->> 'accountAccessState' <> 'needs_activation' then
    raise exception 'legacy activation fixture did not establish a durable claim';
  end if;

  begin
    perform public.activate_account_from_invite(
      v_legacy_claimant,
      'hardening-legacy-pending-reject-0001',
      v_legacy_create ->> 'deliveryToken',
      'legacy-rls-foreign-device'
    );
    raise exception 'legacy activation must reject a pending trusted-device row';
  exception when others then
    if position('activation_device_not_trusted' in sqlerrm) = 0 then raise; end if;
  end;

  update public.trusted_devices
  set trust_state = 'trusted',
      trusted_at = timezone('utc', now()),
      trusted_session_id = 'legacy-session-bound',
      trust_proof_method = 'password',
      trust_proof_at = timezone('utc', now())
  where user_id = v_legacy_claimant
    and device_id = 'legacy-rls-foreign-device';

  begin
    perform public.activate_account_from_invite(
      v_legacy_claimant,
      'hardening-legacy-bound-reject-0001',
      v_legacy_create ->> 'deliveryToken',
      'legacy-rls-foreign-device'
    );
    raise exception 'legacy activation must not bypass a session-bound device';
  exception when others then
    if position('activation_device_not_trusted' in sqlerrm) = 0 then raise; end if;
  end;

  insert into public.trusted_devices (
    user_id, device_id, platform, device_name, app_version, trust_state,
    trusted_at, last_seen_at, trusted_session_id, trust_proof_method, trust_proof_at
  ) values (
    v_legacy_claimant, 'legacy-unbound-device', 'ios', 'Legacy unbound device', '0.1.2',
    'trusted', timezone('utc', now()), timezone('utc', now()), null, null, null
  );

  v_legacy_activation := public.activate_account_from_invite(
    v_legacy_claimant,
    'hardening-legacy-activate-0001',
    v_legacy_create ->> 'deliveryToken',
    'legacy-unbound-device'
  );
  if v_legacy_activation ->> 'status' <> 'accepted' then
    raise exception 'legacy phone identity must preserve Phase A auto-acceptance, got %',
      v_legacy_activation;
  end if;
  if not exists (
    select 1
    from public.user_profiles
    where id = v_legacy_claimant
      and account_access_state = 'active'
      and activated_via_account_invite_id = (v_legacy_create ->> 'inviteId')::uuid
  ) then
    raise exception 'legacy four-argument activation did not activate its claimant profile';
  end if;
  if not exists (
    select 1
    from public.account_invites
    where id = (v_legacy_create ->> 'inviteId')::uuid
      and status = 'accepted'
      and resolution_reason = 'activation_phone_match_auto_accepted'
  ) or not exists (
    select 1
    from public.audit_events
    where entity_type = 'account_invite'
      and entity_id = (v_legacy_create ->> 'inviteId')::uuid
      and event_name = 'account_invite_activated'
      and metadata_json ->> 'phone_identity_source' = 'legacy'
      and metadata_json ->> 'resolution_reason' = 'activation_phone_match_auto_accepted'
  ) then
    raise exception 'legacy phone auto-acceptance did not retain its source/reason audit';
  end if;

  v_token_hash := public.hash_invite_token(v_create ->> 'deliveryToken');
  v_invite_id := (v_create ->> 'inviteId')::uuid;
  v_delivery_id := (v_create ->> 'deliveryId')::uuid;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_unconfirmed,
    'authenticated', 'authenticated', 'hardening-unconfirmed@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), null,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name', 'Unconfirmed User',
      'phone_e164', v_phone,
      'account_invite_delivery_token_hash', v_token_hash
    ),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

  if exists (
    select 1 from public.account_invites
    where id = v_invite_id and activated_user_id = v_unconfirmed
  ) then
    raise exception 'unconfirmed signup must not reserve an account invite';
  end if;

  -- Confirmation trigger attempts the claim and must not block confirmation.
  update auth.users
  set email_confirmed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = v_unconfirmed;

  if not exists (
    select 1 from public.user_profiles
    where id = v_unconfirmed
      and account_access_state = 'needs_activation'
      and pending_account_invite_id = v_invite_id
      and pending_account_invite_delivery_id = v_delivery_id
  ) then
    raise exception 'confirmation trigger must persist a durable needs_activation reservation';
  end if;

  -- A confirmed user may still abandon setup. Expiry must release that durable
  -- reservation instead of leaving both users in needs_activation/reserved loops.
  v_released_delivery_id := v_delivery_id;
  update public.account_invite_deliveries
  set claim_expires_at = timezone('utc', now()) - interval '1 minute'
  where id = v_delivery_id;
  if public.release_stale_account_invite_claims(10) <> 1 then
    raise exception 'expected stale confirmed claim release';
  end if;

  if not exists (
    select 1
    from public.user_profiles
    where id = v_unconfirmed
      and account_access_state = 'needs_invite'
      and pending_account_invite_id is null
      and pending_account_invite_delivery_id is null
      and account_invite_claimed_at is null
      and account_invite_claim_expires_at is null
  ) or exists (
    select 1 from public.account_invites
    where id = v_invite_id and activated_user_id is not null
  ) or not exists (
    select 1 from public.account_invite_deliveries
    where id = v_released_delivery_id and status = 'revoked'
  ) then
    raise exception 'stale release must clear claimant refs and revoke only its delivery';
  end if;

  update public.user_profiles
  set phone_e164 = null
  where id = v_unconfirmed;

  -- The sender can issue a fresh bearer delivery after the abandoned claim;
  -- no privileged test-only reopening of the old delivery is required.
  v_create := public.create_account_invite(
    v_inviter, 'hardening-create-reissue-0002', 'remote', 'sql_hardening_reissue',
    'Hardening Claimant', v_phone, 'mobile'
  );
  v_token_hash := public.hash_invite_token(v_create ->> 'deliveryToken');
  v_invite_id := (v_create ->> 'inviteId')::uuid;
  v_delivery_id := (v_create ->> 'deliveryId')::uuid;
  if v_delivery_id = v_released_delivery_id then
    raise exception 'reissue must create a new delivery after an abandoned reservation';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_claimant,
    'authenticated', 'authenticated', 'hardening-claimant@example.com',
    extensions.crypt('Circles1234', extensions.gen_salt('bf')), timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', 'Hardening Claimant', 'phone_e164', v_phone),
    timezone('utc', now()), timezone('utc', now()), '', '', '', ''
  );

  -- This separate fixture represents the future no-phone-proof path. Phase A's
  -- signup trigger intentionally marks supplied phones as legacy identities, so
  -- clear that marker explicitly before asserting sender review behavior.
  update public.user_profiles
  set phone_identity_legacy_at = null,
      phone_verified_at = null
  where id = v_claimant;

  v_claim := public.claim_account_invite_for_registration_hash(
    v_claimant, v_token_hash, 'hardening-claimant@example.com', v_phone
  );
  if v_claim ->> 'accountAccessState' <> 'needs_activation' then
    raise exception 'expected durable needs_activation claim, got %', v_claim;
  end if;

  perform public.trust_current_device(
    v_claimant, 'hardening-device', 'ios', 'SQL device', '1.0.0',
    '00000000-0000-0000-0000-000000002399', 'password', timezone('utc', now())
  );

  begin
    perform public.activate_account_from_pending_invite(
      v_claimant, 'hardening-activate-wrong-session', 'hardening-device',
      '00000000-0000-0000-0000-000000002397'
    );
    raise exception 'expected copied trusted device id to fail from session B';
  exception when others then
    if position('activation_device_not_trusted' in sqlerrm) = 0 then raise; end if;
  end;

  v_activation := public.activate_account_from_pending_invite(
    v_claimant, 'hardening-activate-0001', 'hardening-device',
    '00000000-0000-0000-0000-000000002399'
  );
  if v_activation ->> 'status' <> 'pending_inviter_review' then
    raise exception 'unverified phone must activate into sender review, got %', v_activation;
  end if;

  begin
    perform public.activate_account_from_invite(
      v_claimant,
      'hardening-activate-0001',
      v_create ->> 'deliveryToken',
      'hardening-device',
      '00000000-0000-0000-0000-000000002397'
    );
    raise exception 'idempotent activation replay bypassed session binding';
  exception when others then
    if position('activation_device_not_trusted' in sqlerrm) = 0 then raise; end if;
  end;

  select count(*) into v_audit_count
  from public.audit_events
  where entity_type = 'account_invite'
    and entity_id = v_invite_id
    and event_name = 'account_invite_activated';

  v_terminal_replay := public.activate_account_from_invite(
    v_claimant, 'hardening-activate-replay-0002', v_create ->> 'deliveryToken',
    'hardening-device', '00000000-0000-0000-0000-000000002399'
  );
  if v_terminal_replay ->> 'status' <> 'pending_inviter_review' then
    raise exception 'terminal activation replay must remain stable';
  end if;
  if (select count(*) from public.audit_events
      where entity_type = 'account_invite' and entity_id = v_invite_id
        and event_name = 'account_invite_activated') <> v_audit_count then
    raise exception 'terminal activation replay must not append duplicate activation audit';
  end if;

  perform public.trust_current_device(
    v_claimant, 'hardening-device-target', 'ios', 'Target device', '1.0.0',
    '00000000-0000-0000-0000-000000002398', 'password', timezone('utc', now())
  );

  begin
    perform public.revoke_trusted_device(
      v_claimant, 'hardening-device-target', 'hardening-device',
      '00000000-0000-0000-0000-000000002397'
    );
    raise exception 'expected revocation to reject a mismatched origin session';
  exception when others then
    if position('trusted_origin_required' in sqlerrm) = 0 then raise; end if;
  end;

  v_revocation := public.revoke_trusted_device(
    v_claimant, 'hardening-device-target', 'hardening-device',
    '00000000-0000-0000-0000-000000002399'
  );
  if v_revocation ->> 'trustState' <> 'revoked' then
    raise exception 'matching trusted origin session must revoke the target device';
  end if;

end
$$;

select '1..1';
select 'ok 1 - new-user trust, confirmation, claim, idempotency, and terminal activation are hardened';
