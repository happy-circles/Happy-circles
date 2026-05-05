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
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000001201',
  'authenticated',
  'authenticated',
  'support-observability@example.com',
  extensions.crypt('Circles1234', extensions.gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Support Observability"}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now()),
  '',
  '',
  '',
  ''
)
on conflict (id) do update
set email = excluded.email,
    aud = excluded.aud,
    role = excluded.role,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = excluded.updated_at;

insert into public.user_profiles (id, email, display_name)
values (
  '00000000-0000-0000-0000-000000001201',
  'support-observability@example.com',
  'Support Observability'
)
on conflict (id) do update
set email = excluded.email,
    display_name = excluded.display_name;

do $$
declare
  v_report_id uuid;
  v_user_id uuid := '00000000-0000-0000-0000-000000001201';
  v_metadata jsonb;
begin
  delete from public.support_error_reports
  where support_id = 'HC-AB12-CD34-EF56';

  if has_table_privilege('authenticated', 'public.support_error_reports', 'INSERT') then
    raise exception 'authenticated must not insert support_error_reports directly';
  end if;

  v_report_id := public.record_support_error_report(
    v_user_id,
    'HC-AB12-CD34-EF56',
    'edge_function',
    'HC-AB12-CD34-EF56',
    'request_failed',
    'No se pudo completar la accion.',
    'create-balance-request',
    'register',
    'register',
    'ios',
    '0.1.0',
    false,
    timezone('utc', now()),
    jsonb_build_object(
      'action', 'create_request',
      'status', 400,
      'phone', '+570000000000',
      'description', 'free-form text must be dropped'
    )
  );

  if v_report_id is null then
    raise exception 'expected support report id';
  end if;

  select metadata_json
    into v_metadata
  from public.support_error_reports
  where id = v_report_id;

  if v_metadata ? 'phone' or v_metadata ? 'description' then
    raise exception 'support report metadata leaked disallowed keys';
  end if;

  if v_metadata ->> 'action' <> 'create_request' then
    raise exception 'support report metadata did not keep allowlisted action';
  end if;
end $$;
