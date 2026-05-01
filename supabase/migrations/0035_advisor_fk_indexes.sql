create index if not exists account_invite_deliveries_authenticated_user_id_idx
  on public.account_invite_deliveries (authenticated_user_id);

create index if not exists account_invites_activated_user_id_idx
  on public.account_invites (activated_user_id);

create index if not exists account_invites_linked_relationship_id_idx
  on public.account_invites (linked_relationship_id);

create index if not exists audit_events_actor_user_id_idx
  on public.audit_events (actor_user_id);

create index if not exists financial_requests_creator_user_id_idx
  on public.financial_requests (creator_user_id);

create index if not exists financial_requests_creditor_user_id_idx
  on public.financial_requests (creditor_user_id);

create index if not exists financial_requests_debtor_user_id_idx
  on public.financial_requests (debtor_user_id);

create index if not exists financial_requests_parent_request_id_idx
  on public.financial_requests (parent_request_id);

create index if not exists financial_requests_target_ledger_transaction_id_idx
  on public.financial_requests (target_ledger_transaction_id);

create index if not exists friendship_invites_relationship_id_idx
  on public.friendship_invites (relationship_id);

create index if not exists graph_cycle_jobs_anchor_user_id_idx
  on public.graph_cycle_jobs (anchor_user_id);

create index if not exists graph_cycle_jobs_user_high_id_idx
  on public.graph_cycle_jobs (user_high_id);

create index if not exists graph_cycle_jobs_user_low_id_idx
  on public.graph_cycle_jobs (user_low_id);

create index if not exists ledger_accounts_counterparty_user_id_idx
  on public.ledger_accounts (counterparty_user_id);

create index if not exists ledger_transactions_created_by_user_id_idx
  on public.ledger_transactions (created_by_user_id);

create index if not exists ledger_transactions_origin_settlement_proposal_id_idx
  on public.ledger_transactions (origin_settlement_proposal_id);

create index if not exists ledger_transactions_reverses_transaction_id_idx
  on public.ledger_transactions (reverses_transaction_id);

create index if not exists pair_net_edges_cache_last_ledger_transaction_id_idx
  on public.pair_net_edges_cache (last_ledger_transaction_id);

create index if not exists pair_net_edges_cache_user_high_id_idx
  on public.pair_net_edges_cache (user_high_id);

create index if not exists product_events_session_id_idx
  on public.product_events (session_id);

create index if not exists relationships_user_high_id_idx
  on public.relationships (user_high_id);

create index if not exists settlement_executions_executed_by_user_id_idx
  on public.settlement_executions (executed_by_user_id);

create index if not exists settlement_proposal_participants_participant_user_id_idx
  on public.settlement_proposal_participants (participant_user_id);

create index if not exists settlement_proposals_anchor_user_high_id_idx
  on public.settlement_proposals (anchor_user_high_id);

create index if not exists settlement_proposals_created_by_user_id_idx
  on public.settlement_proposals (created_by_user_id);

create index if not exists settlement_proposals_source_graph_cycle_job_id_idx
  on public.settlement_proposals (source_graph_cycle_job_id);

create index if not exists user_profiles_activated_via_account_invite_id_idx
  on public.user_profiles (activated_via_account_invite_id);

create index if not exists user_profiles_invited_by_user_id_idx
  on public.user_profiles (invited_by_user_id);
