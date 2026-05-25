create index if not exists analytics_daily_event_facts_event_name_idx
  on public.analytics_daily_event_facts (event_name);

create index if not exists analytics_user_lifecycle_facts_invited_by_user_id_idx
  on public.analytics_user_lifecycle_facts (invited_by_user_id)
  where invited_by_user_id is not null;

create index if not exists happy_circle_cases_anchor_user_high_id_idx
  on public.happy_circle_cases (anchor_user_high_id);

create index if not exists happy_circle_cases_created_by_user_id_idx
  on public.happy_circle_cases (created_by_user_id);

drop policy if exists notification_views_select_self on public.notification_views;
create policy notification_views_select_self
on public.notification_views
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists notification_views_insert_self on public.notification_views;
create policy notification_views_insert_self
on public.notification_views
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists notification_views_update_self on public.notification_views;
create policy notification_views_update_self
on public.notification_views
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists account_deletion_requests_select_self on public.account_deletion_requests;
create policy account_deletion_requests_select_self
on public.account_deletion_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists happy_circle_score_events_select_self on public.happy_circle_score_events;
create policy happy_circle_score_events_select_self
on public.happy_circle_score_events
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists happy_circle_cases_client_deny_write on public.happy_circle_cases;

drop policy if exists happy_circle_cases_client_deny_insert on public.happy_circle_cases;
create policy happy_circle_cases_client_deny_insert
on public.happy_circle_cases
for insert
to anon, authenticated
with check (false);

drop policy if exists happy_circle_cases_client_deny_update on public.happy_circle_cases;
create policy happy_circle_cases_client_deny_update
on public.happy_circle_cases
for update
to anon, authenticated
using (false)
with check (false);

drop policy if exists happy_circle_cases_client_deny_delete on public.happy_circle_cases;
create policy happy_circle_cases_client_deny_delete
on public.happy_circle_cases
for delete
to anon, authenticated
using (false);
