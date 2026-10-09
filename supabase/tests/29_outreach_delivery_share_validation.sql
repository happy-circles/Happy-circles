begin;

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000002901', 'authenticated', 'authenticated', 'share29a@example.com', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Share A"}'),
  ('00000000-0000-0000-0000-000000002902', 'authenticated', 'authenticated', 'share29b@example.com', now(),
    '{"provider":"email","providers":["email"]}', '{"display_name":"Share B"}')
on conflict (id) do nothing;
update public.user_profiles
set display_name = case when id = '00000000-0000-0000-0000-000000002901' then 'Share A' else 'Share B' end,
    account_access_state = 'active', phone_country_iso2 = 'CO', phone_country_calling_code = '+57',
    phone_national_number = case when id = '00000000-0000-0000-0000-000000002901' then '3009992901' else '3009992902' end,
    phone_e164 = case when id = '00000000-0000-0000-0000-000000002901' then '+573009992901' else '+573009992902' end
where id in ('00000000-0000-0000-0000-000000002901', '00000000-0000-0000-0000-000000002902');

create function pg_temp.expect_share_failure(p_actor uuid, p_phone text, p_result jsonb, p_error text)
returns void language plpgsql as $$
begin
  begin
    perform app_private.validate_account_invite_delivery_for_share(p_actor, p_phone, p_result);
    raise exception 'expected share validation failure: %', p_error;
  exception when others then
    if sqlerrm <> p_error then raise; end if;
  end;
end;
$$;

create function pg_temp.expect_outreach_replay_failure(p_actor uuid, p_key text, p_phone text, p_error text)
returns void language plpgsql as $$
begin
  begin
    perform public.create_people_outreach(p_actor, p_key, 'remote', 'invite29', 'Recipient', p_phone, 'mobile');
    raise exception 'expected outreach replay failure: %', p_error;
  exception when others then
    if sqlerrm <> p_error then raise; end if;
  end;
end;
$$;

-- New responses and idempotent replays return current proof without preview writes.
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-000000002901';
  phone constant text := '+573009992910';
  first_response jsonb;
  replay jsonb;
  proof jsonb;
  v_invite_id uuid;
  v_delivery_id uuid;
  audit_count bigint;
  new_delivery_expiry timestamptz := clock_timestamp() + interval '2 days';
  new_invite_expiry timestamptz := clock_timestamp() + interval '3 days';
