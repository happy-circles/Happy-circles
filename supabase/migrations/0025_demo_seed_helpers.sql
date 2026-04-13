create or replace function public.reset_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_truncate_public_sql text;
  v_truncate_auth_sql text;
  v_truncate_storage_sql text;
begin
  select
    'truncate table ' ||
    string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename) ||
    ' cascade'
  into v_truncate_public_sql
  from pg_tables
  where schemaname = 'public';

  if v_truncate_public_sql is not null then
    execute v_truncate_public_sql;
  end if;

  select
    'truncate table ' ||
    string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename) ||
    ' cascade'
  into v_truncate_auth_sql
  from pg_tables
  where schemaname = 'auth'
    and tablename = any (
      array[
        'audit_log_entries',
        'flow_state',
        'identities',
        'mfa_amr_claims',
        'mfa_challenges',
        'mfa_factors',
        'oauth_authorizations',
        'oauth_client_states',
        'oauth_consents',
        'one_time_tokens',
        'refresh_tokens',
        'saml_relay_states',
        'sessions',
        'users',
        'webauthn_challenges',
        'webauthn_credentials'
      ]
    );

  if v_truncate_auth_sql is not null then
    execute v_truncate_auth_sql;
  end if;

  select
    'truncate table ' ||
    string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename) ||
    ' cascade'
  into v_truncate_storage_sql
  from pg_tables
  where schemaname = 'storage'
    and tablename = any (
      array[
        'objects',
        's3_multipart_uploads',
        's3_multipart_uploads_parts'
      ]
    );

  if v_truncate_storage_sql is not null then
    execute v_truncate_storage_sql;
  end if;

  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.seed_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seed_password constant text := 'Circles1234';
  v_ana_id constant uuid := '00000000-0000-0000-0000-0000000000a1';
  v_bruno_id constant uuid := '00000000-0000-0000-0000-0000000000b2';
  v_carla_id constant uuid := '00000000-0000-0000-0000-0000000000c3';
  v_diego_id constant uuid := '00000000-0000-0000-0000-0000000000d4';
  v_now timestamptz := timezone('utc', now());
  v_users_created_at timestamptz := v_now - interval '35 days';
  v_relationships_created_at timestamptz := v_now - interval '28 days';
  v_historic_request_1_created_at timestamptz := v_now - interval '12 days 6 hours';
  v_historic_request_1_resolved_at timestamptz := v_now - interval '12 days 5 hours 50 minutes';
  v_historic_request_2_created_at timestamptz := v_now - interval '12 days 4 hours';
  v_historic_request_2_resolved_at timestamptz := v_now - interval '12 days 3 hours 50 minutes';
  v_historic_request_3_created_at timestamptz := v_now - interval '12 days 2 hours';
  v_historic_request_3_resolved_at timestamptz := v_now - interval '12 days 1 hour 50 minutes';
  v_historic_request_4_created_at timestamptz := v_now - interval '12 days';
  v_historic_request_4_resolved_at timestamptz := v_now - interval '11 days 23 hours 50 minutes';
  v_historic_proposal_created_at timestamptz := v_now - interval '11 days 20 hours';
  v_historic_bruno_decided_at timestamptz := v_now - interval '11 days 19 hours 45 minutes';
  v_historic_carla_decided_at timestamptz := v_now - interval '11 days 19 hours 35 minutes';
  v_historic_diego_decided_at timestamptz := v_now - interval '11 days 19 hours 25 minutes';
  v_historic_ana_decided_at timestamptz := v_now - interval '11 days 19 hours 15 minutes';
  v_historic_executed_at timestamptz := v_now - interval '11 days 19 hours';
  v_live_request_1_created_at timestamptz := v_now - interval '2 days 6 hours';
  v_live_request_1_resolved_at timestamptz := v_now - interval '2 days 5 hours 50 minutes';
  v_live_request_2_created_at timestamptz := v_now - interval '1 day 23 hours';
  v_live_request_2_resolved_at timestamptz := v_now - interval '1 day 22 hours 50 minutes';
  v_live_request_3_created_at timestamptz := v_now - interval '1 day 18 hours';
  v_live_request_3_resolved_at timestamptz := v_now - interval '1 day 17 hours 50 minutes';
  v_live_request_4_created_at timestamptz := v_now - interval '1 day 14 hours';
  v_live_request_4_resolved_at timestamptz := v_now - interval '1 day 13 hours 50 minutes';
  v_live_proposal_created_at timestamptz := v_now - interval '4 hours';
  v_live_bruno_decided_at timestamptz := v_now - interval '3 hours 40 minutes';
  v_live_carla_decided_at timestamptz := v_now - interval '3 hours 20 minutes';
  v_live_diego_decided_at timestamptz := v_now - interval '3 hours';
  v_pending_incoming_created_at timestamptz := v_now - interval '45 minutes';
  v_pending_outgoing_created_at timestamptz := v_now - interval '20 minutes';
  v_relationship_id uuid;
  v_historic_hash text;
  v_historic_snapshot jsonb;
  v_historic_proposal_id uuid;
  v_live_hash text;
  v_live_snapshot jsonb;
  v_live_proposal_id uuid;
