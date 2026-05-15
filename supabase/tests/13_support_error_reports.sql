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
  v_error_message text;
  v_route text;
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
    'No se pudo completar la accion. Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz https://app.test/join/invite_token_123456789?access_token=secret-token',
    'create-balance-request',
    'register',
    '/join/invite_token_123456789?code=otp-code',
    'ios',
    '0.1.0',
    false,
    timezone('utc', now()),
    jsonb_build_object(
      'action', 'create_request',
      'status', 400,
      'reason', 'secret=super-secret',
      'phone', '+570000000000',
      'description', 'free-form text must be dropped'
    )
  );

  if v_report_id is null then
    raise exception 'expected support report id';
  end if;

  select metadata_json, error_message, route
    into v_metadata, v_error_message, v_route
  from public.support_error_reports
  where id = v_report_id;

  if v_metadata ? 'phone' or v_metadata ? 'description' then
    raise exception 'support report metadata leaked disallowed keys';
  end if;

  if v_metadata ->> 'action' <> 'create_request' then
    raise exception 'support report metadata did not keep allowlisted action';
  end if;

  if v_error_message like '%eyJ%'
    or v_error_message like '%secret-token%'
    or v_error_message like '%invite_token_123456789%' then
    raise exception 'support report error_message leaked token material';
  end if;

  if v_route like '%otp-code%' or v_route like '%invite_token_123456789%' then
    raise exception 'support report route leaked token material';
  end if;

  if v_metadata ->> 'reason' <> 'secret=[redacted]' then
    raise exception 'support report metadata did not redact allowlisted string secrets';
  end if;
end $$;

select '1..1';
select 'ok 1 - support error reports sanitize metadata and stay service-role only';
