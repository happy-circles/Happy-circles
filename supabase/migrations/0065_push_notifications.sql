create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  device_id text,
  device_name text,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  disabled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint push_devices_token_shape check (
    expo_push_token like 'ExpoPushToken[%]'
    or expo_push_token like 'ExponentPushToken[%]'
  )
);

create unique index if not exists push_devices_expo_push_token_key
  on public.push_devices (expo_push_token);

create index if not exists push_devices_active_user_idx
  on public.push_devices (user_id, last_seen_at desc)
  where enabled;

create index if not exists push_devices_user_device_idx
  on public.push_devices (user_id, device_id)
  where device_id is not null;

drop trigger if exists push_devices_set_updated_at on public.push_devices;
create trigger push_devices_set_updated_at
before update on public.push_devices
for each row execute function public.tg_set_updated_at();

alter table public.push_devices enable row level security;
grant select, insert, update, delete on public.push_devices to service_role;

create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.user_profiles (id) on delete cascade,
  notification_key text not null,
  source_kind text not null,
  source_item_id text not null,
  title text not null,
  body text not null,
  href text not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'sent', 'failed', 'skipped')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  worker_id text,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  processing_started_at timestamptz,
  sent_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint push_notification_events_key_not_empty check (length(btrim(notification_key)) > 0)
);

create unique index if not exists push_notification_events_recipient_key_idx
  on public.push_notification_events (recipient_user_id, notification_key);

create index if not exists push_notification_events_pending_idx
  on public.push_notification_events (created_at)
  where status = 'pending';

drop trigger if exists push_notification_events_set_updated_at on public.push_notification_events;
create trigger push_notification_events_set_updated_at
before update on public.push_notification_events
for each row execute function public.tg_set_updated_at();

alter table public.push_notification_events enable row level security;
grant select, insert, update, delete on public.push_notification_events to service_role;

create or replace function public.claim_push_notification_events(
  p_worker_id text,
  p_limit integer default 25
)
returns table (
  id uuid,
  recipient_user_id uuid,
  notification_key text,
  source_kind text,
  source_item_id text,
  title text,
  body text,
  href text,
  attempts integer,
  max_attempts integer,
  metadata_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if v_worker_id is null then
    raise exception 'invalid_worker_id';
  end if;

  update public.push_notification_events
  set status = 'pending',
      worker_id = null,
      processing_started_at = null,
      last_error = coalesce(last_error, 'processing_timeout'),
      updated_at = timezone('utc', now())
  where status = 'processing'
    and processing_started_at < timezone('utc', now()) - interval '5 minutes'
    and attempts < max_attempts;

  return query
  with candidates as (
    select event.id
    from public.push_notification_events event
    where event.status = 'pending'
      and event.attempts < event.max_attempts
    order by event.created_at asc
    limit v_limit
    for update skip locked
  )
  update public.push_notification_events event
  set status = 'processing',
      attempts = event.attempts + 1,
      worker_id = v_worker_id,
      processing_started_at = timezone('utc', now()),
      last_error = null,
      updated_at = timezone('utc', now())
  from candidates
  where event.id = candidates.id
  returning
    event.id,
    event.recipient_user_id,
    event.notification_key,
    event.source_kind,
    event.source_item_id,
    event.title,
    event.body,
    event.href,
    event.attempts,
    event.max_attempts,
    event.metadata_json;
end;
$$;

revoke all on function public.claim_push_notification_events(text, integer) from public;
grant execute on function public.claim_push_notification_events(text, integer) to service_role;
