-- Recoverable friendship commands. No account-access or phone-identity policy changes.
-- Lock order: idempotency -> pair/intent advisory lock -> invite -> delivery -> outbox.
alter table public.friendship_invites
  add column if not exists last_reminded_at timestamptz,
  add column if not exists reminder_sequence integer not null default 0;

create or replace function app_private.begin_friendship_command(
  p_actor uuid, p_operation text, p_key text, p_payload jsonb
)
returns public.idempotency_keys
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.idempotency_keys%rowtype;
  v_hash text := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
begin
  perform public.assert_request_actor(p_actor);
  if p_actor is null then raise exception 'actor_required'; end if;
  if nullif(btrim(p_key), '') is null or length(p_key) not between 8 and 128 then
    raise exception 'invalid_idempotency_key';
  end if;
  insert into public.idempotency_keys
    (actor_user_id, operation_name, idempotency_key, request_hash, expires_at)
  values (p_actor, p_operation, p_key, v_hash, timezone('utc', now()) + interval '30 days')
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;
  select * into v_row from public.idempotency_keys
  where actor_user_id = p_actor and operation_name = p_operation and idempotency_key = p_key
  for update;
  if v_row.request_hash is not null and v_row.request_hash <> v_hash then
    raise exception 'idempotency_key_reused';
  end if;
  update public.idempotency_keys set request_hash = v_hash where id = v_row.id;
  return v_row;
end;
$$;

create or replace function app_private.finish_friendship_command(p_id uuid, p_response jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.idempotency_keys
  set response_json = p_response, completed_at = timezone('utc', now()),
      expires_at = timezone('utc', now()) + interval '30 days'
  where id = p_id;
  return p_response;
end;
$$;

create or replace function app_private.lock_friendship_pair(p_left uuid, p_right uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtextextended(
    least(p_left, p_right)::text || '|' || greatest(p_left, p_right)::text, 92801
  ));
$$;

-- Transactional outbox: creating a request through any RPC produces one initial push.
-- Resolution retires pending/processing pushes; workers also re-check before delivery.
create or replace function app_private.tg_friendship_push_outbox()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if new.flow = 'internal' and new.status = 'pending_recipient'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select coalesce(nullif(btrim(display_name), ''), 'Alguien') into v_name
    from public.user_profiles where id = new.inviter_user_id;
    insert into public.push_notification_events
      (recipient_user_id, notification_key, source_kind, source_item_id, title, body, href, metadata_json)
    values (
      new.target_user_id, 'friendship_invite:' || new.id || ':requires_you_response',
      'friendship_invite', new.id::text, 'Nueva invitacion',
      v_name || ' quiere conectar contigo en Happy Circles.', '/activity?category=friends',
      jsonb_build_object('actorUserId', new.inviter_user_id)
    ) on conflict (recipient_user_id, notification_key) do nothing;
  end if;
  if new.status in ('accepted', 'rejected', 'canceled', 'expired') then
    update public.push_notification_events
    set status = 'skipped', skipped_at = timezone('utc', now()),
        last_error = 'friendship_invite_resolved', worker_id = null, processing_started_at = null
    where source_kind = 'friendship_invite' and source_item_id = new.id::text
      and status in ('pending', 'processing');
  end if;
  return null;
end;
$$;
drop trigger if exists friendship_push_outbox on public.friendship_invites;
create trigger friendship_push_outbox after insert or update of status on public.friendship_invites
for each row execute function app_private.tg_friendship_push_outbox();

create or replace function public.friendship_push_event_is_current(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select event.status in ('pending', 'processing') and (
      event.source_kind <> 'friendship_invite'
      or exists (
        select 1 from public.friendship_invites invite
        where invite.id::text = event.source_item_id
          and (
            (invite.flow = 'internal' and invite.target_user_id = event.recipient_user_id
              and public.effective_friendship_invite_status(invite.status, invite.expires_at) = 'pending_recipient')
            or (invite.flow = 'external' and invite.inviter_user_id = event.recipient_user_id
              and public.effective_friendship_invite_status(invite.status, invite.expires_at) = 'pending_sender_review')
          )
      )
    ) from public.push_notification_events event where event.id = p_event_id
  ), false);
$$;

create or replace function app_private.remind_friendship_invite_locked(
  p_actor_user_id uuid, p_invite_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, app_private, pg_temp
as $$
declare
  v_invite public.friendship_invites%rowtype;
  v_response jsonb;
  v_reminder_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_next timestamptz;
  v_name text;
begin
  select * into v_invite from public.friendship_invites where id = p_invite_id for update;
  if not found then raise exception 'friendship_invite_not_found'; end if;
  if v_invite.inviter_user_id <> p_actor_user_id then raise exception 'invite_not_visible_to_actor'; end if;
  if v_invite.flow <> 'internal' then raise exception 'invite_not_internal'; end if;
  v_response := jsonb_build_object('inviteId', v_invite.id, 'flow', v_invite.flow,
    'status', public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
    'targetUserId', v_invite.target_user_id, 'expiresAt', v_invite.expires_at);
  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at) <> 'pending_recipient' then
    return v_response || jsonb_build_object('reminderStatus', 'resolved');
  end if;
  v_next := coalesce(v_invite.last_reminded_at, v_invite.created_at) + interval '60 seconds';
  if v_now < v_next then
    return v_response || jsonb_build_object('reminderStatus', 'cooldown', 'nextAllowedAt', v_next);
  end if;
  update public.friendship_invites
  set last_reminded_at = v_now, reminder_sequence = reminder_sequence + 1
  where id = v_invite.id returning * into v_invite;
  select coalesce(nullif(btrim(display_name), ''), 'Alguien') into v_name
  from public.user_profiles where id = p_actor_user_id;
  insert into public.push_notification_events
    (recipient_user_id, notification_key, source_kind, source_item_id, title, body, href, metadata_json)
  values (
    v_invite.target_user_id, 'friendship_invite:' || v_invite.id || ':reminder:' || v_invite.reminder_sequence,
    'friendship_invite', v_invite.id::text, 'Solicitud pendiente',
    v_name || ' te recuerda su solicitud para conectar.', '/activity?category=friends',
    jsonb_build_object('actorUserId', p_actor_user_id, 'reminderSequence', v_invite.reminder_sequence)
  ) returning id into v_reminder_id;
  perform public.append_audit_event(p_actor_user_id, 'friendship_invite', v_invite.id,
    'friendship_invite_reminder_requested', null, jsonb_build_object('reminder_id', v_reminder_id));
  return v_response || jsonb_build_object(
    'reminderStatus', 'queued', 'reminderId', v_reminder_id, 'nextAllowedAt', v_now + interval '60 seconds');
