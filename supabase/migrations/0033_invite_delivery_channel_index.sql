drop index if exists public.friendship_invite_deliveries_active_channel_unique_idx;

create unique index if not exists friendship_invite_deliveries_active_qr_unique_idx
  on public.friendship_invite_deliveries (invite_id, channel)
  where channel = 'qr'
    and status = 'issued'
    and revoked_at is null;
