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
    aud = excluded.aud,
    role = excluded.role,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at,
    confirmation_token = excluded.confirmation_token,
    email_change = excluded.email_change,
    email_change_token_new = excluded.email_change_token_new,
    recovery_token = excluded.recovery_token;

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

insert into public.user_profiles (id, email, display_name)
select
  demo_users.id,
  demo_users.email,
  demo_users.display_name
from (
  values
    ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ana@example.com', 'Ana'),
    ('00000000-0000-0000-0000-0000000000b2'::uuid, 'bruno@example.com', 'Bruno'),
    ('00000000-0000-0000-0000-0000000000c3'::uuid, 'carla@example.com', 'Carla'),
    ('00000000-0000-0000-0000-0000000000d4'::uuid, 'diego@example.com', 'Diego')
) as demo_users(id, email, display_name)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name;
