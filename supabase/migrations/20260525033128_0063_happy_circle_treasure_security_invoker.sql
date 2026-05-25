drop policy if exists happy_circle_score_events_update_claim_self
  on public.happy_circle_score_events;
create policy happy_circle_score_events_update_claim_self
on public.happy_circle_score_events
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and treasure_claimed_at is not null
);

grant update (treasure_claimed_at) on public.happy_circle_score_events to authenticated;

create or replace function public.claim_happy_circle_treasure(p_score_event_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_event public.happy_circle_score_events%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
    into v_event
  from public.happy_circle_score_events
  where id = p_score_event_id
    and user_id = v_actor_user_id
  for update;

  if not found then
    raise exception 'happy_circle_score_event_not_found';
  end if;

  if v_event.treasure_claimed_at is null then
    update public.happy_circle_score_events
    set treasure_claimed_at = timezone('utc', now())
    where id = p_score_event_id
      and user_id = v_actor_user_id
    returning *
      into v_event;

    return jsonb_build_object(
      'status', 'claimed',
      'scoreEventId', v_event.id,
      'settlementProposalId', v_event.settlement_proposal_id,
      'scoreDelta', v_event.score_delta,
      'treasureClaimedAt', v_event.treasure_claimed_at
    );
  end if;

  return jsonb_build_object(
    'status', 'already_claimed',
    'scoreEventId', v_event.id,
    'settlementProposalId', v_event.settlement_proposal_id,
    'scoreDelta', v_event.score_delta,
    'treasureClaimedAt', v_event.treasure_claimed_at
  );
end;
$$;

revoke all on function public.claim_happy_circle_treasure(uuid) from public, anon, authenticated;
grant execute on function public.claim_happy_circle_treasure(uuid) to authenticated;
