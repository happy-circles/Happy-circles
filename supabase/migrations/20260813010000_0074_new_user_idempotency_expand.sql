-- Expand the new-user idempotency contract in a short, single-hot-table batch.
-- The NOT VALID checks below protect every new write immediately. Historical
-- rows are validated later in Phase B, after rollout, to avoid a table scan in
-- this compatibility migration.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

create table if not exists app_private.backend_secrets (
  name text primary key,
  secret bytea not null,
  created_at timestamptz not null default timezone('utc', now())
);

revoke all on table app_private.backend_secrets from public, anon, authenticated;

alter table public.idempotency_keys
  add column if not exists request_hash text,
  add column if not exists completed_at timestamptz,
  add column if not exists expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.idempotency_keys'::regclass
      and conname = 'idempotency_keys_key_length_check'
  ) then
    alter table public.idempotency_keys
      add constraint idempotency_keys_key_length_check
        check (
          operation_name not in (
            'create_account_invite',
            'activate_account_from_invite',
            'claim_external_friendship_invite'
          )
          or request_hash is null
          or length(btrim(idempotency_key)) between 8 and 128
        ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.idempotency_keys'::regclass
      and conname = 'idempotency_keys_request_hash_format_check'
  ) then
    alter table public.idempotency_keys
      add constraint idempotency_keys_request_hash_format_check
        check (request_hash is null or request_hash ~ '^[0-9a-f]{64}$') not valid;
  end if;
end
$$;
