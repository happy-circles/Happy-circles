do $$
declare
  v_demo_function text;
  v_legacy_avatar_policy text;
begin
  select string_agg(function_name, ', ')
    into v_demo_function
  from (
    values
      ('seed_demo_data'),
      ('reset_demo_data'),
      ('trust_demo_devices')
  ) as function_names(function_name)
  where to_regprocedure(format('public.%I()', function_name)) is not null;

  if v_demo_function is not null then
    raise exception 'demo helpers must not exist after production migrations: %', v_demo_function;
  end if;

  if exists (
    select 1
    from storage.buckets
    where id = 'avatars'
      and public
  ) then
    raise exception 'avatars bucket must be private';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.user_profiles',
    'avatar_path',
    'UPDATE'
  ) then
    raise exception 'authenticated users must not update avatar_path directly';
  end if;

  select string_agg(policyname, ', ')
    into v_legacy_avatar_policy
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'avatars_select_public',
      'avatars_insert_own',
      'avatars_update_own',
      'avatars_delete_own'
    );

  if v_legacy_avatar_policy is not null then
    raise exception 'legacy avatar storage policies must be removed: %', v_legacy_avatar_policy;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_select_related'
  ) then
    raise exception 'avatars_select_related policy is required';
  end if;
end
$$;

select '1..1';
select 'ok 1 - avatar storage and demo migration guardrails';
