do $$
declare
  v_user_elena constant uuid := '00000000-0000-0000-0000-0000000000e5';
  v_user_felipe constant uuid := '00000000-0000-0000-0000-0000000000f6';
  v_user_gina constant uuid := '00000000-0000-0000-0000-0000000000a7';
  v_internal jsonb;
  v_external_remote_share jsonb;
  v_external_remote_copy jsonb;
  v_external_manual_review jsonb;
  v_external_qr_1 jsonb;
  v_external_qr_2 jsonb;
  v_external_remote_changed jsonb;
  v_cancelable jsonb;
  v_preview jsonb;
  v_claim jsonb;
  v_manual_claim jsonb;
  v_review jsonb;
  v_cancel jsonb;
  v_delivery_count integer;
  v_active_relationship uuid;
begin
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
  select
    '00000000-0000-0000-0000-000000000000',
    demo_users.id,
    'authenticated',
    'authenticated',
    demo_users.email,
    extensions.crypt('Circles1234', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', demo_users.display_name),
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    ''
  from (
    values
      (v_user_elena, 'elena@example.com', 'Elena'),
      (v_user_felipe, 'felipe@example.com', 'Felipe'),
      (v_user_gina, 'gina@example.com', 'Gina')
  ) as demo_users(id, email, display_name)
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
    avatar_path,
    phone_country_iso2,
    phone_country_calling_code,
    phone_national_number,
    phone_e164
  )
  values
    (v_user_elena, 'elena@example.com', 'Elena', 'verify/elena.jpg', 'CO', '+57', '3001111101', '+573001111101'),
    (v_user_felipe, 'felipe@example.com', 'Felipe', 'verify/felipe.jpg', 'CO', '+57', '3001111102', '+573001111102'),
    (v_user_gina, 'gina@example.com', 'Gina', 'verify/gina.jpg', 'CO', '+57', '3001111103', '+573001111103')
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      avatar_path = excluded.avatar_path,
      phone_country_iso2 = excluded.phone_country_iso2,
      phone_country_calling_code = excluded.phone_country_calling_code,
      phone_national_number = excluded.phone_national_number,
      phone_e164 = excluded.phone_e164;

  delete from public.friendship_invite_deliveries
  where claimed_by_user_id in (v_user_elena, v_user_felipe, v_user_gina)
     or invite_id in (
       select id
       from public.friendship_invites
       where inviter_user_id in (v_user_elena, v_user_felipe, v_user_gina)
          or target_user_id in (v_user_elena, v_user_felipe, v_user_gina)
          or claimant_user_id in (v_user_elena, v_user_felipe, v_user_gina)
     );

  delete from public.friendship_invites
  where inviter_user_id in (v_user_elena, v_user_felipe, v_user_gina)
     or target_user_id in (v_user_elena, v_user_felipe, v_user_gina)
     or claimant_user_id in (v_user_elena, v_user_felipe, v_user_gina);

  delete from public.relationships
  where user_low_id in (v_user_elena, v_user_felipe, v_user_gina)
     or user_high_id in (v_user_elena, v_user_felipe, v_user_gina);

  delete from public.idempotency_keys
  where actor_user_id in (v_user_elena, v_user_felipe, v_user_gina);

  if not public.friendship_identity_ready(v_user_elena) then
    raise exception 'expected Elena to satisfy current identity gate';
  end if;

  v_internal := public.create_internal_friendship_invite(
    v_user_elena,
    'verify-friendship-internal',
    v_user_felipe,
    'sql_verify_internal'
  );

  if (v_internal ->> 'flow') <> 'internal' or (v_internal ->> 'status') <> 'pending_recipient' then
    raise exception 'expected pending internal invite, got %', v_internal;
  end if;

  perform public.respond_internal_friendship_invite(
    v_user_felipe,
    'verify-friendship-internal-accept',
    (v_internal ->> 'inviteId')::uuid,
    'accept'
  );

  if not exists (
    select 1
    from public.relationships
    where user_low_id = least(v_user_elena, v_user_felipe)
      and user_high_id = greatest(v_user_elena, v_user_felipe)
      and status = 'active'
  ) then
    raise exception 'expected active relationship after accepting internal invite';
  end if;

  begin
    perform public.create_external_friendship_invite(
      v_user_elena,
      'verify-friendship-remote-missing-phone',
      'remote',
      'sql_verify_remote_missing_phone',
      'Gina trabajo',
      null,
      null
    );
    raise exception 'expected contact_reference_required for remote invite without phone';
  exception
    when others then
      if position('contact_reference_required' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  v_external_remote_share := public.create_external_friendship_invite(
    v_user_elena,
    'verify-friendship-remote-share',
    'remote',
    'sql_verify_remote_share',
    'Gina trabajo',
    '+573001111103',
    'mobile'
  );

  v_external_remote_copy := public.create_external_friendship_invite(
    v_user_elena,
    'verify-friendship-remote-copy',
    'remote',
    'sql_verify_remote_copy',
    'Gina trabajo',
    '+573001111103',
    'mobile'
  );

  if (v_external_remote_share ->> 'inviteId')::uuid <> (v_external_remote_copy ->> 'inviteId')::uuid then
    raise exception 'expected remote share and copy to reuse same invite';
  end if;

  if (v_external_remote_share ->> 'deliveryToken') <> (v_external_remote_copy ->> 'deliveryToken') then
    raise exception 'expected remote share and copy to reuse same delivery token';
  end if;

  v_external_remote_changed := public.create_external_friendship_invite(
    v_user_elena,
    'verify-friendship-remote-changed',
    'remote',
    'sql_verify_remote_changed',
    'Gina viaje',
    '+573001111104',
    'work'
  );

  if (v_external_remote_changed ->> 'inviteId')::uuid = (v_external_remote_share ->> 'inviteId')::uuid then
    raise exception 'expected changing contact intent to create a different remote invite';
  end if;

  v_external_qr_1 := public.create_external_friendship_invite(
    v_user_elena,
    'verify-friendship-qr-1',
    'qr',
    'sql_verify_qr',
    null,
    null
  );

  v_external_qr_2 := public.create_external_friendship_invite(
    v_user_elena,
    'verify-friendship-qr-2',
    'qr',
    'sql_verify_qr',
    null,
    null
  );

  if (v_external_qr_1 ->> 'deliveryToken') = (v_external_qr_2 ->> 'deliveryToken') then
    raise exception 'expected a fresh QR token on regeneration';
  end if;

  if not exists (
    select 1
    from public.friendship_invite_deliveries
    where token = (v_external_qr_1 ->> 'deliveryToken')
      and status = 'revoked'
  ) then
    raise exception 'expected first QR delivery to be revoked after generating a new QR';
  end if;

  v_preview := public.get_friendship_invite_preview(
    v_user_gina,
    v_external_remote_share ->> 'deliveryToken'
  );

  if coalesce((v_preview ->> 'canClaim')::boolean, false) is not true then
    raise exception 'expected remote delivery to be claimable by Gina';
  end if;

  v_claim := public.claim_external_friendship_invite(
    v_user_gina,
    'verify-friendship-claim',
    v_external_remote_share ->> 'deliveryToken'
  );

  if (v_claim ->> 'status') <> 'accepted' then
    raise exception 'expected accepted after exact phone match claim, got %', v_claim;
  end if;

  v_active_relationship := (v_claim ->> 'relationshipId')::uuid;
  if v_active_relationship is null then
    raise exception 'expected relationship id after auto-accept claim';
  end if;

  if not exists (
    select 1
    from public.relationships
    where id = v_active_relationship
      and status = 'active'
  ) then
    raise exception 'expected active relationship after auto-accept claim';
  end if;

  select count(*)
    into v_delivery_count
  from public.friendship_invite_deliveries
  where invite_id = (v_external_remote_share ->> 'inviteId')::uuid
    and status = 'issued';

  if v_delivery_count <> 0 then
    raise exception 'expected claim to revoke every other issued delivery';
  end if;

  v_external_manual_review := public.create_external_friendship_invite(
    v_user_felipe,
    'verify-friendship-manual-review',
    'remote',
    'sql_verify_manual_review',
    'Lina trabajo',
    '+573001111104',
    'work'
  );

  v_manual_claim := public.claim_external_friendship_invite(
    v_user_gina,
    'verify-friendship-manual-claim',
    v_external_manual_review ->> 'deliveryToken'
  );

  if (v_manual_claim ->> 'status') <> 'pending_sender_review' then
    raise exception 'expected pending_sender_review after mismatched phone claim, got %', v_manual_claim;
  end if;

  v_review := public.review_external_friendship_invite(
    v_user_felipe,
    'verify-friendship-review-approve',
    (v_external_manual_review ->> 'inviteId')::uuid,
    'approve'
  );

  v_active_relationship := (v_review ->> 'relationshipId')::uuid;
  if v_active_relationship is null then
    raise exception 'expected relationship id after approving manual-review invite';
  end if;

  v_cancelable := public.create_external_friendship_invite(
    v_user_felipe,
    'verify-friendship-cancelable',
    'remote',
    'sql_verify_cancel',
    'Persona de prueba',
    '+573001111199',
    'mobile'
  );

  v_cancel := public.cancel_friendship_invite(
    v_user_felipe,
    'verify-friendship-cancel',
    (v_cancelable ->> 'inviteId')::uuid
  );

  if (v_cancel ->> 'status') <> 'canceled' then
    raise exception 'expected canceled invite after sender cancellation';
  end if;
end
$$;
