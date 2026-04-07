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
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000a1',
    'authenticated',
    'authenticated',
    'ana@example.com',
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO5HnVn9Yx8RJWb1x1o1t4bmPqhGV8eGa',
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Ana"}',
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000b2',
    'authenticated',
    'authenticated',
    'bruno@example.com',
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO5HnVn9Yx8RJWb1x1o1t4bmPqhGV8eGa',
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Bruno"}',
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000c3',
    'authenticated',
    'authenticated',
    'carla@example.com',
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO5HnVn9Yx8RJWb1x1o1t4bmPqhGV8eGa',
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Carla"}',
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-0000000000d4',
    'authenticated',
    'authenticated',
    'diego@example.com',
    '$2a$10$7EqJtq98hPqEX7fNZaFWoO5HnVn9Yx8RJWb1x1o1t4bmPqhGV8eGa',
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Diego"}',
    timezone('utc', now()),
    timezone('utc', now()),
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

insert into public.app_settings (key, value_json)
values ('currency', '{"code":"COP"}'::jsonb)
on conflict (key) do update set value_json = excluded.value_json;

insert into public.relationships (id, user_low_id, user_high_id, status)
values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'active'),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3', 'active'),
  ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000d4', 'active'),
  ('10000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4', 'active')
on conflict (user_low_id, user_high_id) do nothing;

select public.ensure_relationship_accounts('10000000-0000-0000-0000-0000000000a1');
select public.ensure_relationship_accounts('10000000-0000-0000-0000-0000000000b2');
select public.ensure_relationship_accounts('10000000-0000-0000-0000-0000000000c3');
select public.ensure_relationship_accounts('10000000-0000-0000-0000-0000000000d4');

select public.create_financial_request(
  '00000000-0000-0000-0000-0000000000a1',
  'seed-a-b-request',
  'debt',
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b2',
  120000,
  'Mercado Ana -> Bruno',
  null,
  null
);

select public.accept_financial_request(
  '00000000-0000-0000-0000-0000000000b2',
  'seed-a-b-accept',
  (select id from public.financial_requests where description = 'Mercado Ana -> Bruno')
);

select public.create_financial_request(
  '00000000-0000-0000-0000-0000000000b2',
  'seed-b-c-request',
  'debt',
  '00000000-0000-0000-0000-0000000000c3',
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000c3',
  120000,
  'Viaje Bruno -> Carla',
  null,
  null
);

select public.accept_financial_request(
  '00000000-0000-0000-0000-0000000000c3',
  'seed-b-c-accept',
  (select id from public.financial_requests where description = 'Viaje Bruno -> Carla')
);

select public.create_financial_request(
  '00000000-0000-0000-0000-0000000000c3',
  'seed-c-d-request',
  'debt',
  '00000000-0000-0000-0000-0000000000d4',
  '00000000-0000-0000-0000-0000000000c3',
  '00000000-0000-0000-0000-0000000000d4',
  120000,
  'Cena Carla -> Diego',
  null,
  null
);

select public.accept_financial_request(
  '00000000-0000-0000-0000-0000000000d4',
  'seed-c-d-accept',
  (select id from public.financial_requests where description = 'Cena Carla -> Diego')
);

select public.create_financial_request(
  '00000000-0000-0000-0000-0000000000d4',
  'seed-d-a-request',
  'debt',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000d4',
  '00000000-0000-0000-0000-0000000000a1',
  120000,
  'Taxi Diego -> Ana',
  null,
  null
);

select public.accept_financial_request(
  '00000000-0000-0000-0000-0000000000a1',
  'seed-d-a-accept',
  (select id from public.financial_requests where description = 'Taxi Diego -> Ana')
);

select public.refresh_all_pair_net_edges_cache();
