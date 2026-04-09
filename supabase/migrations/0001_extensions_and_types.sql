create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'relationship_invite_status') then
    create type public.relationship_invite_status as enum ('pending', 'accepted', 'rejected', 'expired', 'canceled');
  end if;

  if not exists (select 1 from pg_type where typname = 'relationship_status') then
    create type public.relationship_status as enum ('active', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'request_type') then
    create type public.request_type as enum ('debt', 'manual_settlement', 'reversal');
  end if;

  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type public.request_status as enum ('pending', 'accepted', 'rejected', 'countered', 'canceled', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_account_kind') then
    create type public.ledger_account_kind as enum ('receivable', 'payable');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_entry_side') then
    create type public.ledger_entry_side as enum ('debit', 'credit');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_transaction_type') then
    create type public.ledger_transaction_type as enum (
      'debt_acceptance',
      'manual_settlement_acceptance',
      'reversal_acceptance',
      'cycle_settlement'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_source_type') then
    create type public.ledger_source_type as enum ('user', 'system');
  end if;

  if not exists (select 1 from pg_type where typname = 'settlement_proposal_status') then
    create type public.settlement_proposal_status as enum (
      'pending_approvals',
      'approved',
      'rejected',
      'stale',
      'executed',
      'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'settlement_participant_decision') then
    create type public.settlement_participant_decision as enum ('pending', 'approved', 'rejected');
  end if;
end
$$;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
