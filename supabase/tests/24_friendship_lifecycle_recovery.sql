begin;

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000002401', 'authenticated', 'authenticated', 'friendship24a@example.com', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Lifecycle A"}'),
  ('00000000-0000-0000-0000-000000002402', 'authenticated', 'authenticated', 'friendship24b@example.com', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Lifecycle B"}')
on conflict (id) do nothing;
update public.user_profiles
set display_name = case when id = '00000000-0000-0000-0000-000000002401' then 'Lifecycle A' else 'Lifecycle B' end,
    account_access_state = 'active', phone_country_iso2 = 'CO', phone_country_calling_code = '+57',
    phone_national_number = case when id = '00000000-0000-0000-0000-000000002401' then '3009992401' else '3009992402' end,
    phone_e164 = case when id = '00000000-0000-0000-0000-000000002401' then '+573009992401' else '+573009992402' end
where id in ('00000000-0000-0000-0000-000000002401', '00000000-0000-0000-0000-000000002402');

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-000000002401';
  b constant uuid := '00000000-0000-0000-0000-000000002402';
  first_invite jsonb;
  second_invite jsonb;
  current_invite jsonb;
  result jsonb;
  replay jsonb;
  reminder jsonb;
  external_invite jsonb;
  next_external jsonb;
  invite_id uuid;
begin
  first_invite := public.create_internal_friendship_invite(a, 'lifecycle-create-first', b, 'test');
  invite_id := (first_invite ->> 'inviteId')::uuid;
  if (select count(*) from public.push_notification_events where source_item_id = invite_id::text) <> 1 then
    raise exception 'creation must atomically enqueue exactly one push';
  end if;
  replay := public.create_internal_friendship_invite(a, 'lifecycle-create-first', b, 'test');
  if replay <> first_invite then raise exception 'creation replay changed'; end if;
  result := public.create_internal_friendship_invite(b, 'lifecycle-crossed-create', a, 'test');
  if result ->> 'inviteId' <> first_invite ->> 'inviteId' or result ->> 'friendshipDirection' <> 'incoming' then
    raise exception 'crossed invitation must reuse the incoming request';
  end if;
  result := public.resolve_people_targets(b, array['+573009992401']);
  if result #>> '{0,friendshipDirection}' <> 'incoming'
    or not ((result #> '{0,availableActions}') @> '["accept","reject"]'::jsonb) then
    raise exception 'recipient must have response actions';
  end if;
  result := public.resolve_people_targets(a, array['+573009992402']);
  if result #>> '{0,friendshipDirection}' <> 'outgoing' then raise exception 'sender direction missing'; end if;
  perform public.respond_internal_friendship_invite(b, 'lifecycle-reject-first', invite_id, 'reject');
  second_invite := public.create_internal_friendship_invite(a, 'lifecycle-create-after-reject', b, 'test');
  if second_invite ->> 'inviteId' = first_invite ->> 'inviteId' then
    raise exception 'immediate resend after rejection must create a new request';
  end if;
  invite_id := (second_invite ->> 'inviteId')::uuid;
  begin
    perform public.cancel_friendship_invite(b, 'lifecycle-unauthorized-cancel', invite_id);
    raise exception 'expected unauthorized cancellation failure';
  exception when others then
    if position('invite_not_visible_to_actor' in sqlerrm) = 0 then raise; end if;
  end;
  result := public.cancel_friendship_invite(a, 'lifecycle-cancel-second', invite_id);
  replay := public.cancel_friendship_invite(a, 'lifecycle-cancel-second-again', invite_id);
  if result ->> 'status' <> 'canceled' or replay ->> 'status' <> 'canceled' then
    raise exception 'cancellation must be terminal and recoverable';
  end if;
  replay := public.create_internal_friendship_invite(a, 'lifecycle-create-after-reject', b, 'test');
  if replay <> second_invite then raise exception 'replaying creation must not revive a canceled request'; end if;
  current_invite := public.create_internal_friendship_invite(a, 'lifecycle-create-after-cancel', b, 'test');
  if current_invite ->> 'inviteId' = second_invite ->> 'inviteId' then raise exception 'cancel/resend reused ID'; end if;
  invite_id := (current_invite ->> 'inviteId')::uuid;
  update public.friendship_invites set expires_at = now() - interval '1 second' where id = invite_id;
  result := public.resolve_people_targets(a, array['+573009992402']);
  if result #>> '{0,status}' <> 'active_user' then raise exception 'expired request blocked contact discovery'; end if;
  result := public.create_people_outreach(a, 'lifecycle-outreach-expired', 'remote', 'test', 'B', '+573009992402', 'mobile');
  if result ->> 'status' <> 'active_user' or result #>> '{result,inviteId}' = invite_id::text then
    raise exception 'outreach must renew an expired request: %', result;
  end if;
  invite_id := (result #>> '{result,inviteId}')::uuid;
  update public.friendship_invites set created_at = now() - interval '2 minutes' where id = invite_id;
  reminder := public.remind_friendship_invite(a, 'lifecycle-reminder-one', invite_id);
  replay := public.remind_friendship_invite(a, 'lifecycle-reminder-one', invite_id);
  if reminder ->> 'reminderStatus' <> 'queued' or replay <> reminder then raise exception 'reminder replay is not stable'; end if;
  if not public.friendship_push_event_is_current((reminder ->> 'reminderId')::uuid) then
    raise exception 'pending reminder should be deliverable';
  end if;
  result := public.remind_friendship_invite(a, 'lifecycle-reminder-too-soon', invite_id);
  if result ->> 'reminderStatus' <> 'cooldown' or result ->> 'nextAllowedAt' is null then
    raise exception 'reminder cooldown missing';
  end if;
  if (select reminder_sequence from public.friendship_invites where id = invite_id) <> 1 then
    raise exception 'retries/cooldown created extra reminders';
  end if;
  update public.friendship_invites set last_reminded_at = now() - interval '61 seconds' where id = invite_id;
  result := public.create_internal_friendship_invite(a, 'lifecycle-legacy-reminder', b, 'invite_requests_resend_pending');
  if result ->> 'reminderStatus' <> 'queued' then raise exception 'legacy reminder bridge failed'; end if;
  perform public.cancel_friendship_invite(a, 'lifecycle-cancel-reminders', invite_id);
  if public.friendship_push_event_is_current((reminder ->> 'reminderId')::uuid)
    or exists (select 1 from public.push_notification_events where source_item_id = invite_id::text and status in ('pending', 'processing')) then
    raise exception 'cancellation left deliverable notifications';
  end if;
  result := public.remind_friendship_invite(a, 'lifecycle-reminder-resolved', invite_id);
  if result ->> 'reminderStatus' <> 'resolved' then raise exception 'resolved request generated a reminder'; end if;

  external_invite := public.create_external_friendship_invite(a, 'lifecycle-external-first', 'remote', 'test', 'B', '+573009992402', 'mobile');
  replay := public.create_external_friendship_invite(a, 'lifecycle-external-first', 'remote', 'test', 'B', '+573009992402', 'mobile');
  if replay <> external_invite then raise exception 'external replay rotated its token'; end if;
  invite_id := (external_invite ->> 'inviteId')::uuid;
  if (select count(*) from public.friendship_invite_deliveries delivery
      where delivery.invite_id = (external_invite ->> 'inviteId')::uuid) <> 1 then
    raise exception 'external replay created extra deliveries';
  end if;
  begin
    perform public.create_external_friendship_invite(a, 'lifecycle-external-first', 'remote', 'test', 'Changed', '+573009992402', 'mobile');
    raise exception 'expected idempotency reuse error';
  exception when others then
    if position('idempotency_key_reused' in sqlerrm) = 0 then raise; end if;
  end;
  perform public.cancel_friendship_invite(a, 'lifecycle-external-cancel', invite_id);
  result := public.get_friendship_invite_preview(b, external_invite ->> 'deliveryToken');
  if result ->> 'reason' <> 'canceled' or (result ->> 'canClaim')::boolean then
    raise exception 'canceled external link remains actionable';
  end if;
  result := public.claim_external_friendship_invite(b, 'lifecycle-external-canceled-claim', external_invite ->> 'deliveryToken');
  if result ->> 'status' <> 'canceled' then raise exception 'canceled claim changed terminal state'; end if;
  next_external := public.create_external_friendship_invite(a, 'lifecycle-external-next', 'remote', 'test', 'B', '+573009992402', 'mobile');
  if next_external ->> 'inviteId' = external_invite ->> 'inviteId' then raise exception 'external resend reused canceled invitation'; end if;
  perform public.cancel_friendship_invite(a, 'lifecycle-external-next-cancel', (next_external ->> 'inviteId')::uuid);

  external_invite := public.create_external_friendship_invite(a, 'lifecycle-qr-first', 'qr', 'test', 'B', '+573009992402', 'mobile');
  result := public.get_friendship_invite_preview(a, external_invite ->> 'deliveryToken');
  if result ->> 'deliveryStatus' <> 'issued' then raise exception 'fresh delivery status missing from preview'; end if;
  next_external := public.create_external_friendship_invite(a, 'lifecycle-qr-rotate', 'qr', 'test', 'B', '+573009992402', 'mobile');
  if next_external ->> 'inviteId' <> external_invite ->> 'inviteId' then raise exception 'QR rotation must retain the invitation'; end if;
  result := public.get_friendship_invite_preview(a, external_invite ->> 'deliveryToken');
  if result ->> 'status' <> 'pending_claim' or result ->> 'deliveryStatus' <> 'revoked'
    or result ->> 'reason' <> 'sender_view' or (result ->> 'canClaim')::boolean then
    raise exception 'sender preview must expose revoked delivery while preserving pending invitation and role';
  end if;
  result := public.get_friendship_invite_preview(b, external_invite ->> 'deliveryToken');
  if result ->> 'deliveryStatus' <> 'revoked' or result ->> 'reason' <> 'delivery_revoked'
    or (result ->> 'canClaim')::boolean then raise exception 'revoked token holder preview policy changed'; end if;
  result := public.get_friendship_invite_preview(a, next_external ->> 'deliveryToken');
  if result ->> 'deliveryStatus' <> 'issued' then raise exception 'replacement QR delivery is not issued'; end if;
  perform public.cancel_friendship_invite(a, 'lifecycle-qr-cancel', (next_external ->> 'inviteId')::uuid);

  current_invite := public.create_internal_friendship_invite(a, 'lifecycle-final-accept-create', b, 'test');
  invite_id := (current_invite ->> 'inviteId')::uuid;
  result := public.respond_internal_friendship_invite(b, 'lifecycle-final-accept', invite_id, 'accept');
  replay := public.cancel_friendship_invite(a, 'lifecycle-cancel-after-accept', invite_id);
  if replay ->> 'status' <> 'accepted' or replay ->> 'relationshipId' <> result ->> 'relationshipId' then
    raise exception 'cancellation after acceptance must preserve relationship';
  end if;
  if not exists (select 1 from public.relationships where id = (result ->> 'relationshipId')::uuid and status = 'active') then
    raise exception 'accepted relationship was removed';
  end if;
  if has_function_privilege('authenticated', 'public.remind_friendship_invite(uuid,text,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'app_private.remind_friendship_invite_locked(uuid,uuid)', 'EXECUTE') then
    raise exception 'privileged reminder commands exposed to raw clients';
  end if;
end;
$$;

rollback;
select '1..1';
select 'ok 1 - friendship cancellation, immediate resend, expiry, reminders, outbox and replay are coherent';
