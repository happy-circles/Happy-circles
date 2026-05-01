create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
grant usage on schema app_private to service_role;

create or replace function app_private.current_user_is_settlement_participant(
  p_settlement_proposal_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.settlement_proposal_participants spp
    where spp.settlement_proposal_id = p_settlement_proposal_id
      and spp.participant_user_id = (select auth.uid())
  );
$$;

revoke all on function app_private.current_user_is_settlement_participant(uuid)
  from public, anon, authenticated;
grant execute on function app_private.current_user_is_settlement_participant(uuid)
  to authenticated;

revoke all on function public.current_user_is_settlement_participant(uuid)
  from public, anon, authenticated;

do $$
declare
  v_signature text;
  v_regprocedure regprocedure;
begin
  foreach v_signature in array array[
    'public.build_friendship_claimant_snapshot(uuid)',
    'public.compute_graph_component_snapshot(uuid, uuid, text)',
    'public.compute_graph_component_snapshot_hash(uuid, uuid, text)',
    'public.compute_graph_snapshot_hash()',
    'public.ensure_relationship_accounts(uuid)',
    'public.friendship_identity_flags(uuid)',
    'public.friendship_identity_ready(uuid)',
    'public.generate_short_token(integer)',
    'public.handle_new_user()',
    'public.handle_user_profile_phone_change()',
    'public.mark_outdated_settlement_proposals_stale(text)',
    'public.mark_touched_settlement_proposals_stale(uuid[])',
    'public.refresh_all_pair_net_edges_cache()',
    'public.refresh_pair_net_edge_for_pair(uuid, uuid, uuid)',
    'public.rls_auto_enable()'
  ]
  loop
    v_regprocedure := to_regprocedure(v_signature);

    if v_regprocedure is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        v_regprocedure
      );
      execute format('grant execute on function %s to service_role', v_regprocedure);
    end if;
  end loop;
end;
$$;

do $$
declare
  v_signature text;
  v_regprocedure regprocedure;
begin
  foreach v_signature in array array[
    'public.mask_email_value(text)',
    'public.mask_phone_value(text)',
    'public.effective_friendship_invite_status(public.friendship_invite_status, timestamp with time zone)',
    'public.effective_friendship_delivery_status(public.friendship_invite_delivery_status, timestamp with time zone, timestamp with time zone)',
    'public.graph_pair_lock_key(uuid, uuid, text)',
    'public.lock_graph_pair(uuid, uuid, text)',
    'public.friendship_channel_from_label(text)',
    'public.tg_set_updated_at()'
  ]
  loop
    v_regprocedure := to_regprocedure(v_signature);

    if v_regprocedure is not null then
      execute format(
        'alter function %s set search_path = public, extensions, pg_temp',
        v_regprocedure
      );
    end if;
  end loop;
end;
$$;

drop policy if exists settlement_proposals_select_participants
  on public.settlement_proposals;
create policy settlement_proposals_select_participants
on public.settlement_proposals
for select
to authenticated
using (app_private.current_user_is_settlement_participant(id));

drop policy if exists settlement_proposal_participants_select_participants
  on public.settlement_proposal_participants;
create policy settlement_proposal_participants_select_participants
on public.settlement_proposal_participants
for select
to authenticated
using (app_private.current_user_is_settlement_participant(settlement_proposal_id));

drop policy if exists settlement_executions_select_participants
  on public.settlement_executions;
create policy settlement_executions_select_participants
on public.settlement_executions
for select
to authenticated
using (app_private.current_user_is_settlement_participant(settlement_proposal_id));

drop policy if exists relationships_select_members on public.relationships;
create policy relationships_select_members
on public.relationships
for select
to authenticated
using (
  (select auth.uid()) = user_low_id
  or (select auth.uid()) = user_high_id
);

drop policy if exists financial_requests_select_participants on public.financial_requests;
create policy financial_requests_select_participants
on public.financial_requests
for select
to authenticated
using (
  (select auth.uid()) = creator_user_id
  or (select auth.uid()) = responder_user_id
  or (select auth.uid()) = debtor_user_id
  or (select auth.uid()) = creditor_user_id
);