begin
  insert into public.app_settings (key, value_json, updated_at)
  values
    ('currency', '{"code":"COP"}'::jsonb, v_now),
    ('app_web_origin', jsonb_build_object('value', 'https://app.happycircles.com'), v_now),
    (
      'mobile_min_supported_version',
      jsonb_build_object(
        'minimumVersion',
        '0.1.0',
        'message',
        'Actualiza Happy Circles para seguir usando invitaciones de amistad.'
      ),
      v_now
    )
  on conflict (key) do update
  set value_json = excluded.value_json,
      updated_at = excluded.updated_at;

  with demo_users as (
    select *
    from (
      values
        (
          v_ana_id,
          'ana@example.com',
          'Ana Torres',
          'CO',
          '57',
          '3001112233',
          '+573001112233',
          'https://ui-avatars.com/api/?name=Ana+Torres&background=F59E0B&color=ffffff&size=256'
        ),
        (
          v_bruno_id,
          'bruno@example.com',
          'Bruno Diaz',
          'CO',
          '57',
          '3001112244',
          '+573001112244',
          'https://ui-avatars.com/api/?name=Bruno+Diaz&background=2563EB&color=ffffff&size=256'
        ),
        (
          v_carla_id,
          'carla@example.com',
          'Carla Mejia',
          'CO',
          '57',
          '3001112255',
          '+573001112255',
          'https://ui-avatars.com/api/?name=Carla+Mejia&background=DB2777&color=ffffff&size=256'
        ),
        (
          v_diego_id,
          'diego@example.com',
          'Diego Ruiz',
          'CO',
          '57',
          '3001112266',
          '+573001112266',
          'https://ui-avatars.com/api/?name=Diego+Ruiz&background=059669&color=ffffff&size=256'
        )
    ) as seed_user(
      id,
      email,
      display_name,
      phone_country_iso2,
      phone_country_calling_code,
      phone_national_number,
      phone_e164,
      avatar_url
    )
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
    extensions.crypt(v_seed_password, extensions.gen_salt('bf')),
    v_users_created_at,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'display_name',
      demo_users.display_name,
      'phone_country_iso2',
      demo_users.phone_country_iso2,
      'phone_country_calling_code',
      demo_users.phone_country_calling_code,
      'phone_national_number',
      demo_users.phone_national_number,
      'phone_e164',
      demo_users.phone_e164
    ),
    v_users_created_at,
    v_now,
    '',
    '',
    '',
    ''
  from demo_users
  on conflict (id) do update
  set email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at,
      raw_app_meta_data = excluded.raw_app_meta_data,
      raw_user_meta_data = excluded.raw_user_meta_data,
      updated_at = excluded.updated_at;

  with demo_users as (
    select *
    from (
      values
        (v_ana_id, 'ana@example.com'),
        (v_bruno_id, 'bruno@example.com'),
        (v_carla_id, 'carla@example.com'),
        (v_diego_id, 'diego@example.com')
    ) as seed_identity(id, email)
  )
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    id
  )
  select
    demo_users.id::text,
    demo_users.id,
    jsonb_build_object(
      'sub',
      demo_users.id::text,
      'email',
      demo_users.email,
      'email_verified',
      true
    ),
    'email',
    v_now,
    v_users_created_at,
    v_now,
    gen_random_uuid()
  from demo_users
  where not exists (
    select 1
    from auth.identities identity_row
    where identity_row.user_id = demo_users.id
      and identity_row.provider = 'email'
  );

  with demo_users as (
    select *
    from (
      values
        (
          v_ana_id,
          'ana@example.com',
          'Ana Torres',
          'CO',
          '57',
          '3001112233',
          '+573001112233',
          'https://ui-avatars.com/api/?name=Ana+Torres&background=F59E0B&color=ffffff&size=256'
        ),
        (
          v_bruno_id,
          'bruno@example.com',
          'Bruno Diaz',
          'CO',
          '57',
          '3001112244',
          '+573001112244',
          'https://ui-avatars.com/api/?name=Bruno+Diaz&background=2563EB&color=ffffff&size=256'
        ),
        (
          v_carla_id,
          'carla@example.com',
          'Carla Mejia',
          'CO',
          '57',
          '3001112255',
          '+573001112255',
          'https://ui-avatars.com/api/?name=Carla+Mejia&background=DB2777&color=ffffff&size=256'
        ),
        (
          v_diego_id,
          'diego@example.com',
          'Diego Ruiz',
          'CO',
          '57',
          '3001112266',
          '+573001112266',
          'https://ui-avatars.com/api/?name=Diego+Ruiz&background=059669&color=ffffff&size=256'
        )
    ) as seed_profile(
      id,
      email,
      display_name,
      phone_country_iso2,
      phone_country_calling_code,
      phone_national_number,
      phone_e164,
      avatar_url
    )
  )
  insert into public.user_profiles (
    id,
    email,
    display_name,
    phone_country_iso2,
    phone_country_calling_code,
    phone_national_number,
    phone_e164,
    phone_verified_at,
    avatar_path,
    created_at,
    updated_at
  )
  select
    demo_users.id,
    demo_users.email,
    demo_users.display_name,
    demo_users.phone_country_iso2,
    demo_users.phone_country_calling_code,
    demo_users.phone_national_number,
    demo_users.phone_e164,
    v_users_created_at,
    demo_users.avatar_url,
    v_users_created_at,
    v_now
  from demo_users
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      phone_country_iso2 = excluded.phone_country_iso2,
      phone_country_calling_code = excluded.phone_country_calling_code,
      phone_national_number = excluded.phone_national_number,
      phone_e164 = excluded.phone_e164,
      phone_verified_at = excluded.phone_verified_at,
      avatar_path = excluded.avatar_path,
      updated_at = excluded.updated_at;

  insert into public.relationships (
    user_low_id,
    user_high_id,
    status,
    created_at,
    updated_at
  )
  values
    (least(v_ana_id, v_bruno_id), greatest(v_ana_id, v_bruno_id), 'active', v_relationships_created_at, v_relationships_created_at),
    (least(v_ana_id, v_carla_id), greatest(v_ana_id, v_carla_id), 'active', v_relationships_created_at, v_relationships_created_at),
    (least(v_ana_id, v_diego_id), greatest(v_ana_id, v_diego_id), 'active', v_relationships_created_at, v_relationships_created_at),
    (least(v_bruno_id, v_carla_id), greatest(v_bruno_id, v_carla_id), 'active', v_relationships_created_at, v_relationships_created_at),
    (least(v_bruno_id, v_diego_id), greatest(v_bruno_id, v_diego_id), 'active', v_relationships_created_at, v_relationships_created_at),
    (least(v_carla_id, v_diego_id), greatest(v_carla_id, v_diego_id), 'active', v_relationships_created_at, v_relationships_created_at)
  on conflict (user_low_id, user_high_id) do update
  set status = excluded.status,
      updated_at = excluded.updated_at;

  for v_relationship_id in
    select id
    from public.relationships
    where status = 'active'
      and user_low_id in (v_ana_id, v_bruno_id, v_carla_id, v_diego_id)
      and user_high_id in (v_ana_id, v_bruno_id, v_carla_id, v_diego_id)
  loop
    perform public.ensure_relationship_accounts(v_relationship_id);
  end loop;

  perform public.refresh_all_pair_net_edges_cache();

  perform public.create_balance_request(
    v_ana_id,
    'demo-historic-a-b-request',
    'balance_increase',
    v_bruno_id,
    v_ana_id,
    v_bruno_id,
    60000,
    'Historico | Mercado Ana -> Bruno'
  );

  perform public.accept_financial_request(
    v_bruno_id,
    'demo-historic-a-b-accept',
    (select id from public.financial_requests where description = 'Historico | Mercado Ana -> Bruno')
  );

  perform public.create_balance_request(
    v_bruno_id,
    'demo-historic-b-c-request',
    'balance_increase',
    v_carla_id,
    v_bruno_id,
    v_carla_id,
    60000,
    'Historico | Viaje Bruno -> Carla'
  );

  perform public.accept_financial_request(
    v_carla_id,
    'demo-historic-b-c-accept',
    (select id from public.financial_requests where description = 'Historico | Viaje Bruno -> Carla')
  );

  perform public.create_balance_request(
    v_carla_id,
    'demo-historic-c-d-request',
    'balance_increase',
    v_diego_id,
    v_carla_id,
    v_diego_id,
    60000,
    'Historico | Cena Carla -> Diego'
  );

  perform public.accept_financial_request(
    v_diego_id,
    'demo-historic-c-d-accept',
    (select id from public.financial_requests where description = 'Historico | Cena Carla -> Diego')
  );

  perform public.create_balance_request(
    v_diego_id,
    'demo-historic-d-a-request',
    'balance_increase',
    v_ana_id,
    v_diego_id,
    v_ana_id,
    60000,
    'Historico | Taxi Diego -> Ana'
  );

  perform public.accept_financial_request(
    v_ana_id,
    'demo-historic-d-a-accept',
    (select id from public.financial_requests where description = 'Historico | Taxi Diego -> Ana')
  );

  select public.compute_graph_snapshot_hash(),
         coalesce(
           (
             select jsonb_agg(row_to_json(edge))
             from public.v_pair_net_edges_authoritative edge
           ),
           '[]'::jsonb
         )
    into v_historic_hash, v_historic_snapshot;

  v_historic_proposal_id := (
    public.propose_cycle_settlement(
      v_ana_id,
      'demo-historic-cycle-proposal',
      v_historic_hash,
      v_historic_snapshot,
      jsonb_build_array(
        jsonb_build_object('debtor_user_id', v_bruno_id, 'creditor_user_id', v_ana_id, 'amount_minor', 60000),
        jsonb_build_object('debtor_user_id', v_carla_id, 'creditor_user_id', v_bruno_id, 'amount_minor', 60000),
        jsonb_build_object('debtor_user_id', v_diego_id, 'creditor_user_id', v_carla_id, 'amount_minor', 60000),
        jsonb_build_object('debtor_user_id', v_ana_id, 'creditor_user_id', v_diego_id, 'amount_minor', 60000)
      ),
      array[v_ana_id, v_bruno_id, v_carla_id, v_diego_id]
    ) ->> 'proposalId'
  )::uuid;

  perform public.decide_cycle_settlement(v_bruno_id, 'demo-historic-cycle-bruno-approve', v_historic_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_carla_id, 'demo-historic-cycle-carla-approve', v_historic_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_diego_id, 'demo-historic-cycle-diego-approve', v_historic_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_ana_id, 'demo-historic-cycle-ana-approve', v_historic_proposal_id, 'approved');
  perform public.execute_cycle_settlement(v_ana_id, 'demo-historic-cycle-execute', v_historic_proposal_id);

  perform public.create_balance_request(
    v_ana_id,
    'demo-live-a-b-request',
    'balance_increase',
    v_bruno_id,
    v_ana_id,
    v_bruno_id,
    180000,
    'Demo live | Hotel Ana -> Bruno'
  );

  perform public.accept_financial_request(
    v_bruno_id,
    'demo-live-a-b-accept',
    (select id from public.financial_requests where description = 'Demo live | Hotel Ana -> Bruno')
  );

  perform public.create_balance_request(
    v_bruno_id,
    'demo-live-b-c-request',
    'balance_increase',
    v_carla_id,
    v_bruno_id,
    v_carla_id,
    120000,
    'Demo live | Gasolina Bruno -> Carla'
  );

  perform public.accept_financial_request(
    v_carla_id,
    'demo-live-b-c-accept',
    (select id from public.financial_requests where description = 'Demo live | Gasolina Bruno -> Carla')
  );

  perform public.create_balance_request(
    v_carla_id,
    'demo-live-c-d-request',
    'balance_increase',
    v_diego_id,
    v_carla_id,
    v_diego_id,
    120000,
    'Demo live | Almuerzo Carla -> Diego'
  );

  perform public.accept_financial_request(
    v_diego_id,
    'demo-live-c-d-accept',
    (select id from public.financial_requests where description = 'Demo live | Almuerzo Carla -> Diego')
  );

  perform public.create_balance_request(
    v_diego_id,
    'demo-live-d-a-request',
    'balance_increase',
    v_ana_id,
    v_diego_id,
    v_ana_id,
    120000,
    'Demo live | Tiquetes Diego -> Ana'
  );

  perform public.accept_financial_request(
    v_ana_id,
    'demo-live-d-a-accept',
    (select id from public.financial_requests where description = 'Demo live | Tiquetes Diego -> Ana')
  );

  select public.compute_graph_snapshot_hash(),
         coalesce(
           (
             select jsonb_agg(row_to_json(edge))
             from public.v_pair_net_edges_authoritative edge
           ),
           '[]'::jsonb
         )
    into v_live_hash, v_live_snapshot;

  v_live_proposal_id := (
    public.propose_cycle_settlement(
      v_ana_id,
      'demo-live-cycle-proposal',
      v_live_hash,
      v_live_snapshot,
      jsonb_build_array(
        jsonb_build_object('debtor_user_id', v_bruno_id, 'creditor_user_id', v_ana_id, 'amount_minor', 120000),
        jsonb_build_object('debtor_user_id', v_carla_id, 'creditor_user_id', v_bruno_id, 'amount_minor', 120000),
        jsonb_build_object('debtor_user_id', v_diego_id, 'creditor_user_id', v_carla_id, 'amount_minor', 120000),
        jsonb_build_object('debtor_user_id', v_ana_id, 'creditor_user_id', v_diego_id, 'amount_minor', 120000)
      ),
      array[v_ana_id, v_bruno_id, v_carla_id, v_diego_id]
    ) ->> 'proposalId'
  )::uuid;

  perform public.decide_cycle_settlement(v_bruno_id, 'demo-live-cycle-bruno-approve', v_live_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_carla_id, 'demo-live-cycle-carla-approve', v_live_proposal_id, 'approved');
  perform public.decide_cycle_settlement(v_diego_id, 'demo-live-cycle-diego-approve', v_live_proposal_id, 'approved');

  perform public.create_balance_request(
    v_carla_id,
    'demo-pending-incoming-request',
    'balance_increase',
    v_ana_id,
    v_carla_id,
    v_ana_id,
    35000,
    'Pendiente | Carla le debe a Ana por entradas'
  );

  perform public.create_balance_request(
    v_ana_id,
    'demo-pending-outgoing-request',
    'balance_increase',
    v_diego_id,
    v_ana_id,
    v_diego_id,
    28000,
    'Pendiente | Ana le debe a Diego por parqueadero'
  );

  update public.financial_requests
  set created_at = v_historic_request_1_created_at,
      updated_at = v_historic_request_1_resolved_at,
      resolved_at = v_historic_request_1_resolved_at
  where description = 'Historico | Mercado Ana -> Bruno';

  update public.financial_requests
  set created_at = v_historic_request_2_created_at,
      updated_at = v_historic_request_2_resolved_at,
      resolved_at = v_historic_request_2_resolved_at
  where description = 'Historico | Viaje Bruno -> Carla';

  update public.financial_requests
  set created_at = v_historic_request_3_created_at,
      updated_at = v_historic_request_3_resolved_at,
      resolved_at = v_historic_request_3_resolved_at
  where description = 'Historico | Cena Carla -> Diego';

  update public.financial_requests
  set created_at = v_historic_request_4_created_at,
      updated_at = v_historic_request_4_resolved_at,
      resolved_at = v_historic_request_4_resolved_at
  where description = 'Historico | Taxi Diego -> Ana';

  update public.financial_requests
  set created_at = v_live_request_1_created_at,
      updated_at = v_live_request_1_resolved_at,
      resolved_at = v_live_request_1_resolved_at
  where description = 'Demo live | Hotel Ana -> Bruno';

  update public.financial_requests
  set created_at = v_live_request_2_created_at,
      updated_at = v_live_request_2_resolved_at,
      resolved_at = v_live_request_2_resolved_at
  where description = 'Demo live | Gasolina Bruno -> Carla';

  update public.financial_requests
  set created_at = v_live_request_3_created_at,
      updated_at = v_live_request_3_resolved_at,
      resolved_at = v_live_request_3_resolved_at
  where description = 'Demo live | Almuerzo Carla -> Diego';

  update public.financial_requests
  set created_at = v_live_request_4_created_at,
      updated_at = v_live_request_4_resolved_at,
      resolved_at = v_live_request_4_resolved_at
  where description = 'Demo live | Tiquetes Diego -> Ana';

  update public.financial_requests
  set created_at = v_pending_incoming_created_at,
      updated_at = v_pending_incoming_created_at
  where description = 'Pendiente | Carla le debe a Ana por entradas';

  update public.financial_requests
  set created_at = v_pending_outgoing_created_at,
      updated_at = v_pending_outgoing_created_at
  where description = 'Pendiente | Ana le debe a Diego por parqueadero';

  update public.ledger_transactions
  set created_at = case description
    when 'Historico | Mercado Ana -> Bruno' then v_historic_request_1_resolved_at
    when 'Historico | Viaje Bruno -> Carla' then v_historic_request_2_resolved_at
    when 'Historico | Cena Carla -> Diego' then v_historic_request_3_resolved_at
    when 'Historico | Taxi Diego -> Ana' then v_historic_request_4_resolved_at
    when 'Demo live | Hotel Ana -> Bruno' then v_live_request_1_resolved_at
    when 'Demo live | Gasolina Bruno -> Carla' then v_live_request_2_resolved_at
    when 'Demo live | Almuerzo Carla -> Diego' then v_live_request_3_resolved_at
    when 'Demo live | Tiquetes Diego -> Ana' then v_live_request_4_resolved_at
    else created_at
  end
  where description in (
    'Historico | Mercado Ana -> Bruno',
    'Historico | Viaje Bruno -> Carla',
    'Historico | Cena Carla -> Diego',
    'Historico | Taxi Diego -> Ana',
    'Demo live | Hotel Ana -> Bruno',
    'Demo live | Gasolina Bruno -> Carla',
    'Demo live | Almuerzo Carla -> Diego',
    'Demo live | Tiquetes Diego -> Ana'
  );

  update public.ledger_entries
  set created_at = tx.created_at
  from public.ledger_transactions tx
  where public.ledger_entries.ledger_transaction_id = tx.id
    and tx.description in (
      'Historico | Mercado Ana -> Bruno',
      'Historico | Viaje Bruno -> Carla',
      'Historico | Cena Carla -> Diego',
      'Historico | Taxi Diego -> Ana',
      'Demo live | Hotel Ana -> Bruno',
      'Demo live | Gasolina Bruno -> Carla',
      'Demo live | Almuerzo Carla -> Diego',
      'Demo live | Tiquetes Diego -> Ana'
    );

  update public.settlement_proposals
  set created_at = v_historic_proposal_created_at,
      updated_at = v_historic_executed_at,
      executed_at = v_historic_executed_at
  where id = v_historic_proposal_id;

  update public.settlement_proposal_participants
  set created_at = v_historic_proposal_created_at,
      decision = 'approved',
      decided_at = case participant_user_id
        when v_bruno_id then v_historic_bruno_decided_at
        when v_carla_id then v_historic_carla_decided_at
        when v_diego_id then v_historic_diego_decided_at
        when v_ana_id then v_historic_ana_decided_at
        else decided_at
      end
  where settlement_proposal_id = v_historic_proposal_id;

  update public.settlement_executions
  set created_at = v_historic_executed_at
  where settlement_proposal_id = v_historic_proposal_id;

  update public.ledger_transactions
  set created_at = v_historic_executed_at
  where origin_settlement_proposal_id = v_historic_proposal_id;

  update public.ledger_entries
  set created_at = v_historic_executed_at
  where ledger_transaction_id in (
    select id
    from public.ledger_transactions
    where origin_settlement_proposal_id = v_historic_proposal_id
  );

  update public.settlement_proposals
  set created_at = v_live_proposal_created_at,
      updated_at = v_live_diego_decided_at
  where id = v_live_proposal_id;

  update public.settlement_proposal_participants
  set created_at = v_live_proposal_created_at,
      decision = case participant_user_id
        when v_bruno_id then 'approved'
        when v_carla_id then 'approved'
        when v_diego_id then 'approved'
        else 'pending'
      end,
      decided_at = case participant_user_id
        when v_bruno_id then v_live_bruno_decided_at
        when v_carla_id then v_live_carla_decided_at
        when v_diego_id then v_live_diego_decided_at
        else null
      end
  where settlement_proposal_id = v_live_proposal_id;

  update public.ledger_accounts
  set created_at = v_relationships_created_at
  where owner_user_id in (v_ana_id, v_bruno_id, v_carla_id, v_diego_id)
    and counterparty_user_id in (v_ana_id, v_bruno_id, v_carla_id, v_diego_id);

  perform public.refresh_all_pair_net_edges_cache();

  return jsonb_build_object(
    'status', 'ok',
    'seedPassword', v_seed_password,
    'pendingSettlementProposalId', v_live_proposal_id,
    'demoUsers', jsonb_build_array(
      jsonb_build_object('email', 'ana@example.com', 'displayName', 'Ana Torres'),
      jsonb_build_object('email', 'bruno@example.com', 'displayName', 'Bruno Diaz'),
      jsonb_build_object('email', 'carla@example.com', 'displayName', 'Carla Mejia'),
      jsonb_build_object('email', 'diego@example.com', 'displayName', 'Diego Ruiz')
    )
  );
end;
$$;

create or replace function public.trust_demo_devices()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  update public.trusted_devices
  set trust_state = 'trusted',
      trusted_at = coalesce(trusted_at, timezone('utc', now())),
      revoked_at = null,
      last_seen_at = timezone('utc', now())
  where user_id in (
    '00000000-0000-0000-0000-0000000000a1'::uuid,
    '00000000-0000-0000-0000-0000000000b2'::uuid,
    '00000000-0000-0000-0000-0000000000c3'::uuid,
    '00000000-0000-0000-0000-0000000000d4'::uuid
  )
    and trust_state <> 'trusted';

  get diagnostics v_updated_count = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'trustedDevicesUpdated', v_updated_count
  );
end;
$$;

revoke all on function public.reset_demo_data() from public, anon, authenticated;
revoke all on function public.seed_demo_data() from public, anon, authenticated;
revoke all on function public.trust_demo_devices() from public, anon, authenticated;
