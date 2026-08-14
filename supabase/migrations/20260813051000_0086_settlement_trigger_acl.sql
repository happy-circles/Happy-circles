-- Trigger functions run through their trigger and must not be callable by API roles.
revoke all on function public.tg_release_settlement_reservations_on_status()
  from public, anon, authenticated;
