revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
grant execute on function public.auth_email_exists(text) to service_role;

drop policy if exists analytics_user_lifecycle_facts_client_deny_all
  on public.analytics_user_lifecycle_facts;
create policy analytics_user_lifecycle_facts_client_deny_all
on public.analytics_user_lifecycle_facts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists analytics_daily_event_facts_client_deny_all
  on public.analytics_daily_event_facts;
create policy analytics_daily_event_facts_client_deny_all
on public.analytics_daily_event_facts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists analytics_daily_feature_facts_client_deny_all
  on public.analytics_daily_feature_facts;
create policy analytics_daily_feature_facts_client_deny_all
on public.analytics_daily_feature_facts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists edge_rate_limits_client_deny_all
  on public.edge_rate_limits;
create policy edge_rate_limits_client_deny_all
on public.edge_rate_limits
for all
to anon, authenticated
using (false)
with check (false);
