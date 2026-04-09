create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.relationship_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.user_profiles (id),
  invitee_user_id uuid not null references public.user_profiles (id),
  status public.relationship_invite_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint relationship_invites_no_self check (inviter_user_id <> invitee_user_id)
);

create unique index if not exists relationship_invites_pending_unique_idx
  on public.relationship_invites (least(inviter_user_id, invitee_user_id), greatest(inviter_user_id, invitee_user_id))
  where status = 'pending';

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references public.user_profiles (id),
  user_high_id uuid not null references public.user_profiles (id),
  status public.relationship_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint relationships_user_order check (user_low_id < user_high_id)
);

create unique index if not exists relationships_pair_unique_idx
  on public.relationships (user_low_id, user_high_id);

create table if not exists public.financial_requests (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id),
  request_type public.request_type not null,
  status public.request_status not null default 'pending',
  creator_user_id uuid not null references public.user_profiles (id),
  responder_user_id uuid not null references public.user_profiles (id),
  debtor_user_id uuid not null references public.user_profiles (id),
  creditor_user_id uuid not null references public.user_profiles (id),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'COP' check (currency_code = 'COP'),
  description text,
  parent_request_id uuid references public.financial_requests (id),
  target_ledger_transaction_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  constraint financial_requests_creator_responder_diff check (creator_user_id <> responder_user_id),
  constraint financial_requests_debtor_creditor_diff check (debtor_user_id <> creditor_user_id)
);

create index if not exists financial_requests_relationship_idx
  on public.financial_requests (relationship_id, status, created_at desc);

create index if not exists financial_requests_responder_idx
  on public.financial_requests (responder_user_id, status, created_at desc);

create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.user_profiles (id),
  counterparty_user_id uuid not null references public.user_profiles (id),
  account_kind public.ledger_account_kind not null,
  currency_code text not null default 'COP' check (currency_code = 'COP'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint ledger_accounts_no_self check (owner_user_id <> counterparty_user_id)
);

create unique index if not exists ledger_accounts_unique_idx
  on public.ledger_accounts (owner_user_id, counterparty_user_id, account_kind, currency_code);

create table if not exists public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type public.ledger_transaction_type not null,
  source_type public.ledger_source_type not null,
  currency_code text not null default 'COP' check (currency_code = 'COP'),
  origin_request_id uuid references public.financial_requests (id),
  origin_settlement_proposal_id uuid,
  reverses_transaction_id uuid references public.ledger_transactions (id),
  description text,
  created_by_user_id uuid references public.user_profiles (id),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists ledger_transactions_origin_request_idx
  on public.ledger_transactions (origin_request_id);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  ledger_transaction_id uuid not null references public.ledger_transactions (id) on delete restrict,
  ledger_account_id uuid not null references public.ledger_accounts (id) on delete restrict,
  entry_side public.ledger_entry_side not null,
  amount_minor bigint not null check (amount_minor > 0),
  entry_order integer not null check (entry_order > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists ledger_entries_unique_order_idx
  on public.ledger_entries (ledger_transaction_id, entry_order);

create table if not exists public.pair_net_edges_cache (
  user_low_id uuid not null references public.user_profiles (id),
  user_high_id uuid not null references public.user_profiles (id),
  debtor_user_id uuid references public.user_profiles (id),
  creditor_user_id uuid references public.user_profiles (id),
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  currency_code text not null default 'COP' check (currency_code = 'COP'),
  last_ledger_transaction_id uuid references public.ledger_transactions (id),
  refreshed_at timestamptz not null default timezone('utc', now()),
  primary key (user_low_id, user_high_id, currency_code),
  constraint pair_net_edges_cache_user_order check (user_low_id < user_high_id),
  constraint pair_net_edges_cache_direction check (
    (amount_minor = 0 and debtor_user_id is null and creditor_user_id is null)
    or
    (amount_minor > 0 and debtor_user_id is not null and creditor_user_id is not null and debtor_user_id <> creditor_user_id)
  )
);

create table if not exists public.settlement_proposals (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references public.user_profiles (id),
  status public.settlement_proposal_status not null default 'pending_approvals',
  graph_snapshot_hash text not null,
  graph_snapshot jsonb not null,
  movements_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  executed_at timestamptz
);

create index if not exists settlement_proposals_status_idx
  on public.settlement_proposals (status, created_at desc);

create table if not exists public.settlement_proposal_participants (
  id uuid primary key default gen_random_uuid(),
  settlement_proposal_id uuid not null references public.settlement_proposals (id) on delete cascade,
  participant_user_id uuid not null references public.user_profiles (id),
  decision public.settlement_participant_decision not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists settlement_proposal_participants_unique_idx
  on public.settlement_proposal_participants (settlement_proposal_id, participant_user_id);

create table if not exists public.settlement_executions (
  id uuid primary key default gen_random_uuid(),
  settlement_proposal_id uuid not null unique references public.settlement_proposals (id) on delete restrict,
  executed_by_user_id uuid not null references public.user_profiles (id),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.user_profiles (id),
  entity_type text not null,
  entity_id uuid not null,
  event_name text not null,
  request_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.user_profiles (id),
  operation_name text not null,
  idempotency_key text not null,
  response_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idempotency_keys_actor_operation_key_idx
  on public.idempotency_keys (actor_user_id, operation_name, idempotency_key);

create table if not exists public.app_settings (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.append_audit_event(
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_name text,
  p_request_id uuid,
  p_metadata_json jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_events (
    actor_user_id,
    entity_type,
    entity_id,
    event_name,
    request_id,
    metadata_json
  )
  values (
    p_actor_user_id,
    p_entity_type,
    p_entity_id,
    p_event_name,
    p_request_id,
    coalesce(p_metadata_json, '{}'::jsonb)
  );
$$;

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.tg_set_updated_at();

create trigger set_relationship_invites_updated_at
before update on public.relationship_invites
for each row execute function public.tg_set_updated_at();

create trigger set_relationships_updated_at
before update on public.relationships
for each row execute function public.tg_set_updated_at();

create trigger set_financial_requests_updated_at
before update on public.financial_requests
for each row execute function public.tg_set_updated_at();

create trigger set_settlement_proposals_updated_at
before update on public.settlement_proposals
for each row execute function public.tg_set_updated_at();
