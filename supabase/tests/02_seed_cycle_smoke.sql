\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_edge_count integer;
begin
  select count(*)
    into v_edge_count
  from public.v_pair_net_edges_authoritative;

  if v_edge_count <> 4 then
    raise exception 'expected 4 authoritative edges, got %', v_edge_count;
  end if;

  if not exists (
    select 1
    from public.v_pair_net_edges_authoritative
    where debtor_user_id = '00000000-0000-0000-0000-0000000000a1'
      and creditor_user_id = '00000000-0000-0000-0000-0000000000b2'
      and amount_minor = 120000
  ) then
    raise exception 'missing expected A -> B edge';
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - seed cycle smoke';