drop policy if exists ledger_accounts_select_members on public.ledger_accounts;
create policy ledger_accounts_select_members
on public.ledger_accounts
for select
to authenticated
using (
  (select auth.uid()) = owner_user_id
  or (select auth.uid()) = counterparty_user_id
);

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
      and (
        la.owner_user_id = (select auth.uid())
        or la.counterparty_user_id = (select auth.uid())
      )
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
    where la.id = ledger_entries.ledger_account_id
      and (
        la.owner_user_id = (select auth.uid())
        or la.counterparty_user_id = (select auth.uid())
      )
  )
);

drop policy if exists pair_net_edges_cache_select_members on public.pair_net_edges_cache;
create policy pair_net_edges_cache_select_members
on public.pair_net_edges_cache
for select
to authenticated
using (
  (select auth.uid()) = user_low_id
  or (select auth.uid()) = user_high_id
);

drop policy if exists idempotency_keys_select_owner on public.idempotency_keys;
create policy idempotency_keys_select_owner
on public.idempotency_keys
for select
to authenticated
using (actor_user_id = (select auth.uid()));

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self
on public.user_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists trusted_devices_select_self on public.trusted_devices;
create policy trusted_devices_select_self
on public.trusted_devices
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists trusted_devices_insert_self on public.trusted_devices;
create policy trusted_devices_insert_self
on public.trusted_devices
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists trusted_devices_update_self on public.trusted_devices;
create policy trusted_devices_update_self
on public.trusted_devices
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists user_profiles_select_visible on public.user_profiles;
create policy user_profiles_select_visible
on public.user_profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.relationships relationship
    where relationship.status = 'active'
      and (
        (
          relationship.user_low_id = (select auth.uid())
          and relationship.user_high_id = user_profiles.id
        )
        or (
          relationship.user_high_id = (select auth.uid())
          and relationship.user_low_id = user_profiles.id
        )
      )
  )
  or exists (
    select 1
    from public.friendship_invites invite
    where (
      invite.inviter_user_id = (select auth.uid())
      and (
        user_profiles.id = invite.target_user_id
        or user_profiles.id = invite.claimant_user_id
      )
    )
    or (
      invite.target_user_id = (select auth.uid())
      and invite.inviter_user_id = user_profiles.id
    )
    or (
      invite.claimant_user_id = (select auth.uid())
      and invite.inviter_user_id = user_profiles.id
    )
  )
);

drop policy if exists friendship_invites_select_visible on public.friendship_invites;
create policy friendship_invites_select_visible
on public.friendship_invites
for select
to authenticated
using (
  (select auth.uid()) = inviter_user_id
  or (select auth.uid()) = target_user_id
  or (select auth.uid()) = claimant_user_id
);

drop policy if exists friendship_invite_deliveries_select_visible
  on public.friendship_invite_deliveries;
create policy friendship_invite_deliveries_select_visible
on public.friendship_invite_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.friendship_invites invite
    where invite.id = friendship_invite_deliveries.invite_id
      and (
        (select auth.uid()) = invite.inviter_user_id
        or (select auth.uid()) = invite.target_user_id
        or (select auth.uid()) = invite.claimant_user_id
      )
  )
);

drop policy if exists audit_events_select_relevant on public.audit_events;
create policy audit_events_select_relevant
on public.audit_events
for select
to authenticated
using (
  actor_user_id = (select auth.uid())
  or (
    entity_type = 'friendship_invite'
    and exists (
      select 1
      from public.friendship_invites invite
      where invite.id = audit_events.entity_id
        and (
          (select auth.uid()) = invite.inviter_user_id
          or (select auth.uid()) = invite.target_user_id
          or (select auth.uid()) = invite.claimant_user_id
        )
    )
  )
  or (
    entity_type = 'financial_request'
    and exists (
      select 1
      from public.financial_requests fr
      where fr.id = audit_events.entity_id
        and (
          fr.creator_user_id = (select auth.uid())
          or fr.responder_user_id = (select auth.uid())
          or fr.debtor_user_id = (select auth.uid())
          or fr.creditor_user_id = (select auth.uid())
        )
    )
  )
  or (
    entity_type = 'settlement_proposal'
    and exists (
      select 1
      from public.settlement_proposal_participants spp
      where spp.settlement_proposal_id = audit_events.entity_id
        and spp.participant_user_id = (select auth.uid())
    )
  )
);

