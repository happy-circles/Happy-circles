alter table public.user_profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deleted_at timestamptz;

revoke update on public.user_profiles from anon, authenticated;
grant update (
  display_name,
  phone_country_iso2,
  phone_country_calling_code,
  phone_national_number,
  phone_e164
) on public.user_profiles to authenticated;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete restrict,
  status text not null default 'completed' check (status in ('completed')),
  idempotency_key text not null,
  requested_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz not null default timezone('utc', now()),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists account_deletion_requests_user_key_idx
  on public.account_deletion_requests (user_id, idempotency_key);

create index if not exists account_deletion_requests_user_created_idx
  on public.account_deletion_requests (user_id, created_at desc);

drop trigger if exists set_account_deletion_requests_updated_at on public.account_deletion_requests;
create trigger set_account_deletion_requests_updated_at
before update on public.account_deletion_requests
for each row execute function public.tg_set_updated_at();

alter table public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_requests_select_self on public.account_deletion_requests;
create policy account_deletion_requests_select_self
on public.account_deletion_requests
for select
to authenticated
using (auth.uid() = user_id);

grant select on public.account_deletion_requests to authenticated;

drop function if exists public.request_account_deletion(uuid, text);

create or replace function public.request_account_deletion(
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idempotency public.idempotency_keys%rowtype;
  v_profile public.user_profiles%rowtype;
  v_request_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_deleted_email text;
  v_revoked_device_count integer := 0;
  v_response jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_required';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    raise exception 'invalid_idempotency_key';
  end if;

  insert into public.idempotency_keys (actor_user_id, operation_name, idempotency_key)
  values (p_actor_user_id, 'request_account_deletion', trim(p_idempotency_key))
  on conflict (actor_user_id, operation_name, idempotency_key) do nothing;

  select *
    into v_idempotency
  from public.idempotency_keys
  where actor_user_id = p_actor_user_id
    and operation_name = 'request_account_deletion'
    and idempotency_key = trim(p_idempotency_key)
  for update;

  if v_idempotency.response_json is not null then
    return v_idempotency.response_json;
  end if;

  select *
    into v_profile
  from public.user_profiles
  where id = p_actor_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  insert into public.account_deletion_requests (
    user_id,
    status,
    idempotency_key,
    requested_at,
    processed_at,
    metadata_json
  )
  values (
    p_actor_user_id,
    'completed',
    trim(p_idempotency_key),
    coalesce(v_profile.deletion_requested_at, v_now),
    v_now,
    jsonb_build_object('mode', 'anonymize_profile_retain_ledger')
  )
  on conflict (user_id, idempotency_key) do update
  set
    status = 'completed',
    processed_at = coalesce(public.account_deletion_requests.processed_at, excluded.processed_at),
    metadata_json = public.account_deletion_requests.metadata_json || excluded.metadata_json
  returning id into v_request_id;

  update public.trusted_devices
  set
    trust_state = 'revoked',
    revoked_at = coalesce(revoked_at, v_now)
  where user_id = p_actor_user_id
    and trust_state <> 'revoked';

  get diagnostics v_revoked_device_count = row_count;

  v_deleted_email := 'deleted+' || replace(p_actor_user_id::text, '-', '') || '@happy-circles.invalid';

  update public.user_profiles
  set
    email = v_deleted_email,
    display_name = 'Cuenta eliminada',
    phone_country_iso2 = null,
    phone_country_calling_code = null,
    phone_national_number = null,
    phone_e164 = null,
    avatar_path = null,
    deletion_requested_at = coalesce(deletion_requested_at, v_now),
    deleted_at = coalesce(deleted_at, v_now),
    updated_at = v_now
  where id = p_actor_user_id;

  perform public.append_audit_event(
    p_actor_user_id,
    'user_profile',
    p_actor_user_id,
    'account_deletion_completed',
    v_request_id,
    jsonb_build_object(
      'mode', 'anonymize_profile_retain_ledger',
      'revoked_device_count', v_revoked_device_count
    )
  );

  v_response := jsonb_build_object(
    'requestId', v_request_id,
    'status', 'completed',
    'processedAt', v_now,
    'retentionMode', 'anonymize_profile_retain_ledger',
    'revokedDeviceCount', v_revoked_device_count
  );

  update public.idempotency_keys
  set response_json = v_response
  where id = v_idempotency.id;

  return v_response;
end;
$$;

revoke all on function public.request_account_deletion(uuid, text)
  from public, anon, authenticated;
grant execute on function public.request_account_deletion(uuid, text)
  to service_role;
