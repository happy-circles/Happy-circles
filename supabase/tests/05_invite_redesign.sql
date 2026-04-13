\set QUIET 1
\pset format unaligned
\pset tuples_only on

with demo_users as (
  select *
  from (
    values
      ('00000000-0000-0000-0000-0000000000e5'::uuid, 'elena@example.com', 'Elena'),
      ('00000000-0000-0000-0000-0000000000f6'::uuid, 'felipe@example.com', 'Felipe'),
      ('00000000-0000-0000-0000-0000000000a7'::uuid, 'gina@example.com', 'Gina')
  ) as seed_user(id, email, display_name)
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

insert into public.user_profiles (id, email, display_name)
select
  demo_users.id,
  demo_users.email,
  demo_users.display_name
from (
  values
    ('00000000-0000-0000-0000-0000000000e5'::uuid, 'elena@example.com', 'Elena'),
    ('00000000-0000-0000-0000-0000000000f6'::uuid, 'felipe@example.com', 'Felipe'),
    ('00000000-0000-0000-0000-0000000000a7'::uuid, 'gina@example.com', 'Gina')
) as demo_users(id, email, display_name)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name;

do $$
declare
  v_user_elena constant uuid := '00000000-0000-0000-0000-0000000000e5';
  v_user_felipe constant uuid := '00000000-0000-0000-0000-0000000000f6';
  v_user_gina constant uuid := '00000000-0000-0000-0000-0000000000a7';
  v_matched_contact jsonb;
  v_matched_invite_id uuid;
  v_profile_preview jsonb;
  v_shareable_invite jsonb;
  v_shareable_invite_id uuid;
  v_shareable_token text;
  v_shareable_preview jsonb;
  v_claim_contact jsonb;
  v_claimed_contact public.contact_invites%rowtype;
  v_expired_invite jsonb;
  v_expired_invite_id uuid;
  v_expired_token text;
  v_expired_preview jsonb;
  v_duplicate_invite jsonb;
  v_duplicate_token text;
  v_duplicate_preview jsonb;
begin
  delete from public.contact_invites
  where inviter_user_id in (v_user_elena, v_user_felipe, v_user_gina)
     or claimed_by_user_id in (v_user_elena, v_user_felipe, v_user_gina);

  delete from public.relationship_invites
  where inviter_user_id in (v_user_elena, v_user_felipe, v_user_gina)
     or invitee_user_id in (v_user_elena, v_user_felipe, v_user_gina)
     or accepted_by_user_id in (v_user_elena, v_user_felipe, v_user_gina);

  delete from public.relationships
  where user_low_id in (v_user_elena, v_user_felipe, v_user_gina)
     or user_high_id in (v_user_elena, v_user_felipe, v_user_gina);

  delete from public.idempotency_keys
  where actor_user_id in (v_user_elena, v_user_felipe, v_user_gina);

  update public.user_profiles
  set
    phone_country_iso2 = 'CO',
    phone_country_calling_code = '+57',
    phone_national_number = case
      when id = v_user_elena then '3001111101'
      when id = v_user_felipe then '3001111102'
      when id = v_user_gina then '3001111103'
      else phone_national_number
    end,
    phone_e164 = case
      when id = v_user_elena then '+573001111101'
      when id = v_user_felipe then '+573001111102'
      when id = v_user_gina then '+573001111103'
      else phone_e164
    end
  where id in (v_user_elena, v_user_felipe, v_user_gina);

  if exists (
    select 1
    from public.user_profiles
    where id in (v_user_elena, v_user_felipe, v_user_gina)
      and public_connection_token is null
  ) then
    raise exception 'expected public connection token for test users';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.v_relationship_invites_live'::regclass
      and coalesce(reloptions, array[]::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'expected v_relationship_invites_live to run with security_invoker';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.v_contact_invites_live'::regclass
      and coalesce(reloptions, array[]::text[]) @> array['security_invoker=true']
  ) then
    raise exception 'expected v_contact_invites_live to run with security_invoker';
  end if;

  v_matched_contact := public.create_contact_invite(
    v_user_elena,
    'test-invite-redesign-whatsapp-match',
    'Felipe',
    'CO',
    '+57',
    '3001111102'
  );

  if (v_matched_contact ->> 'status') <> 'matched' then
    raise exception 'expected matched whatsapp invite, got %', v_matched_contact ->> 'status';
  end if;

  v_matched_invite_id := (v_matched_contact ->> 'relationshipInviteId')::uuid;

  if v_matched_invite_id is null then
    raise exception 'expected linked relationship invite for matched whatsapp invite';
  end if;

  if not exists (
    select 1
    from public.v_relationship_invites_live
    where id = v_matched_invite_id
      and inviter_user_id = v_user_elena
      and invitee_user_id = v_user_felipe
      and status = 'pending'
      and target_mode = 'direct_user'
      and channel_label = 'WhatsApp'
  ) then
    raise exception 'expected pending direct relationship invite for matched whatsapp flow';
  end if;

  v_profile_preview := public.get_profile_connection_preview(
    v_user_elena,
    (select public_connection_token from public.user_profiles where id = v_user_felipe)
  );

  if (v_profile_preview ->> 'reason') <> 'outgoing_pending' then
    raise exception 'expected outgoing_pending QR preview after matched invite, got %', v_profile_preview ->> 'reason';
  end if;

  v_shareable_invite := public.create_shareable_invite(
    v_user_elena,
    'test-invite-redesign-share-link'
  );
  v_shareable_invite_id := (v_shareable_invite ->> 'inviteId')::uuid;
  v_shareable_token := v_shareable_invite ->> 'inviteToken';

  if v_shareable_invite_id is null or v_shareable_token is null then
    raise exception 'expected shareable invite id and token';
  end if;

  v_shareable_preview := public.get_invite_preview_by_token(v_user_gina, v_shareable_token);

  if coalesce((v_shareable_preview ->> 'canAccept')::boolean, false) is not true then
    raise exception 'expected shareable invite to be accept-ready';
  end if;

  perform public.accept_invite_by_token(
    v_user_gina,
    'test-invite-redesign-share-link-accept',
    v_shareable_token
  );

  if not exists (
    select 1
    from public.relationships
    where user_low_id = least(v_user_elena, v_user_gina)
      and user_high_id = greatest(v_user_elena, v_user_gina)
      and status = 'active'
  ) then
    raise exception 'expected active relationship after accepting shareable invite';
  end if;

  v_duplicate_invite := public.create_shareable_invite(
    v_user_elena,
    'test-invite-redesign-duplicate-link'
  );
  v_duplicate_token := v_duplicate_invite ->> 'inviteToken';
  v_duplicate_preview := public.get_invite_preview_by_token(v_user_gina, v_duplicate_token);

  if (v_duplicate_preview ->> 'reason') <> 'already_connected' then
    raise exception 'expected already_connected preview for duplicate share link, got %', v_duplicate_preview ->> 'reason';
  end if;

  begin
    perform public.accept_invite_by_token(
      v_user_gina,
      'test-invite-redesign-duplicate-link-accept',
      v_duplicate_token
    );
    raise exception 'expected relationship_already_exists when accepting duplicate share link';
  exception
    when others then
      if position('relationship_already_exists' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  v_expired_invite := public.create_shareable_invite(
    v_user_felipe,
    'test-invite-redesign-expired-link'
  );
  v_expired_invite_id := (v_expired_invite ->> 'inviteId')::uuid;
  v_expired_token := v_expired_invite ->> 'inviteToken';

  update public.relationship_invites
  set expires_at = timezone('utc', now()) - interval '5 minutes'
  where id = v_expired_invite_id;

  v_expired_preview := public.get_invite_preview_by_token(v_user_elena, v_expired_token);

  if (v_expired_preview ->> 'status') <> 'expired' then
    raise exception 'expected expired share link preview to report expired, got %', v_expired_preview ->> 'status';
  end if;

  begin
    perform public.accept_invite_by_token(
      v_user_elena,
      'test-invite-redesign-expired-link-accept',
      v_expired_token
    );
    raise exception 'expected invite_expired when accepting expired share link';
  exception
    when others then
      if position('invite_expired' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.relationship_invites
    where id = v_expired_invite_id
      and status = 'expired'
  ) then
    raise exception 'expected expired share link to be marked as expired';
  end if;

  v_claim_contact := public.create_contact_invite(
    v_user_felipe,
    'test-invite-redesign-phone-claim',
    'Gina',
    'CO',
    '+57',
    '3001111199'
  );

  if (v_claim_contact ->> 'status') <> 'pending' then
    raise exception 'expected pending whatsapp invite before phone claim';
  end if;

  update public.user_profiles
  set
    phone_country_iso2 = 'CO',
    phone_country_calling_code = '+57',
    phone_national_number = '3001111199',
    phone_e164 = '+573001111199'
  where id = v_user_gina;

  select *
    into v_claimed_contact
  from public.contact_invites
  where id = (v_claim_contact ->> 'contactInviteId')::uuid;

  if v_claimed_contact.status <> 'matched' then
    raise exception 'expected claimed contact invite to become matched, got %', v_claimed_contact.status;
  end if;

  if v_claimed_contact.claimed_by_user_id <> v_user_gina then
    raise exception 'expected claimed contact invite to belong to Gina';
  end if;

  if v_claimed_contact.relationship_invite_id is null then
    raise exception 'expected phone claim to create or reuse a relationship invite';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - invite redesign smoke';
