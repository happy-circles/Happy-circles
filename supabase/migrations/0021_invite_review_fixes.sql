alter view public.v_relationship_invites_live set (security_invoker = true);
alter view public.v_contact_invites_live set (security_invoker = true);

create or replace function public.accept_invite_by_token(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.relationship_invites%rowtype;
  v_relationship_id uuid;
  v_existing_relationship_id uuid;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'accept_invite_by_token', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'accept_invite_by_token'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.relationship_invites
  where invite_token = btrim(p_invite_token)
    and target_mode = 'share_link'
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'relationship_invite_not_found';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= timezone('utc', now()) then
    update public.relationship_invites
    set status = 'expired',
        resolved_at = coalesce(resolved_at, timezone('utc', now()))
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if v_invite.inviter_user_id = p_actor_user_id then
    raise exception 'cannot_accept_own_invite';
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

  if v_invite.status = 'expired' then
    raise exception 'invite_expired';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  insert into public.relationships (user_low_id, user_high_id, status)
  values (
    least(v_invite.inviter_user_id, p_actor_user_id),
    greatest(v_invite.inviter_user_id, p_actor_user_id),
    'active'
  )
  on conflict (user_low_id, user_high_id)
  do update set status = 'active'
  returning id into v_relationship_id;

  update public.relationship_invites
  set invitee_user_id = p_actor_user_id,
      status = 'accepted',
      accepted_by_user_id = p_actor_user_id,
      resolved_at = timezone('utc', now())
  where id = v_invite.id;

  perform public.ensure_relationship_accounts(v_relationship_id);

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship',
    v_relationship_id,
    'relationship_accepted',
    null,
    jsonb_build_object(
      'invite_id', v_invite.id,
      'target_mode', v_invite.target_mode,
      'channel_label', v_invite.channel_label
    )
  );

  v_response := jsonb_build_object(
    'relationshipId', v_relationship_id,
    'status', 'active',
    'inviteStatus', 'accepted'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;
