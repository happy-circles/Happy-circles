do $$
declare
  v_user_elena constant uuid := '00000000-0000-0000-0000-0000000000e5';
  v_user_felipe constant uuid := '00000000-0000-0000-0000-0000000000f6';
  v_user_gina constant uuid := '00000000-0000-0000-0000-0000000000a7';
  v_internal jsonb;
  v_external_link jsonb;
  v_external_whatsapp jsonb;
  v_external_qr_1 jsonb;
  v_external_qr_2 jsonb;
  v_cancelable jsonb;
  v_preview jsonb;
  v_claim jsonb;
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

  v_external_link := public.create_external_friendship_invite(
    v_user_elena,
    'verify-friendship-link',
    'link',
    'sql_verify_link',
    'Gina trabajo',
    null
  );

  v_external_whatsapp := public.create_external_friendship_invite(
    v_user_elena,
    'verify-friendship-whatsapp',
    'whatsapp',
    'sql_verify_whatsapp',
    'Gina trabajo',
    '+573001111103'
  );

  if (v_external_link ->> 'inviteId')::uuid <> (v_external_whatsapp ->> 'inviteId')::uuid then
    raise exception 'expected link and whatsapp deliveries to reuse same pending external invite';
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
    v_external_whatsapp ->> 'deliveryToken'
  );

  if coalesce((v_preview ->> 'canClaim')::boolean, false) is not true then
    raise exception 'expected whatsapp delivery to be claimable by Gina';
  end if;

  v_claim := public.claim_external_friendship_invite(
    v_user_gina,
    'verify-friendship-claim',
    v_external_whatsapp ->> 'deliveryToken'
  );

  if (v_claim ->> 'status') <> 'pending_sender_review' then
    raise exception 'expected pending_sender_review after external claim, got %', v_claim;
  end if;

  select count(*)
    into v_delivery_count
  from public.friendship_invite_deliveries
  where invite_id = (v_external_whatsapp ->> 'inviteId')::uuid
    and status = 'issued';

  if v_delivery_count <> 0 then
    raise exception 'expected claim to revoke every other issued delivery';
  end if;

  v_review := public.review_external_friendship_invite(
    v_user_elena,
    'verify-friendship-review-approve',
    (v_external_whatsapp ->> 'inviteId')::uuid,
    'approve'
  );

  v_active_relationship := (v_review ->> 'relationshipId')::uuid;
  if v_active_relationship is null then
    raise exception 'expected relationship id after approving external invite';
  end if;

  v_cancelable := public.create_external_friendship_invite(
    v_user_felipe,
    'verify-friendship-cancelable',
    'link',
    'sql_verify_cancel',
    'Persona de prueba',
    null
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
