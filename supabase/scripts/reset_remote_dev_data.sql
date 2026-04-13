begin;

do $$
declare
  truncate_public_sql text;
begin
  select
    'truncate table ' ||
    string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename) ||
    ' cascade'
  into truncate_public_sql
  from pg_tables
  where schemaname = 'public';

  if truncate_public_sql is not null then
    execute truncate_public_sql;
  end if;
end;
$$;

truncate table
  auth.audit_log_entries,
  auth.flow_state,
  auth.identities,
  auth.mfa_amr_claims,
  auth.mfa_challenges,
  auth.mfa_factors,
  auth.oauth_authorizations,
  auth.oauth_client_states,
  auth.oauth_consents,
  auth.one_time_tokens,
  auth.refresh_tokens,
  auth.saml_relay_states,
  auth.sessions,
  auth.users,
  auth.webauthn_challenges,
  auth.webauthn_credentials
cascade;

truncate table
  storage.objects,
  storage.s3_multipart_uploads,
  storage.s3_multipart_uploads_parts
cascade;

commit;
