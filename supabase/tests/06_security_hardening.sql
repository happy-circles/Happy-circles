do $$
declare
  v_missing_security_invoker text;
  v_exposed_token_view text;
  v_raw_token_column text;
  v_nullable_token_hash text;
  v_direct_rpc text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ')
    into v_missing_security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in (
      'v_friendship_invites_live',
      'v_friendship_invite_deliveries_live',
      'v_account_invites_live',
      'v_account_invite_deliveries_live',
      'v_user_profiles_private',
      'v_user_profiles_visible'
    )
    and not coalesce(c.reloptions, array[]::text[]) @> array['security_invoker=true'];

  if v_missing_security_invoker is not null then
    raise exception 'expected security_invoker=true on views: %', v_missing_security_invoker;
  end if;

  select string_agg(format('%I.%I.%I', table_schema, table_name, column_name), ', ')
    into v_exposed_token_view
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'v_friendship_invite_deliveries_live',
      'v_account_invite_deliveries_live'
    )
    and column_name = 'token';

  if v_exposed_token_view is not null then
    raise exception 'delivery live views must not expose raw tokens: %', v_exposed_token_view;
  end if;

  select string_agg(format('%I.%I.%I', table_schema, table_name, column_name), ', ')
    into v_raw_token_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'friendship_invite_deliveries',
      'account_invite_deliveries'
    )
    and column_name = 'token';

  if v_raw_token_column is not null then
    raise exception 'delivery tables must not persist raw tokens: %', v_raw_token_column;
  end if;

  select string_agg(format('%I.%I.%I', table_schema, table_name, column_name), ', ')
    into v_nullable_token_hash
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'friendship_invite_deliveries',
      'account_invite_deliveries'
    )
    and column_name = 'token_hash'
    and is_nullable <> 'NO';

  if v_nullable_token_hash is not null then
    raise exception 'delivery token hashes must be required: %', v_nullable_token_hash;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ')
    into v_direct_rpc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and exists (
      select 1
      from unnest(coalesce(p.proargnames, array[]::text[])) as arg_name
      where arg_name = 'p_actor_user_id'
    )
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  if v_direct_rpc is not null then
    raise exception 'sensitive actor RPCs must only execute through service_role: %', v_direct_rpc;
  end if;

  if has_function_privilege(
    'anon',
    'public.get_account_invite_preview_public(text,boolean,text)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.get_account_invite_preview_public(text,boolean,text)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'public preview RPC must be reachable only through its Edge Function';
  end if;
end
$$;

select '1..1';
select 'ok 1 - security hardening guardrails';
