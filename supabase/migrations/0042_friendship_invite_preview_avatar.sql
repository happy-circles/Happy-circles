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
