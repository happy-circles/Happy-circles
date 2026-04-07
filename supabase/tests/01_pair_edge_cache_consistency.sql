do $$
declare
  v_mismatch_count integer;
begin
  select count(*)
    into v_mismatch_count
  from public.v_pair_net_edges_authoritative view_edges
  full join public.pair_net_edges_cache cache_edges
    on cache_edges.user_low_id = view_edges.user_low_id
   and cache_edges.user_high_id = view_edges.user_high_id
   and cache_edges.currency_code = view_edges.currency_code
  where coalesce(view_edges.debtor_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      <> coalesce(cache_edges.debtor_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
     or coalesce(view_edges.creditor_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      <> coalesce(cache_edges.creditor_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
     or coalesce(view_edges.amount_minor, 0) <> coalesce(cache_edges.amount_minor, 0);

  if v_mismatch_count <> 0 then
    raise exception 'pair edge cache mismatch count: %', v_mismatch_count;
  end if;
end
$$;
