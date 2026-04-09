create or replace function public.current_user_is_settlement_participant(
  p_settlement_proposal_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.settlement_proposal_participants spp
    where spp.settlement_proposal_id = p_settlement_proposal_id
      and spp.participant_user_id = auth.uid()
  );
$$;

revoke all on function public.current_user_is_settlement_participant(uuid) from public;
grant execute on function public.current_user_is_settlement_participant(uuid) to authenticated;

drop policy if exists settlement_proposals_select_participants on public.settlement_proposals;
create policy settlement_proposals_select_participants
on public.settlement_proposals
for select
to authenticated
using (public.current_user_is_settlement_participant(id));

drop policy if exists settlement_proposal_participants_select_participants on public.settlement_proposal_participants;
create policy settlement_proposal_participants_select_participants
on public.settlement_proposal_participants
for select
to authenticated
using (public.current_user_is_settlement_participant(settlement_proposal_id));

drop policy if exists settlement_executions_select_participants on public.settlement_executions;
create policy settlement_executions_select_participants
on public.settlement_executions
for select
to authenticated
using (public.current_user_is_settlement_participant(settlement_proposal_id));

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
    and public.current_user_is_settlement_participant(entity_id)
  )
);