begin
  first_response := public.create_people_outreach(a, 'share29-fresh', 'remote', 'invite29', 'Recipient', phone, 'mobile');
  v_invite_id := (first_response #>> '{result,inviteId}')::uuid;
  v_delivery_id := (first_response #>> '{result,deliveryId}')::uuid;
  proof := first_response -> 'deliveryValidation';
  if first_response ->> 'kind' is distinct from 'account_invite'
    or proof ->> 'status' is distinct from 'current'
    or proof ->> 'ownerUserId' is distinct from a::text
    or proof ->> 'phoneE164' is distinct from phone
    or proof ->> 'inviteId' is distinct from v_invite_id::text
    or proof ->> 'deliveryId' is distinct from v_delivery_id::text
    or proof ->> 'channel' is distinct from 'remote'
    or proof ->> 'deliveryStatus' is distinct from 'issued'
    or (proof ->> 'validatedAt')::timestamptz > clock_timestamp()
    or (proof ->> 'expiresAt')::timestamptz <= (proof ->> 'validatedAt')::timestamptz
    or proof ->> 'expiresAt' is distinct from first_response #>> '{result,expiresAt}'
    or proof ->> 'inviteExpiresAt' is distinct from first_response #>> '{result,inviteExpiresAt}' then
    raise exception 'new delivery proof is incomplete or incorrectly bound: %', first_response;
  end if;
  select count(*) into audit_count from public.audit_events where entity_id = v_invite_id;
  replay := public.create_people_outreach(a, 'share29-fresh', 'remote', 'invite29', 'Recipient', phone, 'mobile');
  if replay -> 'result' is distinct from first_response -> 'result'
    or (replay #>> '{deliveryValidation,validatedAt}')::timestamptz
      < (first_response #>> '{deliveryValidation,validatedAt}')::timestamptz then
    raise exception 'replay changed the link or reused older validation';
  end if;
  if (select count(*) from public.account_invite_deliveries delivery where delivery.invite_id = v_invite_id) <> 1 then
    raise exception 'replay created an extra delivery';
  end if;
  if exists (select 1 from public.idempotency_keys
    where actor_user_id = a and idempotency_key = 'share29-fresh'
      and (response_json ? 'deliveryValidation' or response_json ? 'deliveryToken'
        or (response_json -> 'result') ? 'deliveryToken')) then
    raise exception 'token or point-in-time proof was cached';
  end if;

  -- Simulate an old cached reply and a changed valid database row.
  update public.idempotency_keys
  set response_json = response_json || '{"deliveryValidation":{"status":"current","validatedAt":"2100-01-01T00:00:00Z"}}'::jsonb
  where actor_user_id = a and operation_name = 'create_people_outreach' and idempotency_key = 'share29-fresh';
  update public.account_invites set expires_at = new_invite_expiry, intended_recipient_alias = 'Current alias'
  where id = v_invite_id;
  update public.account_invite_deliveries set expires_at = new_delivery_expiry where id = v_delivery_id;
  replay := public.create_people_outreach(a, 'share29-fresh', 'remote', 'invite29', 'Recipient', phone, 'mobile');
  if (replay #>> '{result,expiresAt}')::timestamptz is distinct from new_delivery_expiry
    or (replay #>> '{result,inviteExpiresAt}')::timestamptz is distinct from new_invite_expiry
    or replay #>> '{result,intendedRecipientAlias}' is distinct from 'Current alias'
    or (replay #>> '{deliveryValidation,expiresAt}')::timestamptz is distinct from new_delivery_expiry
    or (replay #>> '{deliveryValidation,validatedAt}')::timestamptz >= '2100-01-01'::timestamptz then
    raise exception 'replay trusted stale cached fields: %', replay;
  end if;
  if exists (select 1 from public.idempotency_keys
    where actor_user_id = a and idempotency_key = 'share29-fresh' and response_json ? 'deliveryValidation') then
    raise exception 'replay persisted point-in-time validation';
  end if;
  if (select count(*) from public.audit_events where entity_id = v_invite_id) <> audit_count
    or exists (select 1 from public.account_invite_deliveries where id = v_delivery_id
      and (open_count <> 0 or first_opened_at is not null or last_opened_at is not null or first_app_opened_at is not null)) then
    raise exception 'share validation recorded a preview/open side effect';
  end if;
end;
$$;

-- Delivery validation binds ownership, phone, token hash, both IDs and channel.
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-000000002901';
  b constant uuid := '00000000-0000-0000-0000-000000002902';
  phone constant text := '+573009992920';
  result jsonb;
  other_result jsonb;
  v_delivery_id uuid;
  v_invite_id uuid;
begin
  result := public.create_people_outreach(a, 'share29-bindings', 'remote', 'invite29', 'Recipient', phone, 'mobile') -> 'result';
  other_result := public.create_people_outreach(b, 'share29-other-owner', 'remote', 'invite29', 'Recipient', phone, 'mobile') -> 'result';
  v_delivery_id := (result ->> 'deliveryId')::uuid;
  v_invite_id := (result ->> 'inviteId')::uuid;
  perform pg_temp.expect_share_failure(b, phone, result, 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, '+573009992921', result, 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, phone, result - 'deliveryToken', 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, phone, result || '{"deliveryToken":"wrong-token"}'::jsonb, 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, phone, result || '{"inviteId":"00000000-0000-0000-0000-000000009999"}'::jsonb, 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, phone, result || '{"deliveryId":"not-a-uuid"}'::jsonb, 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, phone, other_result, 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, phone, jsonb_set(result, '{deliveryId}', other_result -> 'deliveryId'), 'account_invite_delivery_not_available');
  perform pg_temp.expect_share_failure(a, phone, result || '{"channel":"qr"}'::jsonb, 'account_invite_delivery_not_available');
  update public.account_invite_deliveries set channel = 'qr' where id = v_delivery_id;
  perform pg_temp.expect_share_failure(a, phone, result, 'account_invite_delivery_not_available');
  update public.account_invite_deliveries set channel = 'remote', authenticated_user_id = b where id = v_delivery_id;
  perform pg_temp.expect_share_failure(a, phone, result, 'account_invite_delivery_not_available');
  update public.account_invite_deliveries set status = 'authenticated' where id = v_delivery_id;
  perform pg_temp.expect_share_failure(a, phone, result, 'account_invite_delivery_not_available');
  update public.account_invite_deliveries set authenticated_user_id = null where id = v_delivery_id;
  if app_private.validate_account_invite_delivery_for_share(a, phone, result)
      #>> '{deliveryValidation,deliveryStatus}' is distinct from 'authenticated' then
    raise exception 'valid unbound authenticated delivery lost existing preview visibility';
  end if;
  update public.account_invite_deliveries set authenticated_user_id = a where id = v_delivery_id;
  perform app_private.validate_account_invite_delivery_for_share(a, phone, result);
  update public.account_invite_deliveries set status = 'issued', authenticated_user_id = null where id = v_delivery_id;
  update public.account_invites set activated_user_id = b where id = v_invite_id;
  perform pg_temp.expect_share_failure(a, phone, result, 'account_invite_delivery_not_available');
  update public.account_invites set activated_user_id = null where id = v_invite_id;
end;
$$;

-- Cached successful creation is never a permission to share a changed delivery.
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-000000002901';
  phone constant text := '+573009992930';
  response jsonb;
  v_invite_id uuid;
  v_delivery_id uuid;
  terminal_status public.account_invite_status;
begin
  response := public.create_people_outreach(a, 'share29-replay-states', 'remote', 'invite29', 'Recipient', phone, 'mobile');
  v_invite_id := (response #>> '{result,inviteId}')::uuid;
  v_delivery_id := (response #>> '{result,deliveryId}')::uuid;
  update public.account_invite_deliveries set revoked_at = clock_timestamp() where id = v_delivery_id;
  perform pg_temp.expect_outreach_replay_failure(a, 'share29-replay-states', phone, 'account_invite_delivery_not_available');
  update public.account_invite_deliveries set revoked_at = null, status = 'revoked' where id = v_delivery_id;
  perform pg_temp.expect_outreach_replay_failure(a, 'share29-replay-states', phone, 'account_invite_delivery_not_available');
  update public.account_invite_deliveries set status = 'activated' where id = v_delivery_id;
  perform pg_temp.expect_outreach_replay_failure(a, 'share29-replay-states', phone, 'account_invite_delivery_not_available');
  update public.account_invite_deliveries set status = 'issued', expires_at = clock_timestamp() - interval '1 second' where id = v_delivery_id;
  perform pg_temp.expect_outreach_replay_failure(a, 'share29-replay-states', phone, 'account_invite_delivery_expired');
  update public.account_invite_deliveries set expires_at = clock_timestamp() + interval '7 days' where id = v_delivery_id;
  update public.account_invites set expires_at = clock_timestamp() - interval '1 second' where id = v_invite_id;
  perform pg_temp.expect_outreach_replay_failure(a, 'share29-replay-states', phone, 'account_invite_delivery_expired');
  update public.account_invites set expires_at = clock_timestamp() + interval '7 days' where id = v_invite_id;
  foreach terminal_status in array array['pending_inviter_review', 'accepted', 'rejected', 'canceled', 'expired']::public.account_invite_status[] loop
    update public.account_invites set status = terminal_status where id = v_invite_id;
    perform pg_temp.expect_outreach_replay_failure(a, 'share29-replay-states', phone, 'account_invite_delivery_not_available');
  end loop;
  update public.account_invites set status = 'pending_activation' where id = v_invite_id;
  response := public.create_people_outreach(a, 'share29-replay-states', 'remote', 'invite29', 'Recipient', phone, 'mobile');
  if response #>> '{deliveryValidation,deliveryStatus}' is distinct from 'issued'
    or (select count(*) from public.account_invite_deliveries delivery where delivery.invite_id = v_invite_id) <> 1 then
    raise exception 'failed replays changed the delivery or poisoned successful recovery';
  end if;
end;
$$;

-- Expiry is checked at wall-clock time, even within a transaction that began earlier.
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-000000002901';
  phone constant text := '+573009992940';
  response jsonb;
  cutoff timestamptz;
begin
  response := public.create_people_outreach(a, 'share29-wall-clock', 'remote', 'invite29', 'Recipient', phone, 'mobile');
  cutoff := clock_timestamp() + interval '60 milliseconds';
  update public.account_invite_deliveries set expires_at = cutoff where id = (response #>> '{result,deliveryId}')::uuid;
  perform pg_sleep(0.08);
  if cutoff <= now() then raise exception 'wall-clock fixture must expire after transaction-start time'; end if;
  perform pg_temp.expect_outreach_replay_failure(a, 'share29-wall-clock', phone, 'account_invite_delivery_expired');
end;
$$;

-- Scope and execution permissions stay on the existing server-only command.
do $$
declare
  a constant uuid := '00000000-0000-0000-0000-000000002901';
  b constant uuid := '00000000-0000-0000-0000-000000002902';
  result jsonb;
begin
  result := public.create_people_outreach(a, 'share29-qr-unchanged', 'qr', 'invite29', 'Recipient', '+573009992950', 'mobile');
  if result ? 'deliveryValidation' or result #>> '{result,channel}' is distinct from 'qr' then
    raise exception 'QR behavior changed or received remote share proof';
  end if;
  result := public.create_people_outreach(a, 'share29-friendship', 'remote', 'invite29', 'Recipient', '+573009992902', 'mobile');
  if result ? 'deliveryValidation' or result ->> 'kind' is distinct from 'friendship' then
    raise exception 'registered recipient behavior changed or received account delivery proof';
  end if;
  if public.create_people_outreach(a, 'share29-friendship', 'remote', 'invite29', 'Recipient', '+573009992902', 'mobile') is distinct from result then
    raise exception 'friendship replay changed';
  end if;
  if has_function_privilege('anon', 'app_private.validate_account_invite_delivery_for_share(uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'app_private.validate_account_invite_delivery_for_share(uuid,text,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'app_private.validate_account_invite_delivery_for_share(uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.create_people_outreach(uuid,text,public.account_invite_channel,text,text,text,text)', 'EXECUTE') then
    raise exception 'private validation or privileged outreach exposed to clients';
  end if;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform pg_temp.expect_outreach_replay_failure(a, 'share29-forged-actor', '+573009992960', 'actor_mismatch');
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

rollback;
select '1..5';
select 'ok 1 - fresh share response and replay are current, canonical and free of preview writes';
select 'ok 2 - owner, phone, token, IDs, channel and claimant are bound to the delivery';
select 'ok 3 - revoked, expired and resolved cached deliveries cannot be shared';
select 'ok 4 - wall-clock expiry survives transaction and lock-wait timing';
select 'ok 5 - QR, friendship, actor checks and server-only grants keep their existing scope';
