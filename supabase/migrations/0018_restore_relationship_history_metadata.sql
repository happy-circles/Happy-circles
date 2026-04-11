drop view if exists public.v_relationship_history;

create or replace view public.v_relationship_history as
select
  fr.relationship_id,
  fr.id as item_id,
  'financial_request'::text as item_kind,
  fr.status::text as status,
  fr.request_type::text as subtype,
  'user'::text as source_type,
  fr.creator_user_id,
  fr.responder_user_id,
  fr.debtor_user_id,
  fr.creditor_user_id,
  fr.amount_minor,
  fr.description,
  fr.id as origin_request_id,
  null::uuid as origin_settlement_proposal_id,
  fr.created_at as happened_at
from public.financial_requests fr
union all
select
  relationship.id as relationship_id,
  tx_pair.ledger_transaction_id as item_id,
  'ledger_transaction'::text as item_kind,
  'posted'::text as status,
  tx_pair.transaction_type,
  tx_pair.source_type,
  tx_pair.created_by_user_id as creator_user_id,
  fr.responder_user_id,
  tx_pair.debtor_user_id,
  tx_pair.creditor_user_id,
  tx_pair.amount_minor,
  tx_pair.description,
  tx_pair.origin_request_id,
  tx_pair.origin_settlement_proposal_id,
  tx_pair.created_at as happened_at
from (
  select
    lt.id as ledger_transaction_id,
    lt.transaction_type::text as transaction_type,
    lt.source_type::text as source_type,
    lt.description,
    lt.created_by_user_id,
    lt.created_at,
    (min(la.owner_user_id::text) filter (where la.account_kind = 'payable'))::uuid as debtor_user_id,
    (min(la.owner_user_id::text) filter (where la.account_kind = 'receivable'))::uuid as creditor_user_id,
    max(le.amount_minor) as amount_minor,
    (min(least(la.owner_user_id, la.counterparty_user_id)::text))::uuid as user_low_id,
    (min(greatest(la.owner_user_id, la.counterparty_user_id)::text))::uuid as user_high_id,
    (min(lt.origin_request_id::text))::uuid as origin_request_id,
    (min(lt.origin_settlement_proposal_id::text))::uuid as origin_settlement_proposal_id
  from public.ledger_transactions lt
  join public.ledger_entries le on le.ledger_transaction_id = lt.id
  join public.ledger_accounts la on la.id = le.ledger_account_id
  group by lt.id, lt.transaction_type, lt.source_type, lt.description, lt.created_by_user_id, lt.created_at
) as tx_pair
join public.relationships relationship
  on relationship.user_low_id = tx_pair.user_low_id
 and relationship.user_high_id = tx_pair.user_high_id
left join public.financial_requests fr on fr.id = tx_pair.origin_request_id;

grant select on public.v_relationship_history to authenticated;
alter view public.v_relationship_history set (security_invoker = true);
