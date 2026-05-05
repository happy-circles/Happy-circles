create table if not exists public.notification_views (
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  notification_key text not null,
  notification_kind text not null,
  source_item_id text not null,
  notification_status text not null,
  viewed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, notification_key),
  constraint notification_views_key_not_blank check (btrim(notification_key) <> ''),
  constraint notification_views_kind_not_blank check (btrim(notification_kind) <> ''),
  constraint notification_views_source_not_blank check (btrim(source_item_id) <> ''),
  constraint notification_views_status_not_blank check (btrim(notification_status) <> '')
);

comment on table public.notification_views is
  'Per-user notification read receipts used to separate pending alerts from reviewed alerts.';

create index if not exists notification_views_user_viewed_at_idx
  on public.notification_views (user_id, viewed_at desc);

drop trigger if exists set_notification_views_updated_at on public.notification_views;
create trigger set_notification_views_updated_at
before update on public.notification_views
for each row execute function public.tg_set_updated_at();

alter table public.notification_views enable row level security;

drop policy if exists notification_views_select_self on public.notification_views;
create policy notification_views_select_self
on public.notification_views
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists notification_views_insert_self on public.notification_views;
create policy notification_views_insert_self
on public.notification_views
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists notification_views_update_self on public.notification_views;
create policy notification_views_update_self
on public.notification_views
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.notification_views to authenticated;
