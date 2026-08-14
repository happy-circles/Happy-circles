\set ON_ERROR_STOP on

grant usage on schema auth to supabase_realtime_admin;
set role supabase_realtime_admin;

alter table realtime.messages enable row level security;

drop policy if exists happy_circles_snapshot_broadcast_select on realtime.messages;
create policy happy_circles_snapshot_broadcast_select
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = ('user:' || (select auth.uid())::text)
);

reset role;
