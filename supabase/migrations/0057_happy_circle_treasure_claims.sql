alter table public.happy_circle_score_events
  add column if not exists treasure_claimed_at timestamptz;

comment on column public.happy_circle_score_events.treasure_claimed_at is
  'Per-user timestamp for when the Happy Circle treasure animation/reward was claimed.';

create index if not exists happy_circle_score_events_user_unclaimed_idx
  on public.happy_circle_score_events (user_id, awarded_at desc)
  where treasure_claimed_at is null;

create or replace function public.claim_happy_circle_treasure(p_score_event_id uuid)
returns jsonb
language plpgsql
security definer
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
