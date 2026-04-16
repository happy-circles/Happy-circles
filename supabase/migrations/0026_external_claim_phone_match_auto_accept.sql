create or replace function public.claim_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_delivery_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_actor_profile public.user_profiles%rowtype;
  v_existing_relationship_id uuid;
  v_relationship_id uuid;
  v_phone_matches_intended boolean := false;
  v_response jsonb;
begin
  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'claim_external_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'claim_external_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_delivery
  from public.friendship_invite_deliveries
  where token = btrim(p_delivery_token)
  order by created_at desc
  limit 1
  for update;

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

  if public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at) <> v_invite.status then
    update public.friendship_invites
    set status = public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
        resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
        resolution_reason = coalesce(resolution_reason, 'expired_before_claim'),
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if public.effective_friendship_delivery_status(v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at) <> v_delivery.status then
    update public.friendship_invite_deliveries
    set status = public.effective_friendship_delivery_status(v_delivery.status, v_delivery.expires_at, v_delivery.revoked_at)
    where id = v_delivery.id
    returning * into v_delivery;
  end if;

  if v_invite.flow <> 'external' then
    raise exception 'invite_not_external';
  end if;

  if v_invite.inviter_user_id = p_actor_user_id then
    raise exception 'cannot_claim_own_invite';
  end if;

  if v_invite.status <> 'pending_claim' then
    raise exception 'invite_not_pending_claim';
  end if;

  if v_delivery.status <> 'issued' then
    if v_delivery.status = 'expired' then
      raise exception 'delivery_expired';
    end if;
    raise exception 'delivery_not_available';
  end if;

  if v_invite.claimant_user_id is not null and v_invite.claimant_user_id <> p_actor_user_id then
    raise exception 'invite_already_claimed';
  end if;

  select id
    into v_existing_relationship_id
  from public.relationships
  where user_low_id = least(v_invite.inviter_user_id, p_actor_user_id)
    and user_high_id = greatest(v_invite.inviter_user_id, p_actor_user_id)
    and status = 'active';

  if v_existing_relationship_id is not null then
    raise exception 'relationship_already_exists';
  end if;

  select *
    into v_actor_profile
  from public.user_profiles
  where id = p_actor_user_id;

  if not found then
    raise exception 'actor_profile_not_found';
  end if;

  v_phone_matches_intended :=
    v_invite.intended_recipient_phone_e164 is not null
    and nullif(btrim(v_actor_profile.phone_e164), '') is not null
    and btrim(v_actor_profile.phone_e164) = btrim(v_invite.intended_recipient_phone_e164);

  update public.friendship_invite_deliveries
  set status = 'claimed',
      claimed_at = timezone('utc', now()),
      claimed_by_user_id = p_actor_user_id
  where id = v_delivery.id
  returning * into v_delivery;

  update public.friendship_invite_deliveries
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where invite_id = v_invite.id
    and id <> v_delivery.id
    and status = 'issued'
    and revoked_at is null;

  perform public.append_audit_event(
    p_actor_user_id,
    'friendship_invite',
    v_invite.id,
    'friendship_invite_claimed',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', v_delivery.channel,
      'claimed_by_user_id', p_actor_user_id,
      'auto_accepted', v_phone_matches_intended
    )
  );

  if v_phone_matches_intended then
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
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_accepted',
      null,
      jsonb_build_object(
        'relationship_id', v_relationship_id,
        'claimed_by_user_id', p_actor_user_id,
        'resolution_reason', 'claim_phone_match_auto_accepted'
      )
    );

    v_response := jsonb_build_object(
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'status', v_invite.status,
      'resolvedAt', v_invite.resolved_at,
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
      'inviteId', v_invite.id,
      'deliveryId', v_delivery.id,
      'status', v_invite.status,
      'expiresAt', v_invite.expires_at,
      'actorRole', 'claimant'
    );
  end if;

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;
