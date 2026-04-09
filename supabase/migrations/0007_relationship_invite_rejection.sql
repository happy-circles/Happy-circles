create or replace function public.reject_relationship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.relationship_invites%rowtype;
  v_response jsonb;
begin
  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'reject_relationship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'reject_relationship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.relationship_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'relationship_invite_not_found';
  end if;

  if v_invite.invitee_user_id <> p_actor_user_id then
    raise exception 'invite_not_visible_to_actor';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite_not_pending';
  end if;

  update public.relationship_invites
  set status = 'rejected'
  where id = v_invite.id;

  perform public.append_audit_event(
    p_actor_user_id,
    'relationship_invite',
    v_invite.id,
    'relationship_invite_rejected',
    null,
    jsonb_build_object('inviter_user_id', v_invite.inviter_user_id)
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'status', 'rejected'
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;
