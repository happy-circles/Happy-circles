alter table public.financial_requests
  add constraint financial_requests_target_ledger_transaction_fk
  foreign key (target_ledger_transaction_id)
  references public.ledger_transactions (id);

alter table public.ledger_transactions
  add constraint ledger_transactions_origin_settlement_proposal_fk
  foreign key (origin_settlement_proposal_id)
  references public.settlement_proposals (id);

create or replace function public.ensure_relationship_accounts(p_relationship_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.relationships%rowtype;
begin
  select *
    into v_relationship
  from public.relationships
  where id = p_relationship_id;

  if not found then
    raise exception 'relationship_not_found';
  end if;

  insert into public.ledger_accounts (owner_user_id, counterparty_user_id, account_kind, currency_code)
  values
    (v_relationship.user_low_id, v_relationship.user_high_id, 'receivable', 'COP'),
    (v_relationship.user_low_id, v_relationship.user_high_id, 'payable', 'COP'),
    (v_relationship.user_high_id, v_relationship.user_low_id, 'receivable', 'COP'),
    (v_relationship.user_high_id, v_relationship.user_low_id, 'payable', 'COP')
  on conflict (owner_user_id, counterparty_user_id, account_kind, currency_code) do nothing;
end;
$$;

create or replace view public.v_pair_net_edges_authoritative as
with account_balances as (
  select
    la.owner_user_id,
    la.counterparty_user_id,
    la.account_kind,
    la.currency_code,
    sum(
      case
        when la.account_kind = 'receivable' and le.entry_side = 'debit' then le.amount_minor
        when la.account_kind = 'receivable' and le.entry_side = 'credit' then -le.amount_minor
        when la.account_kind = 'payable' and le.entry_side = 'credit' then le.amount_minor
        when la.account_kind = 'payable' and le.entry_side = 'debit' then -le.amount_minor
        else 0
      end
    )::bigint as balance_minor
  from public.ledger_accounts la
  join public.ledger_entries le on le.ledger_account_id = la.id
  join public.ledger_transactions lt on lt.id = le.ledger_transaction_id
  group by la.owner_user_id, la.counterparty_user_id, la.account_kind, la.currency_code
),
pair_nets as (
  select
    least(owner_user_id, counterparty_user_id) as user_low_id,
    greatest(owner_user_id, counterparty_user_id) as user_high_id,
    max(currency_code) as currency_code,
    sum(
      case
        when owner_user_id < counterparty_user_id and account_kind = 'receivable' then balance_minor
        when owner_user_id < counterparty_user_id and account_kind = 'payable' then -balance_minor
        else 0
      end
    )::bigint as net_from_low_perspective
  from account_balances
  group by least(owner_user_id, counterparty_user_id), greatest(owner_user_id, counterparty_user_id)
)
select
  user_low_id,
  user_high_id,
  case when net_from_low_perspective < 0 then user_low_id else user_high_id end as debtor_user_id,
  case when net_from_low_perspective < 0 then user_high_id else user_low_id end as creditor_user_id,
  abs(net_from_low_perspective) as amount_minor,
  currency_code
from pair_nets
where net_from_low_perspective <> 0;

create or replace function public.refresh_pair_net_edge_for_pair(
  p_left_user_id uuid,
  p_right_user_id uuid,
  p_last_ledger_transaction_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low_id uuid;
  v_high_id uuid;
  v_edge record;
begin
  v_low_id := least(p_left_user_id, p_right_user_id);
  v_high_id := greatest(p_left_user_id, p_right_user_id);

  select *
    into v_edge
  from public.v_pair_net_edges_authoritative
  where user_low_id = v_low_id
    and user_high_id = v_high_id;

  if found then
    insert into public.pair_net_edges_cache (
      user_low_id,
      user_high_id,
      debtor_user_id,
      creditor_user_id,
      amount_minor,
      currency_code,
      last_ledger_transaction_id,
      refreshed_at
    )
    values (
      v_edge.user_low_id,
      v_edge.user_high_id,
      v_edge.debtor_user_id,
      v_edge.creditor_user_id,
      v_edge.amount_minor,
      v_edge.currency_code,
      p_last_ledger_transaction_id,
      timezone('utc', now())
    )
    on conflict (user_low_id, user_high_id, currency_code)
    do update set
      debtor_user_id = excluded.debtor_user_id,
      creditor_user_id = excluded.creditor_user_id,
      amount_minor = excluded.amount_minor,
      last_ledger_transaction_id = excluded.last_ledger_transaction_id,
      refreshed_at = excluded.refreshed_at;
  else
    insert into public.pair_net_edges_cache (
      user_low_id,
      user_high_id,
      debtor_user_id,
      creditor_user_id,
      amount_minor,
      currency_code,
      last_ledger_transaction_id,
      refreshed_at
    )
    values (
      v_low_id,
      v_high_id,
      null,
      null,
      0,
      'COP',
      p_last_ledger_transaction_id,
      timezone('utc', now())
    )
    on conflict (user_low_id, user_high_id, currency_code)
    do update set
      debtor_user_id = excluded.debtor_user_id,
      creditor_user_id = excluded.creditor_user_id,
      amount_minor = excluded.amount_minor,
      last_ledger_transaction_id = excluded.last_ledger_transaction_id,
      refreshed_at = excluded.refreshed_at;
  end if;
end;
$$;

create or replace function public.refresh_all_pair_net_edges_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship record;
begin
  for v_relationship in
    select user_low_id, user_high_id
    from public.relationships
    where status = 'active'
  loop
    perform public.refresh_pair_net_edge_for_pair(v_relationship.user_low_id, v_relationship.user_high_id, null);
  end loop;
end;
$$;

create or replace function public.compute_graph_snapshot_hash()
returns text
language sql
security definer
set search_path = public
as $$
  with ordered_edges as (
    select
      debtor_user_id::text as debtor_user_id,
      creditor_user_id::text as creditor_user_id,
      amount_minor::text as amount_minor
    from public.v_pair_net_edges_authoritative
    order by debtor_user_id, creditor_user_id, amount_minor
  )
  select encode(
    digest(
      coalesce(string_agg(debtor_user_id || '|' || creditor_user_id || '|' || amount_minor, ';'), ''),
      'sha256'
    ),
    'hex'
  )
  from ordered_edges;
$$;

create or replace view public.v_user_balance_summary as
select
  up.id as user_id,
  coalesce(sum(case when edge.creditor_user_id = up.id then edge.amount_minor else 0 end), 0)
    - coalesce(sum(case when edge.debtor_user_id = up.id then edge.amount_minor else 0 end), 0) as net_balance_minor,
  coalesce(sum(case when edge.debtor_user_id = up.id then edge.amount_minor else 0 end), 0) as total_i_owe_minor,
  coalesce(sum(case when edge.creditor_user_id = up.id then edge.amount_minor else 0 end), 0) as total_owed_to_me_minor
from public.user_profiles up
left join public.v_pair_net_edges_authoritative edge
  on edge.debtor_user_id = up.id
  or edge.creditor_user_id = up.id
group by up.id;

create or replace view public.v_open_debts as
select
  relationship.id as relationship_id,
  edge.user_low_id,
  edge.user_high_id,
  edge.debtor_user_id,
  edge.creditor_user_id,
  edge.amount_minor,
  edge.currency_code
from public.relationships relationship
join public.v_pair_net_edges_authoritative edge
  on edge.user_low_id = relationship.user_low_id
 and edge.user_high_id = relationship.user_high_id
where relationship.status = 'active';

create or replace view public.v_relationship_history as
select
  fr.relationship_id,
  fr.id as item_id,
  'financial_request'::text as item_kind,
  fr.status::text as status,
  fr.request_type::text as subtype,
  fr.creator_user_id,
  fr.responder_user_id,
  fr.debtor_user_id,
  fr.creditor_user_id,
  fr.amount_minor,
  fr.description,
  fr.created_at as happened_at
from public.financial_requests fr
union all
select
  relationship.id as relationship_id,
  tx_pair.ledger_transaction_id as item_id,
  'ledger_transaction'::text as item_kind,
  'posted'::text as status,
  tx_pair.transaction_type,
  tx_pair.created_by_user_id as creator_user_id,
  fr.responder_user_id,
  tx_pair.debtor_user_id,
  tx_pair.creditor_user_id,
  tx_pair.amount_minor,
  tx_pair.description,
  tx_pair.created_at as happened_at
from (
  select
    lt.id as ledger_transaction_id,
    lt.transaction_type::text as transaction_type,
    lt.description,
    lt.created_by_user_id,
    lt.created_at,
    max(case when la.account_kind = 'payable' then la.owner_user_id end) as debtor_user_id,
    max(case when la.account_kind = 'receivable' then la.owner_user_id end) as creditor_user_id,
    max(le.amount_minor) as amount_minor,
    min(least(la.owner_user_id, la.counterparty_user_id)) as user_low_id,
    min(greatest(la.owner_user_id, la.counterparty_user_id)) as user_high_id,
    max(lt.origin_request_id) as origin_request_id
  from public.ledger_transactions lt
  join public.ledger_entries le on le.ledger_transaction_id = lt.id
  join public.ledger_accounts la on la.id = le.ledger_account_id
  group by lt.id, lt.transaction_type, lt.description, lt.created_by_user_id, lt.created_at
) as tx_pair
join public.relationships relationship
  on relationship.user_low_id = tx_pair.user_low_id
 and relationship.user_high_id = tx_pair.user_high_id
left join public.financial_requests fr on fr.id = tx_pair.origin_request_id;

create or replace view public.v_inbox_items as
select
  fr.responder_user_id as owner_user_id,
  fr.id as item_id,
  'financial_request'::text as item_kind,
  fr.request_type::text as subtype,
  fr.status::text as status,
  fr.created_at
from public.financial_requests fr
where fr.status = 'pending'
union all
select
  spp.participant_user_id as owner_user_id,
  sp.id as item_id,
  'settlement_proposal'::text as item_kind,
  'cycle_settlement'::text as subtype,
  sp.status::text as status,
  sp.created_at
from public.settlement_proposals sp
join public.settlement_proposal_participants spp
  on spp.settlement_proposal_id = sp.id
where spp.decision = 'pending'
  and sp.status = 'pending_approvals';
