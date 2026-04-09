alter table public.user_profiles enable row level security;
alter table public.relationship_invites enable row level security;
alter table public.relationships enable row level security;
alter table public.financial_requests enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.pair_net_edges_cache enable row level security;
alter table public.settlement_proposals enable row level security;
alter table public.settlement_proposal_participants enable row level security;
alter table public.settlement_executions enable row level security;
alter table public.audit_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists user_profiles_select_authenticated on public.user_profiles;
create policy user_profiles_select_authenticated
on public.user_profiles
for select
to authenticated
using (true);

drop policy if exists relationship_invites_select_participants on public.relationship_invites;
create policy relationship_invites_select_participants
on public.relationship_invites
for select
to authenticated
using (auth.uid() = inviter_user_id or auth.uid() = invitee_user_id);

drop policy if exists relationships_select_members on public.relationships;
create policy relationships_select_members
on public.relationships
for select
to authenticated
using (auth.uid() = user_low_id or auth.uid() = user_high_id);

drop policy if exists financial_requests_select_participants on public.financial_requests;
create policy financial_requests_select_participants
on public.financial_requests
for select
to authenticated
using (
  auth.uid() = creator_user_id
  or auth.uid() = responder_user_id
  or auth.uid() = debtor_user_id
  or auth.uid() = creditor_user_id
);

drop policy if exists ledger_accounts_select_members on public.ledger_accounts;
create policy ledger_accounts_select_members
on public.ledger_accounts
for select
to authenticated
using (auth.uid() = owner_user_id or auth.uid() = counterparty_user_id);

drop policy if exists ledger_transactions_select_members on public.ledger_transactions;
create policy ledger_transactions_select_members
on public.ledger_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.ledger_entries le
    join public.ledger_accounts la on la.id = le.ledger_account_id
    where le.ledger_transaction_id = ledger_transactions.id
      and (la.owner_user_id = auth.uid() or la.counterparty_user_id = auth.uid())
  )
);

drop policy if exists ledger_entries_select_members on public.ledger_entries;
create policy ledger_entries_select_members
on public.ledger_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.ledger_accounts la
    where la.id = ledger_account_id
      and (la.owner_user_id = auth.uid() or la.counterparty_user_id = auth.uid())
  )
);

drop policy if exists pair_net_edges_cache_select_members on public.pair_net_edges_cache;
create policy pair_net_edges_cache_select_members
on public.pair_net_edges_cache
for select
to authenticated
using (auth.uid() = user_low_id or auth.uid() = user_high_id);

drop policy if exists settlement_proposals_select_participants on public.settlement_proposals;
create policy settlement_proposals_select_participants
on public.settlement_proposals
for select
to authenticated
using (
  exists (
    select 1
    from public.settlement_proposal_participants spp
    where spp.settlement_proposal_id = settlement_proposals.id
      and spp.participant_user_id = auth.uid()
  )
);

drop policy if exists settlement_proposal_participants_select_participants on public.settlement_proposal_participants;
create policy settlement_proposal_participants_select_participants
on public.settlement_proposal_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.settlement_proposal_participants self
    where self.settlement_proposal_id = settlement_proposal_id
      and self.participant_user_id = auth.uid()
  )
);

drop policy if exists settlement_executions_select_participants on public.settlement_executions;
create policy settlement_executions_select_participants
on public.settlement_executions
for select
to authenticated
using (
  exists (
    select 1
    from public.settlement_proposal_participants spp
    where spp.settlement_proposal_id = settlement_proposal_id
      and spp.participant_user_id = auth.uid()
  )
);

drop policy if exists audit_events_select_relevant on public.audit_events;
create policy audit_events_select_relevant
on public.audit_events
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or (
    entity_type = 'financial_request'
    and exists (
      select 1
      from public.financial_requests fr
      where fr.id = entity_id
        and (
          fr.creator_user_id = auth.uid()
          or fr.responder_user_id = auth.uid()
          or fr.debtor_user_id = auth.uid()
          or fr.creditor_user_id = auth.uid()
        )
    )
  )
  or (
    entity_type = 'settlement_proposal'
    and exists (
      select 1
      from public.settlement_proposal_participants spp
      where spp.settlement_proposal_id = entity_id
        and spp.participant_user_id = auth.uid()
    )
  )
);

drop policy if exists idempotency_keys_select_owner on public.idempotency_keys;
create policy idempotency_keys_select_owner
on public.idempotency_keys
for select
to authenticated
using (actor_user_id = auth.uid());

drop policy if exists app_settings_select_authenticated on public.app_settings;
create policy app_settings_select_authenticated
on public.app_settings
for select
to authenticated
using (true);

grant select on public.user_profiles to authenticated;
grant select on public.relationship_invites to authenticated;
grant select on public.relationships to authenticated;
grant select on public.financial_requests to authenticated;
grant select on public.ledger_accounts to authenticated;
grant select on public.ledger_transactions to authenticated;
grant select on public.ledger_entries to authenticated;
grant select on public.pair_net_edges_cache to authenticated;
grant select on public.settlement_proposals to authenticated;
grant select on public.settlement_proposal_participants to authenticated;
grant select on public.settlement_executions to authenticated;
grant select on public.audit_events to authenticated;
grant select on public.idempotency_keys to authenticated;
grant select on public.app_settings to authenticated;
grant select on public.v_pair_net_edges_authoritative to authenticated;
grant select on public.v_user_balance_summary to authenticated;
grant select on public.v_open_debts to authenticated;
grant select on public.v_relationship_history to authenticated;
grant select on public.v_inbox_items to authenticated;
