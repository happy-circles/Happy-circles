with demo_users as (
  select *
  from (
    values
      ('00000000-0000-0000-0000-0000000000e5'::uuid, 'elena@example.com', 'Elena', '+573001111101'),
      ('00000000-0000-0000-0000-0000000000f6'::uuid, 'felipe@example.com', 'Felipe', '+573001111102'),
      ('00000000-0000-0000-0000-0000000000a7'::uuid, 'gina@example.com', 'Gina', '+573001111103')
  ) as seed_user(id, email, display_name, phone_e164)
)
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
from demo_users
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
select
  demo_users.id,
  demo_users.email,
  demo_users.display_name,
  demo_users.id::text || '/avatar.jpg',
  'CO',
  '+57',
  right(demo_users.phone_e164, 10),
  demo_users.phone_e164
from (
  values
    ('00000000-0000-0000-0000-0000000000e5'::uuid, 'elena@example.com', 'Elena', '+573001111101'),
    ('00000000-0000-0000-0000-0000000000f6'::uuid, 'felipe@example.com', 'Felipe', '+573001111102'),
    ('00000000-0000-0000-0000-0000000000a7'::uuid, 'gina@example.com', 'Gina', '+573001111103')
) as demo_users(id, email, display_name, phone_e164)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name,
    avatar_path = excluded.avatar_path,
    phone_country_iso2 = excluded.phone_country_iso2,
    phone_country_calling_code = excluded.phone_country_calling_code,
    phone_national_number = excluded.phone_national_number,
    phone_e164 = excluded.phone_e164;

do $$
declare
  v_user_elena constant uuid := '00000000-0000-0000-0000-0000000000e5';
  v_user_felipe constant uuid := '00000000-0000-0000-0000-0000000000f6';
  v_user_gina constant uuid := '00000000-0000-0000-0000-0000000000a7';
  v_internal jsonb;
  v_external_remote_share jsonb;
  v_external_remote_copy jsonb;
  v_external_qr_1 jsonb;
  v_external_qr_2 jsonb;
  v_external_remote_changed jsonb;
  v_cancelable jsonb;
  v_preview jsonb;
  v_claim jsonb;
  v_review jsonb;
  v_cancel jsonb;
  v_delivery_count integer;
  v_active_relationship uuid;
