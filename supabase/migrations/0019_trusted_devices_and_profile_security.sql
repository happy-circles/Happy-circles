create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  device_id text not null,
  platform text not null,
  device_name text,
  app_version text,
  trust_state text not null default 'pending' check (trust_state in ('pending', 'trusted', 'revoked')),
  trusted_at timestamptz,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);

create unique index if not exists trusted_devices_user_device_unique_idx
  on public.trusted_devices (user_id, device_id);

create index if not exists trusted_devices_user_last_seen_idx
  on public.trusted_devices (user_id, last_seen_at desc);

alter table public.trusted_devices enable row level security;

drop policy if exists trusted_devices_select_self on public.trusted_devices;
create policy trusted_devices_select_self
on public.trusted_devices
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists trusted_devices_insert_self on public.trusted_devices;
create policy trusted_devices_insert_self
on public.trusted_devices
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists trusted_devices_update_self on public.trusted_devices;
create policy trusted_devices_update_self
on public.trusted_devices
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.trusted_devices to authenticated;

grant update (
  display_name,
  phone_country_iso2,
  phone_country_calling_code,
  phone_national_number,
  phone_e164
) on public.user_profiles to authenticated;
