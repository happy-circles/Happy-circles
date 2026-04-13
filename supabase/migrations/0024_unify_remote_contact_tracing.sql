alter table public.friendship_invites
  add column if not exists intended_recipient_phone_e164 text,
  add column if not exists intended_recipient_phone_label text;

with latest_delivery as (
  select distinct on (delivery.invite_id)
    delivery.invite_id,
    delivery.delivery_phone_e164
  from public.friendship_invite_deliveries delivery
  where delivery.delivery_phone_e164 is not null
  order by delivery.invite_id, delivery.created_at desc, delivery.id desc
)
update public.friendship_invites invite
set intended_recipient_phone_e164 = latest_delivery.delivery_phone_e164
from latest_delivery
where invite.id = latest_delivery.invite_id
  and invite.intended_recipient_phone_e164 is null;

update public.friendship_invites
set origin_channel = 'remote'::public.friendship_invite_channel
where origin_channel in ('whatsapp'::public.friendship_invite_channel, 'link'::public.friendship_invite_channel);

update public.friendship_invite_deliveries
set channel = 'remote'::public.friendship_invite_channel
where channel in ('whatsapp'::public.friendship_invite_channel, 'link'::public.friendship_invite_channel);

update public.friendship_invite_deliveries
set status = 'expired',
    updated_at = timezone('utc', now())
where status = 'issued'
  and expires_at <= timezone('utc', now());