end;
$$;

create or replace function public.remind_friendship_invite(
  p_actor_user_id uuid, p_idempotency_key text, p_invite_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, app_private, pg_temp
as $$
declare
  v_command public.idempotency_keys%rowtype;
begin
  v_command := app_private.begin_friendship_command(p_actor_user_id,
    'remind_friendship_invite', p_idempotency_key, jsonb_build_object('inviteId', p_invite_id));
  if v_command.response_json is not null then return v_command.response_json; end if;
  return app_private.finish_friendship_command(v_command.id,
    app_private.remind_friendship_invite_locked(p_actor_user_id, p_invite_id));
end;
$$;

create or replace function public.create_internal_friendship_invite(
  p_actor_user_id uuid, p_idempotency_key text, p_target_user_id uuid, p_source_context text default null
)
returns jsonb language plpgsql security definer set search_path = public, app_private, pg_temp
as $$
declare
  v_command public.idempotency_keys%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_response jsonb;
  v_created boolean := false;
begin
  if p_target_user_id is null then raise exception 'target_user_required'; end if;
  if p_actor_user_id = p_target_user_id then raise exception 'cannot_invite_self'; end if;
  if not public.friendship_identity_ready(p_actor_user_id) then raise exception 'identity_incomplete'; end if;
  v_command := app_private.begin_friendship_command(p_actor_user_id,
    'create_internal_friendship_invite', p_idempotency_key,
    jsonb_build_object('targetUserId', p_target_user_id, 'sourceContext', nullif(btrim(p_source_context), '')));
  if v_command.response_json is not null then return v_command.response_json; end if;
  perform app_private.lock_friendship_pair(p_actor_user_id, p_target_user_id);
  update public.friendship_invites
  set status = 'expired', resolution_actor = 'system', resolution_reason = 'expired_before_internal_reuse',
      resolved_at = timezone('utc', now())
  where flow = 'internal' and status = 'pending_recipient' and expires_at <= timezone('utc', now())
    and least(inviter_user_id, target_user_id) = least(p_actor_user_id, p_target_user_id)
    and greatest(inviter_user_id, target_user_id) = greatest(p_actor_user_id, p_target_user_id);
  if exists (select 1 from public.relationships
    where user_low_id = least(p_actor_user_id, p_target_user_id)
      and user_high_id = greatest(p_actor_user_id, p_target_user_id) and status = 'active') then
    raise exception 'relationship_already_exists';
  end if;
  select * into v_invite from public.friendship_invites
  where flow = 'internal' and status = 'pending_recipient'
    and least(inviter_user_id, target_user_id) = least(p_actor_user_id, p_target_user_id)
    and greatest(inviter_user_id, target_user_id) = greatest(p_actor_user_id, p_target_user_id)
  order by created_at desc limit 1 for update;
  if found then
    if p_source_context = 'invite_requests_resend_pending' and v_invite.inviter_user_id = p_actor_user_id then
      v_response := app_private.remind_friendship_invite_locked(p_actor_user_id, v_invite.id);
      return app_private.finish_friendship_command(v_command.id, v_response);
    end if;
  else
    insert into public.friendship_invites
      (inviter_user_id, target_user_id, flow, origin_channel, status, source_context, expires_at)
    values (p_actor_user_id, p_target_user_id, 'internal', 'internal', 'pending_recipient',
      nullif(btrim(p_source_context), ''), timezone('utc', now()) + interval '7 days')
    returning * into v_invite;
    v_created := true;
    perform public.append_audit_event(p_actor_user_id, 'friendship_invite', v_invite.id,
      'friendship_invite_created', null, jsonb_build_object('flow', 'internal', 'origin_channel', 'internal',
      'target_user_id', p_target_user_id, 'source_context', nullif(btrim(p_source_context), '')));
  end if;
  v_response := jsonb_build_object('inviteId', v_invite.id, 'flow', v_invite.flow, 'status', v_invite.status, 'created', v_created,
    'targetUserId', v_invite.target_user_id, 'expiresAt', v_invite.expires_at,
    'friendshipDirection', case when v_invite.inviter_user_id = p_actor_user_id then 'outgoing' else 'incoming' end);
  return app_private.finish_friendship_command(v_command.id, v_response);
end;
$$;

create or replace function public.cancel_friendship_invite(
  p_actor_user_id uuid, p_idempotency_key text, p_invite_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, app_private, pg_temp
as $$
declare
  v_command public.idempotency_keys%rowtype;
  v_invite public.friendship_invites%rowtype;
begin
  v_command := app_private.begin_friendship_command(p_actor_user_id, 'cancel_friendship_invite',
    p_idempotency_key, jsonb_build_object('inviteId', p_invite_id));
  if v_command.response_json is not null then return v_command.response_json; end if;
  select * into v_invite from public.friendship_invites where id = p_invite_id for update;
  if not found then raise exception 'friendship_invite_not_found'; end if;
  if v_invite.inviter_user_id <> p_actor_user_id then raise exception 'invite_not_visible_to_actor'; end if;
  if v_invite.status in ('pending_recipient', 'pending_claim', 'pending_sender_review') then
    update public.friendship_invites
    set status = case when expires_at <= timezone('utc', now()) then 'expired'::public.friendship_invite_status else 'canceled'::public.friendship_invite_status end,
        resolution_actor = case when expires_at <= timezone('utc', now()) then 'system'::public.friendship_invite_resolution_actor else 'sender'::public.friendship_invite_resolution_actor end,
        resolution_reason = case when expires_at <= timezone('utc', now()) then 'expired_before_cancel' else 'sender_canceled' end,
        resolved_at = timezone('utc', now())
    where id = v_invite.id returning * into v_invite;
    update public.friendship_invite_deliveries
    set status = 'revoked', revoked_at = coalesce(revoked_at, timezone('utc', now()))
    where invite_id = v_invite.id and status = 'issued' and revoked_at is null;
    perform public.append_audit_event(p_actor_user_id, 'friendship_invite', v_invite.id,
      'friendship_invite_canceled', null, jsonb_build_object('flow', v_invite.flow, 'origin_channel', v_invite.origin_channel));
  end if;
  return app_private.finish_friendship_command(v_command.id, jsonb_build_object(
    'inviteId', v_invite.id, 'status', v_invite.status, 'resolvedAt', v_invite.resolved_at,
    'relationshipId', v_invite.relationship_id));
end;
$$;

revoke all on function app_private.begin_friendship_command(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function app_private.finish_friendship_command(uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.lock_friendship_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.tg_friendship_push_outbox() from public, anon, authenticated;
revoke all on function app_private.remind_friendship_invite_locked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remind_friendship_invite(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.friendship_push_event_is_current(uuid) from public, anon, authenticated;
revoke all on function public.create_internal_friendship_invite(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_friendship_invite(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.remind_friendship_invite(uuid, text, uuid) to service_role;
grant execute on function public.friendship_push_event_is_current(uuid) to service_role;
grant execute on function public.create_internal_friendship_invite(uuid, text, uuid, text) to service_role;
grant execute on function public.cancel_friendship_invite(uuid, text, uuid) to service_role;

insert into app_private.backend_secrets (name, secret)
values ('friendship_delivery_hmac_v1', extensions.gen_random_bytes(32))
on conflict (name) do nothing;

create or replace function public.create_external_friendship_invite(
  p_actor_user_id uuid, p_idempotency_key text, p_channel public.friendship_invite_channel,
  p_source_context text default null, p_intended_recipient_alias text default null,
  p_intended_recipient_phone_e164 text default null, p_intended_recipient_phone_label text default null
)
returns jsonb language plpgsql security definer set search_path = public, app_private, extensions, pg_temp
as $$
declare
  v_command public.idempotency_keys%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_response jsonb;
  v_token text;
  v_alias text := nullif(btrim(p_intended_recipient_alias), '');
  v_phone text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_label text := nullif(btrim(p_intended_recipient_phone_label), '');
  v_source text := nullif(btrim(p_source_context), '');
  v_expires timestamptz;
begin
  if p_channel not in ('remote', 'qr') then raise exception 'external_channel_required'; end if;
  if p_channel = 'remote' and (v_alias is null or v_phone is null) then raise exception 'contact_reference_required'; end if;
  if not public.friendship_identity_ready(p_actor_user_id) then raise exception 'identity_incomplete'; end if;
  v_command := app_private.begin_friendship_command(p_actor_user_id, 'create_external_friendship_invite',
    p_idempotency_key, jsonb_build_object('channel', p_channel, 'sourceContext', v_source,
      'alias', v_alias, 'phone', v_phone, 'label', v_label));
  select encode(extensions.hmac(convert_to(p_actor_user_id::text || '|' || v_command.id::text,
    'UTF8'), secret, 'sha256'), 'hex') into v_token
  from app_private.backend_secrets where name = 'friendship_delivery_hmac_v1';
  if v_token is null then raise exception 'friendship_token_secret_unavailable'; end if;
  if v_command.response_json is not null then
    if v_command.response_json ? 'deliveryToken' then return v_command.response_json; end if;
    if not exists (select 1 from public.friendship_invite_deliveries
      where id = (v_command.response_json ->> 'deliveryId')::uuid
        and token_hash = public.hash_invite_token(v_token)) then
      raise exception 'legacy_idempotency_replay_unavailable';
    end if;
    return v_command.response_json || jsonb_build_object('deliveryToken', v_token);
  end if;
  -- Sender/intent lock also covers the absent-row case in concurrent creation.
  perform pg_advisory_xact_lock(hashtextextended(
    p_actor_user_id::text || '|' || p_channel::text || '|' || coalesce(v_phone, '') || '|' || coalesce(v_alias, ''), 92802));
  update public.friendship_invites
  set status = 'expired', resolution_actor = 'system', resolution_reason = 'claim_window_expired',
      resolved_at = timezone('utc', now())
  where inviter_user_id = p_actor_user_id and flow = 'external' and origin_channel = p_channel
    and coalesce(intended_recipient_phone_e164, '') = coalesce(v_phone, '')
    and coalesce(intended_recipient_alias, '') = coalesce(v_alias, '')
    and status in ('pending_claim', 'pending_sender_review') and expires_at <= timezone('utc', now());
  select * into v_invite from public.friendship_invites
  where inviter_user_id = p_actor_user_id and flow = 'external' and status = 'pending_claim'
    and origin_channel = p_channel
    and coalesce(intended_recipient_phone_e164, '') = coalesce(v_phone, '')
    and coalesce(intended_recipient_alias, '') = coalesce(v_alias, '')
  order by created_at desc limit 1 for update;
  if not found then
    insert into public.friendship_invites
      (inviter_user_id, flow, origin_channel, status, intended_recipient_alias,
       intended_recipient_phone_e164, intended_recipient_phone_label, source_context, expires_at)
    values (p_actor_user_id, 'external', p_channel, 'pending_claim', v_alias, v_phone, v_label,
      v_source, timezone('utc', now()) + interval '7 days') returning * into v_invite;
    perform public.append_audit_event(p_actor_user_id, 'friendship_invite', v_invite.id,
      'friendship_invite_created', null, jsonb_build_object('flow', 'external', 'origin_channel', p_channel,
      'source_context', v_source, 'intended_recipient_alias', v_alias,
      'intended_recipient_phone_e164', v_phone, 'intended_recipient_phone_label', v_label));
  end if;
  v_expires := timezone('utc', now()) + case when p_channel = 'remote' then interval '7 days' else interval '10 minutes' end;
  update public.friendship_invites
  set intended_recipient_phone_label = coalesce(v_label, intended_recipient_phone_label),
      source_context = coalesce(v_source, source_context),
      expires_at = case when p_channel = 'remote' then v_expires else expires_at end
  where id = v_invite.id returning * into v_invite;
  if p_channel = 'qr' then
    update public.friendship_invite_deliveries
    set status = 'revoked', revoked_at = coalesce(revoked_at, timezone('utc', now()))
    where invite_id = v_invite.id and channel = 'qr' and status = 'issued' and revoked_at is null;
  end if;
  insert into public.friendship_invite_deliveries
    (invite_id, token_hash, channel, source_context, status, expires_at)
  values (v_invite.id, public.hash_invite_token(v_token), p_channel, v_source, 'issued', v_expires)
  returning * into v_delivery;
  perform public.append_audit_event(p_actor_user_id, 'friendship_invite', v_invite.id,
    'friendship_invite_delivery_created', null,
    jsonb_build_object('delivery_id', v_delivery.id, 'channel', p_channel, 'source_context', v_source,
      'intended_recipient_alias', v_alias, 'intended_recipient_phone_e164', v_phone,
      'intended_recipient_phone_label', v_label, 'expires_at', v_expires));
  v_response := jsonb_build_object('inviteId', v_invite.id, 'deliveryId', v_delivery.id,
    'flow', v_invite.flow, 'status', v_invite.status, 'channel', p_channel, 'originChannel', v_invite.origin_channel,
    'expiresAt', v_delivery.expires_at, 'inviteExpiresAt', v_invite.expires_at,
    'intendedRecipientAlias', v_alias, 'intendedRecipientPhoneE164', v_phone, 'intendedRecipientPhoneLabel', v_label);
  perform app_private.finish_friendship_command(v_command.id, v_response);
  return v_response || jsonb_build_object('deliveryToken', v_token);
end;
$$;
revoke all on function public.create_external_friendship_invite(uuid, text, public.friendship_invite_channel, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_external_friendship_invite(uuid, text, public.friendship_invite_channel, text, text, text, text)
  to service_role;


-- Latest policy-preserving overrides; expiry and lock ordering are the only claim changes.
create or replace function public.respond_internal_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_relationship_id uuid;
  v_response jsonb;
begin
  if p_decision not in ('accept', 'reject') then
    raise exception 'invalid_internal_decision';
  end if;

  v_idempotency := app_private.begin_friendship_command(p_actor_user_id,
    'respond_internal_friendship_invite', p_idempotency_key, jsonb_build_object('inviteId', p_invite_id, 'decision', p_decision));

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  -- Read the pair before locking the invite, then re-read under its row lock.
  select * into v_invite from public.friendship_invites where id = p_invite_id;
  if found and v_invite.target_user_id is not null then
    perform app_private.lock_friendship_pair(v_invite.inviter_user_id, v_invite.target_user_id);
  end if;
  select * into v_invite from public.friendship_invites where id = p_invite_id for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  if v_invite.flow <> 'internal' then
    raise exception 'invite_not_internal';
  end if;

  if v_invite.target_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_response'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.status <> 'pending_recipient' then
    return app_private.finish_friendship_command(v_idempotency.id, jsonb_build_object(
      'inviteId', v_invite.id, 'status', v_invite.status,
      'relationshipId', v_invite.relationship_id, 'resolvedAt', v_invite.resolved_at));
  end if;

  if p_decision = 'accept' then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, p_actor_user_id),
      greatest(v_invite.inviter_user_id, p_actor_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id)
    do update set status = 'active'
    returning id into v_relationship_id;

    update public.friendship_invites
    set relationship_id = v_relationship_id,
        status = 'accepted',
        resolution_actor = 'recipient',
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.ensure_relationship_accounts(v_relationship_id);

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_accepted',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'target_user_id', p_actor_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'relationshipId', v_relationship_id
    );
  else
    update public.friendship_invites
    set status = 'rejected',
        resolution_actor = 'recipient',
        resolution_reason = 'recipient_rejected',
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_rejected',
      null,
      jsonb_build_object(
        'target_user_id', p_actor_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'resolvedAt', v_invite.resolved_at
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.review_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_relationship_id uuid;
  v_response jsonb;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid_review_decision';
  end if;

  v_idempotency := app_private.begin_friendship_command(p_actor_user_id,
    'review_external_friendship_invite', p_idempotency_key, jsonb_build_object('inviteId', p_invite_id, 'decision', p_decision));

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  -- Read the pair before locking the invite, then re-read under its row lock.
  select * into v_invite from public.friendship_invites where id = p_invite_id;
  if found and v_invite.claimant_user_id is not null then
    perform app_private.lock_friendship_pair(v_invite.inviter_user_id, v_invite.claimant_user_id);
  end if;
  select * into v_invite from public.friendship_invites where id = p_invite_id for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  if v_invite.flow <> 'external' then
    raise exception 'invite_not_external';
  end if;

  if v_invite.inviter_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_review'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.status <> 'pending_sender_review' then
    return app_private.finish_friendship_command(v_idempotency.id, jsonb_build_object(
      'inviteId', v_invite.id, 'status', v_invite.status,
      'relationshipId', v_invite.relationship_id, 'resolvedAt', v_invite.resolved_at));
  end if;

  if v_invite.claimant_user_id is null then
    raise exception 'invite_missing_claimant';
  end if;

  if p_decision = 'approve' then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, v_invite.claimant_user_id),
      greatest(v_invite.inviter_user_id, v_invite.claimant_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id)
    do update set status = 'active'
    returning id into v_relationship_id;

    update public.friendship_invites
    set relationship_id = v_relationship_id,
        status = 'accepted',
        resolution_actor = 'sender',
        resolution_reason = null,
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.ensure_relationship_accounts(v_relationship_id);

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_sender_approved',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_accepted',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'relationshipId', v_relationship_id
    );
  else
    update public.friendship_invites
    set status = 'rejected',
        resolution_actor = 'sender',
        resolution_reason = 'sender_rejected_claimant',
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_sender_rejected',
      null,
      jsonb_build_object(
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_rejected',
      null,
      jsonb_build_object(
        'claimant_user_id', v_invite.claimant_user_id
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'status', v_invite.status,
      'resolvedAt', v_invite.resolved_at
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

create or replace function public.get_friendship_invite_preview(
  p_actor_user_id uuid,
  p_delivery_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_inviter_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
  v_actor_role text := 'none';
  v_flags jsonb;
  v_invite_status public.friendship_invite_status;
  v_delivery_status public.friendship_invite_delivery_status;
  v_reason text := 'ready';
begin
  perform public.assert_request_actor(p_actor_user_id);

  select *
    into v_delivery
  from public.friendship_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'friendship_delivery_not_found';
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where id = v_delivery.invite_id
  for update;

  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  -- Match cancellation's invite -> delivery order.
  select * into v_delivery from public.friendship_invite_deliveries where id = v_delivery.id for update;
  if not found then raise exception 'friendship_delivery_not_found'; end if;

  v_invite_status := public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at);
  v_delivery_status := public.effective_friendship_delivery_status(
    v_delivery.status,
    v_delivery.expires_at,
    v_delivery.revoked_at
  );

  if v_invite.status <> v_invite_status then
    update public.friendship_invites
    set status = v_invite_status,
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_preview'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_delivery.status <> v_delivery_status then
    update public.friendship_invite_deliveries
    set status = v_delivery_status,
        revoked_at = case when v_delivery_status = 'revoked' then coalesce(revoked_at, timezone('utc', now())) else revoked_at end
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  select *
    into v_inviter_profile
  from public.user_profiles
  where id = v_invite.inviter_user_id;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(v_invite.inviter_user_id, p_actor_user_id)
    and user_high_id = greatest(v_invite.inviter_user_id, p_actor_user_id)
    and status = 'active';

  if p_actor_user_id = v_invite.inviter_user_id then
    v_actor_role := 'sender';
  elsif p_actor_user_id = v_invite.target_user_id then
    v_actor_role := 'recipient';
  elsif p_actor_user_id = v_invite.claimant_user_id then
    v_actor_role := 'claimant';
  end if;

  v_flags := public.friendship_identity_flags(p_actor_user_id);

  if v_invite_status in ('accepted', 'rejected', 'canceled', 'expired') then
    v_reason := v_invite_status::text;
  elsif p_actor_user_id = v_invite.inviter_user_id then
    v_reason := case
      when v_invite_status = 'pending_sender_review' then 'sender_review'
      else 'sender_view'
    end;
  elsif v_existing_relationship_id is not null then
    v_reason := 'already_connected';
  elsif not public.friendship_identity_ready(p_actor_user_id) then
    v_reason := 'identity_incomplete';
  elsif v_delivery_status = 'expired' then
    v_reason := 'expired';
  elsif v_delivery_status = 'revoked' then
    v_reason := 'delivery_revoked';
  elsif v_invite_status = 'pending_sender_review' and v_invite.claimant_user_id is not null and v_invite.claimant_user_id <> p_actor_user_id then
    v_reason := 'claimed_by_other';
  end if;

  return jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'flow', v_invite.flow,
    'status', v_invite_status,
    'deliveryStatus', v_delivery_status,
    'channel', v_delivery.channel,
    'originChannel', v_invite.origin_channel,
    'expiresAt', case
      when v_invite_status = 'pending_claim' then v_delivery.expires_at
      else v_invite.expires_at
    end,
    'resolvedAt', v_invite.resolved_at,
    'actorRole', v_actor_role,
    'inviterDisplayName', coalesce(v_inviter_profile.display_name, 'Persona'),
    'inviterAvatarPath', v_inviter_profile.avatar_path,
    'intendedRecipientAlias', v_invite.intended_recipient_alias,
    'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
    'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label,
    'claimantSnapshot', v_invite.claimant_snapshot,
    'identityFlags', v_flags,
    'canClaim',
      v_invite.flow = 'external'
      and v_invite_status = 'pending_claim'
      and v_delivery_status = 'issued'
      and p_actor_user_id <> v_invite.inviter_user_id
      and v_existing_relationship_id is null
      and public.friendship_identity_ready(p_actor_user_id),
    'canApprove',
      v_invite.flow = 'external'
      and v_actor_role = 'sender'
      and v_invite_status = 'pending_sender_review',
    'canReject',
      (
        v_invite.flow = 'external'
        and v_actor_role = 'sender'
        and v_invite_status = 'pending_sender_review'
      )
      or (
        v_invite.flow = 'internal'
        and v_actor_role = 'recipient'
        and v_invite_status = 'pending_recipient'
      ),
    'canRespond',
      v_invite.flow = 'internal'
      and v_actor_role = 'recipient'
      and v_invite_status = 'pending_recipient',
    'reason', v_reason
  );
end;
$$;

create or replace function public.claim_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
  v_relationship_id uuid;
  v_phone_identity_matches boolean := false;
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  v_idempotency := app_private.begin_friendship_command(p_actor_user_id,
    'claim_external_friendship_invite', p_idempotency_key, jsonb_build_object('deliveryTokenHash', public.hash_invite_token(p_delivery_token)));

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select * into v_delivery
  from public.friendship_invite_deliveries
  where token_hash = public.hash_invite_token(p_delivery_token)
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'friendship_delivery_not_found';
  end if;
  select * into v_invite from public.friendship_invites where id = v_delivery.invite_id;
  if found then perform app_private.lock_friendship_pair(v_invite.inviter_user_id, p_actor_user_id); end if;
  select * into v_invite from public.friendship_invites where id = v_delivery.invite_id for update;
  if not found then
    raise exception 'friendship_invite_not_found';
  end if;

  select * into v_delivery from public.friendship_invite_deliveries where id = v_delivery.id for update;
  if not found then raise exception 'friendship_delivery_not_found'; end if;

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at)
      <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(status, expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_claim'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;
  if public.effective_friendship_delivery_status(
      v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at
    ) <> v_delivery.status then
    update public.friendship_invite_deliveries
    set status = public.effective_friendship_delivery_status(status, expires_at, revoked_at)
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  if v_invite.flow <> 'external' then raise exception 'invite_not_external'; end if;
  if v_invite.inviter_user_id = p_actor_user_id then raise exception 'cannot_claim_own_invite'; end if;
  if v_invite.claimant_user_id is not null and v_invite.claimant_user_id <> p_actor_user_id then
    raise exception 'invite_already_claimed';
  end if;
  if v_invite.status <> 'pending_claim' then
    return app_private.finish_friendship_command(v_idempotency.id, jsonb_build_object(
      'inviteId', v_invite.id, 'deliveryId', v_delivery.id, 'status', v_invite.status,
      'relationshipId', v_invite.relationship_id, 'resolvedAt', v_invite.resolved_at));
  end if;
  if v_delivery.status <> 'issued' then
    if v_delivery.status = 'expired' then raise exception 'delivery_expired'; end if;
    raise exception 'delivery_not_available';
  end if;
  select id into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(v_invite.inviter_user_id, p_actor_user_id)
    and user_high_id = greatest(v_invite.inviter_user_id, p_actor_user_id)
    and status = 'active';
  if v_existing_relationship_id is not null then
    raise exception 'relationship_already_exists';
  end if;

  select * into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id;
  if not found then raise exception 'actor_profile_not_found'; end if;

  v_phone_identity_matches :=
    public.profile_phone_identity_ready(v_actor_profile)
    and v_invite.intended_recipient_phone_e164 is not null
    and nullif(btrim(v_actor_profile.phone_e164), '') is not null
    and btrim(v_actor_profile.phone_e164) = btrim(v_invite.intended_recipient_phone_e164);

  update public.friendship_invite_deliveries
  set status = 'claimed', claimed_at = timezone('utc', now()), claimed_by_user_id = p_actor_user_id
  where id = v_delivery.id
  returning * into v_delivery;
  update public.friendship_invite_deliveries
  set status = 'revoked', revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where invite_id = v_invite.id and id <> v_delivery.id and status = 'issued' and revoked_at is null;

  perform public.append_audit_event(
    p_actor_user_id, 'friendship_invite', v_invite.id, 'friendship_invite_claimed', null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', v_delivery.channel,
      'claimed_by_user_id', p_actor_user_id,
      'phone_was_verified', v_actor_profile.phone_verified_at is not null,
      'phone_identity_source', case
        when v_actor_profile.phone_verified_at is not null then 'verified'
        when v_actor_profile.phone_identity_legacy_at is not null then 'legacy'
        else null
      end,
      'auto_accepted', v_phone_identity_matches
    )
  );

  if v_phone_identity_matches then
    insert into public.relationships (user_low_id, user_high_id, status)
    values (
      least(v_invite.inviter_user_id, p_actor_user_id),
      greatest(v_invite.inviter_user_id, p_actor_user_id),
      'active'
    )
    on conflict (user_low_id, user_high_id) do update set status = 'active'
    returning id into v_relationship_id;

    update public.friendship_invites
    set claimant_user_id = p_actor_user_id,
        claimant_snapshot = public.build_friendship_claimant_snapshot(p_actor_user_id),
        relationship_id = v_relationship_id,
        status = 'accepted',
        resolution_actor = 'system',
        resolution_reason = 'claim_phone_match_auto_accepted',
        resolved_at = timezone('utc', now())
    where id = v_invite.id
    returning * into v_invite;
    perform public.ensure_relationship_accounts(v_relationship_id);
    perform public.append_audit_event(
      p_actor_user_id, 'friendship_invite', v_invite.id, 'friendship_invite_accepted', null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimed_by_user_id', p_actor_user_id,
        'resolution_reason', 'claim_phone_match_auto_accepted'
      )
    );
    v_response := jsonb_build_object(
      'inviteId', v_invite.id, 'deliveryId', v_delivery.id,
      'status', v_invite.status, 'resolvedAt', v_invite.resolved_at,
      'relationshipId', v_relationship_id
    );
  else
    update public.friendship_invites
    set claimant_user_id = p_actor_user_id,
        claimant_snapshot = public.build_friendship_claimant_snapshot(p_actor_user_id),
        status = 'pending_sender_review',
        expires_at = timezone('utc', now()) + interval '72 hours'
    where id = v_invite.id
    returning * into v_invite;
    v_response := jsonb_build_object(
      'inviteId', v_invite.id, 'deliveryId', v_delivery.id,
      'status', v_invite.status, 'expiresAt', v_invite.expires_at,
      'actorRole', 'claimant'
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response,
      completed_at = timezone('utc', now()),
      expires_at = timezone('utc', now()) + interval '30 days'
  where id = v_idempotency.id;
  return v_response;
end;
$$;

create or replace function public.resolve_people_targets(
  p_actor_user_id uuid,
  p_phone_e164_list text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if coalesce(cardinality(p_phone_e164_list), 0) > 60 then
    raise exception 'contact_batch_too_large';
  end if;
  with input_numbers as (
    select ordinality as position, nullif(btrim(phone_e164), '') as phone_e164
    from unnest(coalesce(p_phone_e164_list, array[]::text[]))
      with ordinality as input(phone_e164, ordinality)
  ),
  matched_profiles as (
    select input.position,
           input.phone_e164,
           profile.id as matched_user_id,
           profile.display_name,
           profile.avatar_path,
           profile.account_access_state
    from input_numbers input
    left join public.user_profiles profile
      on profile.phone_e164 = input.phone_e164
     and public.profile_phone_identity_ready(profile)
     and profile.id <> p_actor_user_id
  ),
  relationship_matches as (
    select matched.position, relationship.id as relationship_id
    from matched_profiles matched
    join public.relationships relationship
      on relationship.user_low_id = least(p_actor_user_id, matched.matched_user_id)
     and relationship.user_high_id = greatest(p_actor_user_id, matched.matched_user_id)
     and relationship.status = 'active'
  ),
  friendship_matches as (
    select distinct on (matched.position) matched.position, invite.id as invite_id, invite.inviter_user_id
    from matched_profiles matched
    join public.friendship_invites invite
      on invite.flow = 'internal'
     and public.effective_friendship_invite_status(invite.status, invite.expires_at) = 'pending_recipient'
     and least(invite.inviter_user_id, invite.target_user_id) = least(p_actor_user_id, matched.matched_user_id)
     and greatest(invite.inviter_user_id, invite.target_user_id) = greatest(p_actor_user_id, matched.matched_user_id)
    order by matched.position, invite.created_at desc
  ),
  account_matches as (
    select distinct on (input.position)
      input.position,
      invite.id as account_invite_id,
      public.effective_account_invite_status(invite.status, invite.expires_at) as invite_status
    from input_numbers input
    join public.account_invites invite
      on invite.inviter_user_id = p_actor_user_id
     and invite.intended_recipient_phone_e164 = input.phone_e164
     and public.effective_account_invite_status(invite.status, invite.expires_at)
       in ('pending_activation', 'pending_inviter_review')
    order by input.position, invite.created_at desc
  )
  select jsonb_agg(
    jsonb_build_object(
      'phoneE164', input.phone_e164,
      'status', case
        when input.phone_e164 is null then 'no_account'
        when relationship.relationship_id is not null then 'already_related'
        when matched.matched_user_id is not null
          and matched.account_access_state = 'active'
          and friendship.invite_id is not null then 'pending_friendship'
        when matched.matched_user_id is not null
          and matched.account_access_state = 'active' then 'active_user'
        when matched.matched_user_id is not null then 'pending_activation'
        when account.account_invite_id is not null then 'pending_activation'
        else 'no_account'
      end,
      'matchedUserId', matched.matched_user_id,
      'displayName', matched.display_name,
      'avatarPath', matched.avatar_path,
      'relationshipId', relationship.relationship_id,
      'friendshipInviteId', friendship.invite_id,
      'accountInviteId', account.account_invite_id,
      'accountInviteStatus', account.invite_status,
      'friendshipDirection', case when friendship.invite_id is null then null
        when friendship.inviter_user_id = p_actor_user_id then 'outgoing' else 'incoming' end,
      'availableActions', case
        when relationship.relationship_id is not null then jsonb_build_array('view')
        when matched.account_access_state = 'active' and friendship.invite_id is not null
          and friendship.inviter_user_id = p_actor_user_id then jsonb_build_array('cancel', 'remind')
        when matched.account_access_state = 'active' and friendship.invite_id is not null then jsonb_build_array('accept', 'reject')
        when matched.account_access_state = 'active' then jsonb_build_array('add')
        when matched.matched_user_id is not null or account.account_invite_id is not null then jsonb_build_array('view')
        else jsonb_build_array('invite') end
    ) order by input.position
  ) into v_response
  from input_numbers input
  left join matched_profiles matched on matched.position = input.position
  left join relationship_matches relationship on relationship.position = input.position
  left join friendship_matches friendship on friendship.position = input.position
  left join account_matches account on account.position = input.position;

  return coalesce(v_response, '[]'::jsonb);
end;
$$;

create or replace function public.create_people_outreach(
  p_actor_user_id uuid, p_idempotency_key text, p_channel public.account_invite_channel,
  p_source_context text default null, p_intended_recipient_alias text default null,
  p_intended_recipient_phone_e164 text default null, p_intended_recipient_phone_label text default null
)
returns jsonb language plpgsql security definer set search_path = public, app_private, pg_temp
as $$
declare
  v_phone text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_target public.user_profiles%rowtype;
  v_target_found boolean;
  v_command public.idempotency_keys%rowtype;
  v_relationship_id uuid;
  v_result jsonb;
  v_response jsonb;
begin
  perform public.assert_request_actor(p_actor_user_id);
  if v_phone is null then raise exception 'contact_phone_required'; end if;
  v_command := app_private.begin_friendship_command(p_actor_user_id, 'create_people_outreach', p_idempotency_key,
    jsonb_build_object('phone', v_phone, 'channel', p_channel, 'sourceContext', nullif(btrim(p_source_context), ''),
      'alias', nullif(btrim(p_intended_recipient_alias), ''), 'label', nullif(btrim(p_intended_recipient_phone_label), '')));
  if v_command.response_json is not null then
    -- Account tokens remain outside response_json and are re-derived by their existing RPC.
    if v_command.response_json ->> 'kind' <> 'account_invite' then return v_command.response_json; end if;
    v_result := public.create_account_invite(p_actor_user_id, p_idempotency_key, p_channel, p_source_context,
      p_intended_recipient_alias, v_phone, p_intended_recipient_phone_label);
    return jsonb_set(v_command.response_json, '{result}', v_result);
  end if;
  select * into v_target from public.user_profiles
  where phone_e164 = v_phone and public.profile_phone_identity_ready(user_profiles) and id <> p_actor_user_id
  limit 1;
  v_target_found := found;
  if v_target_found and v_target.account_access_state = 'active' then
    select id into v_relationship_id from public.relationships
    where user_low_id = least(p_actor_user_id, v_target.id)
      and user_high_id = greatest(p_actor_user_id, v_target.id) and status = 'active';
    if v_relationship_id is null then
      -- This command owns expiry, pairing and absent-row serialization. Do not
      -- short circuit here using the raw pending status or hold its locks backwards.
      begin
        v_result := public.create_internal_friendship_invite(p_actor_user_id, p_idempotency_key, v_target.id, p_source_context);
      exception when others then
        if sqlerrm <> 'relationship_already_exists' then raise; end if;
        select id into v_relationship_id from public.relationships
        where user_low_id = least(p_actor_user_id, v_target.id)
          and user_high_id = greatest(p_actor_user_id, v_target.id) and status = 'active';
        if v_relationship_id is null then raise; end if;
      end;
    end if;
    if v_relationship_id is not null then
      v_response := jsonb_build_object('kind', 'already_related', 'status', 'already_related',
        'relationshipId', v_relationship_id, 'matchedUserId', v_target.id, 'displayName', v_target.display_name);
    else
      v_response := jsonb_build_object('kind', 'friendship',
        'status', case when coalesce((v_result ->> 'created')::boolean, false) then 'active_user' else 'pending_friendship' end,
        'inviteId', v_result ->> 'inviteId', 'friendshipDirection', v_result ->> 'friendshipDirection',
        'matchedUserId', v_target.id, 'displayName', v_target.display_name, 'result', v_result);
    end if;
  else
    v_result := public.create_account_invite(p_actor_user_id, p_idempotency_key, p_channel, p_source_context,
      p_intended_recipient_alias, v_phone, p_intended_recipient_phone_label);
    v_response := jsonb_build_object('kind', 'account_invite',
      'status', case when v_target_found then 'pending_activation' else 'no_account' end,
      'matchedUserId', case when v_target_found then v_target.id else null end,
      'displayName', case when v_target_found then v_target.display_name else null end, 'result', v_result);
  end if;
  perform app_private.finish_friendship_command(v_command.id, v_response #- '{result,deliveryToken}');
  return v_response;
end;
$$;
