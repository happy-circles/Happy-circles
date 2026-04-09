with demo_users as (
  select *
  from (
    values
      ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ana@example.com', 'Ana'),
      ('00000000-0000-0000-0000-0000000000b2'::uuid, 'bruno@example.com', 'Bruno'),
      ('00000000-0000-0000-0000-0000000000c3'::uuid, 'carla@example.com', 'Carla'),
      ('00000000-0000-0000-0000-0000000000d4'::uuid, 'diego@example.com', 'Diego')
  ) as seed_user(id, email, display_name)
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
  extensions.crypt('Circles1234', extensions.gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', demo_users.display_name),
  timezone('utc', now()),
  timezone('utc', now()),
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
      ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ana@example.com'),
      ('00000000-0000-0000-0000-0000000000b2'::uuid, 'bruno@example.com'),
      ('00000000-0000-0000-0000-0000000000c3'::uuid, 'carla@example.com'),
      ('00000000-0000-0000-0000-0000000000d4'::uuid, 'diego@example.com')
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
  timezone('utc', now()),
  timezone('utc', now()),
  timezone('utc', now()),
  gen_random_uuid()
from demo_users
where not exists (
  select 1
  from auth.identities
  where user_id = demo_users.id
    and provider = 'email'
);

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
