alter type public.settlement_stale_reason
  add value if not exists 'reserved_capacity_lost';