drop policy if exists account_invites_select_visible on public.account_invites;
create policy account_invites_select_visible
on public.account_invites
for select
to authenticated
using (
  inviter_user_id = (select auth.uid())
  or activated_user_id = (select auth.uid())
);

drop policy if exists account_invite_deliveries_select_visible
  on public.account_invite_deliveries;
create policy account_invite_deliveries_select_visible
on public.account_invite_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.account_invites invite
    where invite.id = account_invite_deliveries.invite_id
      and (
        invite.inviter_user_id = (select auth.uid())
        or invite.activated_user_id = (select auth.uid())
      )
  )
);

drop policy if exists avatars_select_public on storage.objects;

drop policy if exists analytics_daily_product_facts_client_deny_all
  on public.analytics_daily_product_facts;
create policy analytics_daily_product_facts_client_deny_all
on public.analytics_daily_product_facts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists analytics_daily_user_facts_client_deny_all
  on public.analytics_daily_user_facts;
create policy analytics_daily_user_facts_client_deny_all
on public.analytics_daily_user_facts
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists analytics_event_catalog_client_deny_all
  on public.analytics_event_catalog;
create policy analytics_event_catalog_client_deny_all
on public.analytics_event_catalog
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists app_sessions_client_deny_all on public.app_sessions;
create policy app_sessions_client_deny_all
on public.app_sessions
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists graph_cycle_jobs_client_deny_all on public.graph_cycle_jobs;
create policy graph_cycle_jobs_client_deny_all
on public.graph_cycle_jobs
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists product_events_client_deny_all on public.product_events;
create policy product_events_client_deny_all
on public.product_events
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists public_invite_preview_rate_limits_client_deny_all
  on public.public_invite_preview_rate_limits;
create policy public_invite_preview_rate_limits_client_deny_all
on public.public_invite_preview_rate_limits
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.enqueue_graph_cycle_job(
  p_source_type text,
  p_source_id uuid,
  p_actor_user_id uuid,
  p_anchor_user_id uuid,
  p_left_user_id uuid,
  p_right_user_id uuid,
  p_currency_code text default 'COP'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_low_id uuid;
  v_high_id uuid;
  v_job public.graph_cycle_jobs%rowtype;
begin
  if p_left_user_id = p_right_user_id then
    raise exception 'invalid_graph_cycle_anchor';
  end if;

  v_low_id := least(p_left_user_id, p_right_user_id);
  v_high_id := greatest(p_left_user_id, p_right_user_id);

  if not exists (
    select 1
    from public.pair_net_edges_cache
    where user_low_id = v_low_id
      and user_high_id = v_high_id
      and currency_code = coalesce(p_currency_code, 'COP')
      and amount_minor > 0
  ) then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'no_anchor_edge'
    );
  end if;

  insert into public.graph_cycle_jobs (
    source_type,
    source_id,
    actor_user_id,
    anchor_user_id,
    user_low_id,
    user_high_id,
    currency_code,
    status
  )
  values (
    p_source_type,
    p_source_id,
    p_actor_user_id,
    p_anchor_user_id,
    v_low_id,
    v_high_id,
    coalesce(p_currency_code, 'COP'),
    'pending'
  )
  on conflict (source_type, source_id, user_low_id, user_high_id, currency_code)
  do update set
    actor_user_id = excluded.actor_user_id,
    anchor_user_id = excluded.anchor_user_id,
    status = case
      when public.graph_cycle_jobs.status in ('failed', 'superseded') then 'pending'::public.graph_cycle_job_status
      else public.graph_cycle_jobs.status
    end,
    last_error = case
      when public.graph_cycle_jobs.status in ('failed', 'superseded') then null
      else public.graph_cycle_jobs.last_error
    end,
    processed_at = case
      when public.graph_cycle_jobs.status in ('failed', 'superseded') then null
      else public.graph_cycle_jobs.processed_at
    end
  returning * into v_job;

  return jsonb_build_object(
    'status', case
      when v_job.status in ('pending', 'processing') then 'queued'
      else v_job.status::text
    end,
    'jobId', v_job.id
  );
end;
$$;

revoke all on function public.enqueue_graph_cycle_job(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.enqueue_graph_cycle_job(
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text
) to service_role;