with ranked_remote as (
  select
    delivery.id,
    row_number() over (
      partition by delivery.invite_id, delivery.channel
      order by delivery.created_at desc, delivery.id desc
    ) as delivery_rank
  from public.friendship_invite_deliveries delivery
  where delivery.channel = 'remote'
    and delivery.status = 'issued'
    and delivery.revoked_at is null
)
update public.friendship_invite_deliveries delivery
set status = 'revoked',
    revoked_at = coalesce(delivery.revoked_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
from ranked_remote
where delivery.id = ranked_remote.id
  and ranked_remote.delivery_rank > 1;

drop index if exists public.friendship_invites_pending_external_sender_unique_idx;
drop index if exists public.friendship_invites_active_qr_delivery_unique_idx;

create unique index if not exists friendship_invites_pending_external_intent_unique_idx
  on public.friendship_invites (
    inviter_user_id,
    origin_channel,
    coalesce(intended_recipient_phone_e164, ''),
    coalesce(intended_recipient_alias, '')
  )
  where flow = 'external' and status = 'pending_claim';

create unique index if not exists friendship_invite_deliveries_active_channel_unique_idx
  on public.friendship_invite_deliveries (invite_id, channel)
  where status = 'issued' and revoked_at is null;

drop view if exists public.v_friendship_invite_deliveries_live;
drop view if exists public.v_friendship_invites_live;

alter table public.friendship_invite_deliveries
  drop column if exists delivery_phone_e164;

create or replace function public.friendship_channel_from_label(p_label text)
returns public.friendship_invite_channel
language sql
immutable
as $$
  select case
    when coalesce(lower(btrim(p_label)), '') like '%qr%' then 'qr'::public.friendship_invite_channel
    when coalesce(lower(btrim(p_label)), '') = 'directa' then 'internal'::public.friendship_invite_channel
    else 'remote'::public.friendship_invite_channel
  end;
$$;

create or replace view public.v_friendship_invites_live as
select
  invite.id,
  invite.inviter_user_id,
  invite.target_user_id,
  invite.claimant_user_id,
  invite.relationship_id,
  invite.flow,
  invite.origin_channel,
  public.effective_friendship_invite_status(invite.status, invite.expires_at) as status,
  invite.resolution_actor,
  invite.resolution_reason,
  invite.intended_recipient_alias,
  invite.intended_recipient_phone_e164,
  invite.intended_recipient_phone_label,
  invite.claimant_snapshot,
  invite.source_context,
  invite.created_at,
  invite.updated_at,
  invite.expires_at,
  invite.resolved_at
from public.friendship_invites invite;

create or replace view public.v_friendship_invite_deliveries_live as
select
  delivery.id,
  delivery.invite_id,
  delivery.token,
  delivery.channel,
  delivery.source_context,
  public.effective_friendship_delivery_status(
    delivery.status,
    delivery.expires_at,
    delivery.revoked_at
  ) as status,
  delivery.created_at,
  delivery.updated_at,
  delivery.expires_at,
  delivery.claimed_at,
  delivery.claimed_by_user_id,
  delivery.revoked_at
from public.friendship_invite_deliveries delivery;

alter view public.v_friendship_invites_live set (security_invoker = true);
alter view public.v_friendship_invite_deliveries_live set (security_invoker = true);

grant select on public.v_friendship_invites_live to authenticated;
grant select on public.v_friendship_invite_deliveries_live to authenticated;

drop function if exists public.create_external_friendship_invite(
  uuid,
  text,
  public.friendship_invite_channel,
  text,
  text,
  text
);

create or replace function public.create_external_friendship_invite(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_channel public.friendship_invite_channel,
  p_source_context text default null,
  p_intended_recipient_alias text default null,
  p_intended_recipient_phone_e164 text default null,
  p_intended_recipient_phone_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_invite public.friendship_invites%rowtype;
  v_delivery public.friendship_invite_deliveries%rowtype;
  v_existing_delivery public.friendship_invite_deliveries%rowtype;
  v_response jsonb;
  v_delivery_expires_at timestamptz;
  v_alias text := nullif(btrim(p_intended_recipient_alias), '');
  v_phone_e164 text := nullif(btrim(p_intended_recipient_phone_e164), '');
  v_phone_label text := nullif(btrim(p_intended_recipient_phone_label), '');
  v_source_context text := nullif(btrim(p_source_context), '');
begin
  if p_channel not in ('remote', 'qr') then
    raise exception 'external_channel_required';
  end if;

  if p_channel = 'remote' and (v_alias is null or v_phone_e164 is null) then
    raise exception 'contact_reference_required';
  end if;

  if not public.friendship_identity_ready(p_actor_user_id) then
    raise exception 'identity_incomplete';
  end if;

  update public.friendship_invites
  set status = 'expired',
      resolution_actor = coalesce(resolution_actor, 'system'::public.friendship_invite_resolution_actor),
      resolution_reason = coalesce(resolution_reason, 'claim_window_expired'),
      resolved_at = coalesce(resolved_at, timezone('utc', now()))
  where inviter_user_id = p_actor_user_id
    and flow = 'external'
    and status in ('pending_claim', 'pending_sender_review')
    and expires_at <= timezone('utc', now());

  update public.friendship_invite_deliveries
  set status = 'expired'
  where status = 'issued'
    and expires_at <= timezone('utc', now());

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'create_external_friendship_invite', p_idempotency_key)
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'create_external_friendship_invite'
    and idempotency_key = p_idempotency_key
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_invite
  from public.friendship_invites
  where inviter_user_id = p_actor_user_id
    and flow = 'external'
    and status = 'pending_claim'
    and origin_channel = p_channel
    and coalesce(intended_recipient_alias, '') = coalesce(v_alias, '')
    and coalesce(intended_recipient_phone_e164, '') = coalesce(v_phone_e164, '')
  order by created_at desc
  limit 1
  for update;

  if not found then
    insert into public.friendship_invites (
      inviter_user_id,
      flow,
      origin_channel,
      status,
      intended_recipient_alias,
      intended_recipient_phone_e164,
      intended_recipient_phone_label,
      source_context,
      expires_at
    )
    values (
      p_actor_user_id,
      'external',
      p_channel,
      'pending_claim',
      v_alias,
      v_phone_e164,
      v_phone_label,
      v_source_context,
      timezone('utc', now()) + interval '7 days'
    )
    returning * into v_invite;

    perform public.append_audit_event(
      p_actor_user_id,
      'friendship_invite',
      v_invite.id,
      'friendship_invite_created',
      null,
      jsonb_build_object(
        'flow', 'external',
        'origin_channel', p_channel,
        'source_context', v_source_context,
        'intended_recipient_alias', v_alias,
        'intended_recipient_phone_e164', v_phone_e164,
        'intended_recipient_phone_label', v_phone_label
      )
    );
  else
    update public.friendship_invites
    set intended_recipient_phone_label = coalesce(v_phone_label, intended_recipient_phone_label),
        source_context = coalesce(v_source_context, source_context)
    where id = v_invite.id
    returning * into v_invite;
  end if;

  if p_channel = 'remote' then
    select *
      into v_existing_delivery
    from public.friendship_invite_deliveries
    where invite_id = v_invite.id
      and channel = 'remote'
      and status = 'issued'
      and revoked_at is null
      and expires_at > timezone('utc', now())
    order by created_at desc
    limit 1
    for update;

    if found then
      v_response := jsonb_build_object(
        'inviteId', v_invite.id,
        'deliveryId', v_existing_delivery.id,
        'deliveryToken', v_existing_delivery.token,
        'flow', v_invite.flow,
        'status', public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
        'channel', v_existing_delivery.channel,
        'originChannel', v_invite.origin_channel,
        'expiresAt', v_existing_delivery.expires_at,
        'inviteExpiresAt', v_invite.expires_at,
        'intendedRecipientAlias', v_invite.intended_recipient_alias,
        'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
        'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label
      );

      update public.idempotency_keys
      set response_json = v_response
      where id = v_idempotency.id;

      return v_response;
    end if;

    v_delivery_expires_at := timezone('utc', now()) + interval '7 days';

    update public.friendship_invites
    set expires_at = v_delivery_expires_at,
        resolved_at = null,
        resolution_actor = null,
        resolution_reason = null
    where id = v_invite.id
    returning * into v_invite;
  else
    update public.friendship_invite_deliveries
    set status = 'revoked',
        revoked_at = coalesce(revoked_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where invite_id = v_invite.id
      and channel = 'qr'
      and status = 'issued'
      and revoked_at is null;

    v_delivery_expires_at := timezone('utc', now()) + interval '10 minutes';
  end if;

  insert into public.friendship_invite_deliveries (
    invite_id,
    token,
    channel,
    source_context,
    status,
    expires_at
  )
  values (
    v_invite.id,
    public.generate_short_token(18),
    p_channel,
    v_source_context,
    'issued',
    v_delivery_expires_at
  )
  returning * into v_delivery;

  perform public.append_audit_event(
    p_actor_user_id,
    'friendship_invite',
    v_invite.id,
    'friendship_invite_delivery_created',
    null,
    jsonb_build_object(
      'delivery_id', v_delivery.id,
      'channel', p_channel,
      'source_context', v_source_context,
      'intended_recipient_alias', v_alias,
      'intended_recipient_phone_e164', v_phone_e164,
      'intended_recipient_phone_label', v_phone_label,
      'expires_at', v_delivery.expires_at
    )
  );

  v_response := jsonb_build_object(
    'inviteId', v_invite.id,
    'deliveryId', v_delivery.id,
    'deliveryToken', v_delivery.token,
    'flow', v_invite.flow,
    'status', public.effective_friendship_invite_status(v_invite.status, v_invite.expires_at),
    'channel', v_delivery.channel,
    'originChannel', v_invite.origin_channel,
    'expiresAt', v_delivery.expires_at,
    'inviteExpiresAt', v_invite.expires_at,
    'intendedRecipientAlias', v_invite.intended_recipient_alias,
    'intendedRecipientPhoneE164', v_invite.intended_recipient_phone_e164,
    'intendedRecipientPhoneLabel', v_invite.intended_recipient_phone_label
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

grant execute on function public.create_external_friendship_invite(
  uuid,
  text,
  public.friendship_invite_channel,
  text,
  text,
  text,
  text
) to authenticated;

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
