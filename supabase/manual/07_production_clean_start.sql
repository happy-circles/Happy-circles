-- Production clean-start reset.
--
-- Purpose:
--   Keep the existing production Supabase project and preserve current login
--   identities, while removing test product data before real production usage.
--
-- Required before running:
--   1. Confirm a full database backup exists.
--   2. Confirm the current project has been cloned/restored into the test/demo
--      Supabase project and the clone has been verified.
--   3. Replace v_confirmation below with:
--      BACKUP_AND_TEST_CLONE_VERIFIED
--
-- This script intentionally preserves:
--   - auth.users
--   - auth.identities
--   - public.user_profiles
--   - public.app_settings
--   - public.analytics_event_catalog
--   - storage.buckets
--
-- It removes product state, sessions, tokens, storage object metadata, push
-- registrations, analytics events/facts, invites, balances, settlements,
-- trusted devices, support reports, rate limits, audit events and idempotency.
--
-- This intentionally uses DELETE instead of TRUNCATE CASCADE. Some deleted
-- tables are referenced by preserved tables, for example user_profiles can
-- reference account_invites. TRUNCATE CASCADE can therefore remove preserved
-- rows.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '2min';
set local session_replication_role = replica;

do $$
declare
  v_confirmation constant text := 'REPLACE_WITH_BACKUP_AND_TEST_CLONE_VERIFIED';
  v_expected_user_count constant integer := 23;
  v_auth_user_count integer;
  v_profile_count integer;
  v_identity_count integer;
  v_demo_function text;
  v_public_tables text[] := array[
    'account_deletion_requests',
    'account_invite_deliveries',
    'account_invites',
    'analytics_daily_event_facts',
    'analytics_daily_feature_facts',
    'analytics_daily_product_facts',
    'analytics_daily_user_facts',
    'analytics_user_lifecycle_facts',
    'app_sessions',
    'audit_events',
    'edge_rate_limits',
    'financial_requests',
    'friendship_invite_deliveries',
    'friendship_invites',
    'graph_cycle_jobs',
    'happy_circle_cases',
    'happy_circle_score_events',
    'idempotency_keys',
    'ledger_accounts',
    'ledger_entries',
    'ledger_transactions',
    'notification_views',
    'pair_net_edges_cache',
    'product_events',
    'public_invite_preview_rate_limits',
    'push_devices',
    'push_notification_events',
    'relationships',
    'settlement_executions',
    'settlement_proposal_participants',
    'settlement_proposals',
    'support_error_reports',
    'trusted_devices'
  ];
  v_auth_tables text[] := array[
    'audit_log_entries',
    'flow_state',
    'mfa_amr_claims',
    'mfa_challenges',
    'oauth_authorizations',
    'oauth_client_states',
    'oauth_consents',
    'one_time_tokens',
    'refresh_tokens',
    'saml_relay_states',
    'sessions',
    'webauthn_challenges'
  ];
  v_storage_tables text[] := array[
    'objects',
    's3_multipart_uploads',
    's3_multipart_uploads_parts'
  ];
  v_table text;
begin
  if v_confirmation <> 'BACKUP_AND_TEST_CLONE_VERIFIED' then
    raise exception
      'Refusing to clean production: confirm backup and test clone by editing v_confirmation.';
  end if;

  select count(*) into v_auth_user_count
  from auth.users;

  select count(*) into v_profile_count
  from public.user_profiles;

  select count(*) into v_identity_count
  from auth.identities;

  if v_auth_user_count <> v_expected_user_count then
    raise exception 'Expected % auth.users, found %.', v_expected_user_count, v_auth_user_count;
  end if;

  if v_profile_count <> v_expected_user_count then
    raise exception 'Expected % user_profiles, found %.', v_expected_user_count, v_profile_count;
  end if;

  if v_identity_count < v_expected_user_count then
    raise exception 'Expected at least % auth.identities, found %.', v_expected_user_count, v_identity_count;
  end if;

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
    raise exception 'Demo helper functions must not exist in production: %', v_demo_function;
  end if;

  update public.user_profiles
  set avatar_path = null,
      activated_via_account_invite_id = null,
      updated_at = timezone('utc', now())
  where avatar_path is not null
     or activated_via_account_invite_id is not null;

  foreach v_table in array v_public_tables loop
    if to_regclass(format('%I.%I', 'public', v_table)) is not null then
      execute format('delete from %I.%I', 'public', v_table);
    end if;
  end loop;

  foreach v_table in array v_auth_tables loop
    if to_regclass(format('%I.%I', 'auth', v_table)) is not null then
      execute format('delete from %I.%I', 'auth', v_table);
    end if;
  end loop;

  foreach v_table in array v_storage_tables loop
    if to_regclass(format('%I.%I', 'storage', v_table)) is not null then
      execute format('delete from %I.%I', 'storage', v_table);
    end if;
  end loop;

  select count(*) into v_profile_count
  from public.user_profiles;

  if v_profile_count <> v_expected_user_count then
    raise exception 'Expected % user_profiles after cleanup, found %.', v_expected_user_count, v_profile_count;
  end if;

  raise notice 'Production clean-start data reset completed inside transaction.';
end;
$$;

commit;

select 'auth.users' as target, count(*)::integer as row_count from auth.users
union all
select 'auth.identities', count(*)::integer from auth.identities
union all
select 'auth.sessions', count(*)::integer from auth.sessions
union all
select 'auth.refresh_tokens', count(*)::integer from auth.refresh_tokens
union all
select 'public.user_profiles', count(*)::integer from public.user_profiles
union all
select 'public.app_settings', count(*)::integer from public.app_settings
union all
select 'public.analytics_event_catalog', count(*)::integer from public.analytics_event_catalog
union all
select 'storage.buckets', count(*)::integer from storage.buckets
union all
select 'storage.objects', count(*)::integer from storage.objects
union all
select 'public.relationships', count(*)::integer from public.relationships
union all
select 'public.financial_requests', count(*)::integer from public.financial_requests
union all
select 'public.ledger_transactions', count(*)::integer from public.ledger_transactions
union all
select 'public.ledger_entries', count(*)::integer from public.ledger_entries
union all
select 'public.settlement_proposals', count(*)::integer from public.settlement_proposals
union all
select 'public.friendship_invites', count(*)::integer from public.friendship_invites
union all
select 'public.account_invites', count(*)::integer from public.account_invites
union all
select 'public.product_events', count(*)::integer from public.product_events
union all
select 'public.app_sessions', count(*)::integer from public.app_sessions
union all
select 'public.push_devices', count(*)::integer from public.push_devices
union all
select 'public.trusted_devices', count(*)::integer from public.trusted_devices
order by target;
