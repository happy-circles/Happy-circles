do $$
begin
  if to_regclass('public.notification_views') is null then
    raise exception 'expected public.notification_views to exist';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'notification_views'
      and indexname = 'notification_views_user_viewed_at_idx'
  ) then
    raise exception 'expected notification_views_user_viewed_at_idx to exist';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_views'
      and policyname = 'notification_views_select_self'
  ) then
    raise exception 'expected notification_views_select_self policy';
  end if;

  if not has_table_privilege('authenticated', 'public.notification_views', 'SELECT')
    or not has_table_privilege('authenticated', 'public.notification_views', 'INSERT')
    or not has_table_privilege('authenticated', 'public.notification_views', 'UPDATE') then
    raise exception 'expected authenticated read/write privileges on notification_views';
  end if;
end
$$;

select '1..1';
select 'ok 1 - notification view receipts are private per-user state';
