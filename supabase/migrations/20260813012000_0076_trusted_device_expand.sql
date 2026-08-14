-- Expand trusted-device proof state without holding locks on invite/profile data.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.trusted_devices
  add column if not exists trusted_session_id text,
  add column if not exists trust_proof_method text,
  add column if not exists trust_proof_at timestamptz;

-- Installed clients keep only the exact legacy write surface. Session/proof
-- columns are service-managed and are never writable through the Data API.
revoke insert, update, delete on table public.trusted_devices from authenticated;
grant select on table public.trusted_devices to authenticated;
grant insert (
  user_id, device_id, platform, device_name, app_version, last_seen_at
) on table public.trusted_devices to authenticated;
grant update (
  platform, device_name, app_version,
  trust_state, trusted_at, last_seen_at, revoked_at
) on table public.trusted_devices to authenticated;