begin
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

  if not exists (
    select 1
    from pg_class
    where oid = 'public.v_friendship_invites_live'::regclass
      and coalesce(reloptions, array[]::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'expected v_friendship_invites_live to run with security_invoker';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.v_friendship_invite_deliveries_live'::regclass
      and coalesce(reloptions, array[]::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'expected v_friendship_invite_deliveries_live to run with security_invoker';
  end if;

  if not public.friendship_identity_ready(v_user_elena) then
    raise exception 'expected Elena to satisfy current identity gate';
  end if;

  v_internal := public.create_internal_friendship_invite(
    v_user_elena,
    'test-friendship-internal',
    v_user_felipe,
    'sql_test_internal'
  );

  if (v_internal ->> 'flow') <> 'internal' or (v_internal ->> 'status') <> 'pending_recipient' then
    raise exception 'expected pending internal invite, got %', v_internal;
  end if;

  perform public.respond_internal_friendship_invite(
    v_user_felipe,
    'test-friendship-internal-accept',
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
    perform public.create_internal_friendship_invite(
      v_user_elena,
      'test-friendship-internal-duplicate',
      v_user_felipe,
      'sql_test_internal_duplicate'
    );
    raise exception 'expected relationship_already_exists for duplicate internal invite';
  exception
    when others then
      if position('relationship_already_exists' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  begin
    perform public.create_external_friendship_invite(
      v_user_elena,
      'test-friendship-remote-missing-phone',
      'remote',
      'sql_test_remote_missing_phone',
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
    'test-friendship-remote-share',
    'remote',
    'sql_test_remote_share',
    'Gina trabajo',
    '+573001111103',
    'mobile'
  );

  v_external_remote_copy := public.create_external_friendship_invite(
    v_user_elena,
    'test-friendship-remote-copy',
    'remote',
    'sql_test_remote_copy',
    'Gina trabajo',
    '+573001111103',
    'mobile'
  );

  if (v_external_remote_share ->> 'inviteId')::uuid <> (v_external_remote_copy ->> 'inviteId')::uuid then
    raise exception 'expected remote share and copy to reuse the same external invite';
  end if;

  if (v_external_remote_share ->> 'deliveryToken') <> (v_external_remote_copy ->> 'deliveryToken') then
    raise exception 'expected remote share and copy to reuse the same delivery token';
  end if;

  if (v_external_remote_share ->> 'intendedRecipientPhoneE164') <> '+573001111103' then
    raise exception 'expected intendedRecipientPhoneE164 in remote payload, got %', v_external_remote_share;
  end if;

  v_external_remote_changed := public.create_external_friendship_invite(
    v_user_elena,
    'test-friendship-remote-changed',
    'remote',
    'sql_test_remote_changed',
    'Gina viaje',
    '+573001111104',
    'work'
  );

  if (v_external_remote_changed ->> 'inviteId')::uuid = (v_external_remote_share ->> 'inviteId')::uuid then
    raise exception 'expected changing contact intent to create a different remote invite';
  end if;

  v_external_qr_1 := public.create_external_friendship_invite(
    v_user_elena,
    'test-friendship-qr-1',
    'qr',
    'sql_test_qr',
    null,
    null
  );

  v_external_qr_2 := public.create_external_friendship_invite(
    v_user_elena,
    'test-friendship-qr-2',
    'qr',
    'sql_test_qr',
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

  if (v_preview ->> 'intendedRecipientPhoneE164') <> '+573001111103' then
    raise exception 'expected preview to expose intended recipient phone, got %', v_preview;
  end if;

  begin
    perform public.claim_external_friendship_invite(
      v_user_elena,
      'test-friendship-self-claim',
      v_external_remote_share ->> 'deliveryToken'
    );
    raise exception 'expected cannot_claim_own_invite for sender self claim';
  exception
    when others then
      if position('cannot_claim_own_invite' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  v_claim := public.claim_external_friendship_invite(
    v_user_gina,
    'test-friendship-claim',
    v_external_remote_share ->> 'deliveryToken'
  );

  if (v_claim ->> 'status') <> 'pending_sender_review' then
    raise exception 'expected pending_sender_review after external claim, got %', v_claim;
  end if;

  select count(*)
    into v_delivery_count
  from public.friendship_invite_deliveries
  where invite_id = (v_external_remote_share ->> 'inviteId')::uuid
    and status = 'issued';

  if v_delivery_count <> 0 then
    raise exception 'expected claim to revoke every other issued delivery';
  end if;

  v_preview := public.get_friendship_invite_preview(
    v_user_elena,
    v_external_remote_share ->> 'deliveryToken'
  );

  if coalesce((v_preview ->> 'canApprove')::boolean, false) is not true then
    raise exception 'expected sender review preview after claim, got %', v_preview;
  end if;

  v_review := public.review_external_friendship_invite(
    v_user_elena,
    'test-friendship-review-approve',
    (v_external_remote_share ->> 'inviteId')::uuid,
    'approve'
  );

  v_active_relationship := (v_review ->> 'relationshipId')::uuid;
  if v_active_relationship is null then
    raise exception 'expected relationship id after approving external invite';
  end if;

  if not exists (
    select 1
    from public.relationships
    where id = v_active_relationship
      and user_low_id = least(v_user_elena, v_user_gina)
      and user_high_id = greatest(v_user_elena, v_user_gina)
      and status = 'active'
  ) then
    raise exception 'expected active relationship after sender approval';
  end if;

  v_cancelable := public.create_external_friendship_invite(
    v_user_felipe,
    'test-friendship-cancelable',
    'remote',
    'sql_test_cancel',
    'Persona de prueba',
    '+573001111199',
    'mobile'
  );

  v_cancel := public.cancel_friendship_invite(
    v_user_felipe,
    'test-friendship-cancel',
    (v_cancelable ->> 'inviteId')::uuid
  );

  if (v_cancel ->> 'status') <> 'canceled' then
    raise exception 'expected canceled external invite after sender cancellation, got %', v_cancel;
  end if;

  v_preview := public.get_friendship_invite_preview(
    v_user_gina,
    v_cancelable ->> 'deliveryToken'
  );

  if (v_preview ->> 'reason') <> 'canceled' then
    raise exception 'expected canceled preview for revoked delivery, got %', v_preview ->> 'reason';
  end if;
end
$$;

select '1..1';
select 'ok 1 - friendship invite hard cut';
