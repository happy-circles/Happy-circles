-- Apple/TestFlight review demo seed.
--
-- Run this in the Supabase SQL Editor after these Auth users exist and are
-- email-confirmed:
--   apple-review@happy-circles.com
--   demo-ana@happy-circles.com
--   demo-bruno@happy-circles.com
--
-- The script activates the three profiles, creates relationships, accepted
-- demo balances, two pending requests, and one pending Happy Circle where
-- apple-review@happy-circles.com is the only participant left to approve.

do $$
declare
  v_review_id uuid;
  v_ana_id uuid;
  v_bruno_id uuid;
  v_relationship_id uuid;
  v_response jsonb;
  v_request_id uuid;
  v_snapshot jsonb;
  v_amount_minor bigint;
  v_proposal_id uuid;
begin
  select id into v_review_id
  from public.user_profiles
  where email = 'apple-review@happy-circles.com';

  select id into v_ana_id
  from public.user_profiles
  where email = 'demo-ana@happy-circles.com';

  select id into v_bruno_id
  from public.user_profiles
  where email = 'demo-bruno@happy-circles.com';

  if v_review_id is null then
    raise exception 'Missing Auth user/profile: apple-review@happy-circles.com';
  end if;

  if v_ana_id is null then
    raise exception 'Missing Auth user/profile: demo-ana@happy-circles.com';
  end if;

  if v_bruno_id is null then
    raise exception 'Missing Auth user/profile: demo-bruno@happy-circles.com';
  end if;

  update public.user_profiles
  set display_name = 'Apple Review',
      phone_country_iso2 = 'US',
      phone_country_calling_code = '1',
      phone_national_number = '4155550100',
      phone_e164 = '+14155550100',
      phone_verified_at = coalesce(phone_verified_at, timezone('utc', now())),
      account_access_state = 'active',
      activated_at = coalesce(activated_at, timezone('utc', now())),
      onboarding_completed_at = coalesce(onboarding_completed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where id = v_review_id;

  update public.user_profiles
  set display_name = 'Ana Demo',
      phone_country_iso2 = 'US',
      phone_country_calling_code = '1',
      phone_national_number = '4155550101',
      phone_e164 = '+14155550101',
      phone_verified_at = coalesce(phone_verified_at, timezone('utc', now())),
      account_access_state = 'active',
      activated_at = coalesce(activated_at, timezone('utc', now())),
      onboarding_completed_at = coalesce(onboarding_completed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where id = v_ana_id;

  update public.user_profiles
  set display_name = 'Bruno Demo',
      phone_country_iso2 = 'US',
      phone_country_calling_code = '1',
      phone_national_number = '4155550102',
      phone_e164 = '+14155550102',
      phone_verified_at = coalesce(phone_verified_at, timezone('utc', now())),
      account_access_state = 'active',
      activated_at = coalesce(activated_at, timezone('utc', now())),
      onboarding_completed_at = coalesce(onboarding_completed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where id = v_bruno_id;

  insert into public.relationships (user_low_id, user_high_id, status, created_at, updated_at)
  values (least(v_review_id, v_ana_id), greatest(v_review_id, v_ana_id), 'active', timezone('utc', now()), timezone('utc', now()))
  on conflict (user_low_id, user_high_id) do update
  set status = excluded.status,
      updated_at = excluded.updated_at
  returning id into v_relationship_id;

  perform public.ensure_relationship_accounts(v_relationship_id);

  insert into public.relationships (user_low_id, user_high_id, status, created_at, updated_at)
  values (least(v_review_id, v_bruno_id), greatest(v_review_id, v_bruno_id), 'active', timezone('utc', now()), timezone('utc', now()))
  on conflict (user_low_id, user_high_id) do update
  set status = excluded.status,
      updated_at = excluded.updated_at
  returning id into v_relationship_id;

  perform public.ensure_relationship_accounts(v_relationship_id);

  insert into public.relationships (user_low_id, user_high_id, status, created_at, updated_at)
  values (least(v_ana_id, v_bruno_id), greatest(v_ana_id, v_bruno_id), 'active', timezone('utc', now()), timezone('utc', now()))
  on conflict (user_low_id, user_high_id) do update
  set status = excluded.status,
      updated_at = excluded.updated_at
  returning id into v_relationship_id;

  perform public.ensure_relationship_accounts(v_relationship_id);
  perform public.refresh_all_pair_net_edges_cache();

  v_response := public.create_balance_request(
    v_review_id,
    'apple-review-demo-cycle-review-ana-request',
    'balance_increase',
    v_ana_id,
    v_review_id,
    v_ana_id,
    70000,
    'Apple Review Demo | Mercado compartido',
    null,
    null,
    'food_drinks'
  );
  v_request_id := (v_response ->> 'requestId')::uuid;
  perform public.accept_financial_request(v_ana_id, 'apple-review-demo-cycle-review-ana-accept', v_request_id);

  v_response := public.create_balance_request(
    v_ana_id,
    'apple-review-demo-cycle-ana-bruno-request',
    'balance_increase',
    v_bruno_id,
    v_ana_id,
    v_bruno_id,
    70000,
    'Apple Review Demo | Cena del grupo',
    null,
    null,
    'food_drinks'
  );
  v_request_id := (v_response ->> 'requestId')::uuid;
  perform public.accept_financial_request(v_bruno_id, 'apple-review-demo-cycle-ana-bruno-accept', v_request_id);

  v_response := public.create_balance_request(
    v_bruno_id,
    'apple-review-demo-cycle-bruno-review-request',
    'balance_increase',
    v_review_id,
    v_bruno_id,
    v_review_id,
    70000,
    'Apple Review Demo | Taxi aeropuerto',
    null,
    null,
    'transport'
  );
  v_request_id := (v_response ->> 'requestId')::uuid;
  perform public.accept_financial_request(v_review_id, 'apple-review-demo-cycle-bruno-review-accept', v_request_id);

  perform public.create_balance_request(
    v_ana_id,
    'apple-review-demo-pending-incoming-request',
    'balance_increase',
    v_review_id,
    v_review_id,
    v_ana_id,
    25000,
    'Apple Review Demo | Pendiente entrante: snacks',
    null,
    null,
    'food_drinks'
  );

  perform public.create_balance_request(
    v_review_id,
    'apple-review-demo-pending-outgoing-request',
    'balance_increase',
    v_bruno_id,
    v_review_id,
    v_bruno_id,
    18000,
    'Apple Review Demo | Pendiente saliente: transporte',
    null,
    null,
    'transport'
  );

  v_response := public.create_balance_request(
    v_bruno_id,
    'apple-review-demo-rejected-request',
    'balance_increase',
    v_review_id,
    v_review_id,
    v_bruno_id,
    12000,
    'Apple Review Demo | Solicitud rechazada de prueba',
    null,
    null,
    'other'
  );
  v_request_id := (v_response ->> 'requestId')::uuid;
  perform public.reject_financial_request(v_review_id, 'apple-review-demo-rejected-response', v_request_id);

  perform public.refresh_all_pair_net_edges_cache();

  v_snapshot := public.compute_graph_component_snapshot(v_review_id, v_ana_id, 'COP');

  if v_snapshot ->> 'status' <> 'ok' then
    raise exception 'Could not compute Apple Review demo cycle snapshot: %', v_snapshot;
  end if;

  select min((edge.value ->> 'amount_minor')::bigint)
    into v_amount_minor
  from jsonb_array_elements(v_snapshot -> 'graphSnapshot') edge(value)
  where (
      (edge.value ->> 'debtor_user_id')::uuid = v_review_id
      and (edge.value ->> 'creditor_user_id')::uuid = v_ana_id
    )
    or (
      (edge.value ->> 'debtor_user_id')::uuid = v_ana_id
      and (edge.value ->> 'creditor_user_id')::uuid = v_bruno_id
    )
    or (
      (edge.value ->> 'debtor_user_id')::uuid = v_bruno_id
      and (edge.value ->> 'creditor_user_id')::uuid = v_review_id
    );

  if v_amount_minor is null or v_amount_minor <= 0 then
    raise exception 'Could not find expected Apple Review demo cycle edges: %', v_snapshot;
  end if;

  v_response := public.propose_cycle_settlement(
    v_review_id,
    'apple-review-demo-pending-circle-proposal',
    v_snapshot ->> 'graphSnapshotHash',
    v_snapshot -> 'graphSnapshot',
    jsonb_build_array(
      jsonb_build_object('debtor_user_id', v_ana_id, 'creditor_user_id', v_review_id, 'amount_minor', v_amount_minor),
      jsonb_build_object('debtor_user_id', v_bruno_id, 'creditor_user_id', v_ana_id, 'amount_minor', v_amount_minor),
      jsonb_build_object('debtor_user_id', v_review_id, 'creditor_user_id', v_bruno_id, 'amount_minor', v_amount_minor)
    ),
    array[v_review_id, v_ana_id, v_bruno_id],
    least(v_review_id, v_ana_id),
    greatest(v_review_id, v_ana_id),
    'COP',
    null
  );
  v_proposal_id := (v_response ->> 'proposalId')::uuid;

  perform public.decide_cycle_settlement(v_ana_id, 'apple-review-demo-pending-circle-ana-approve', v_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_bruno_id, 'apple-review-demo-pending-circle-bruno-approve', v_proposal_id, 'approved');

  raise notice 'Apple Review demo seed ready. apple-review@happy-circles.com still needs to approve proposal %', v_proposal_id;
end
$$;

select
  email,
  display_name,
  phone_e164,
  account_access_state,
  activated_at is not null as is_activated,
  onboarding_completed_at is not null as onboarding_completed
from public.user_profiles
where email in (
  'apple-review@happy-circles.com',
  'demo-ana@happy-circles.com',
  'demo-bruno@happy-circles.com'
)
order by email;

select
  status,
  creator_user_id,
  responder_user_id,
  debtor_user_id,
  creditor_user_id,
  amount_minor,
  currency_code,
  description,
  category,
  created_at
from public.financial_requests
where description like 'Apple Review Demo |%'
order by created_at desc;

select
  proposal.id,
  proposal.status,
  proposal.version_number,
  participant.participant_user_id,
  participant.decision
from public.settlement_proposals proposal
join public.settlement_proposal_participants participant
  on participant.settlement_proposal_id = proposal.id
where proposal.id = (
  select (response_json ->> 'proposalId')::uuid
  from public.idempotency_keys
  where operation_name = 'propose_cycle_settlement'
    and idempotency_key = 'apple-review-demo-pending-circle-proposal'
  order by created_at desc
  limit 1
)
order by participant.decision, participant.participant_user_id;
