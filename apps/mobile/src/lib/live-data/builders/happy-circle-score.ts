import type { HappyCircleScoreDto } from '@happy-circles/application';

import type { HappyCircleScoreEventRow } from '../types';
import { dateMs } from '../utils/dates';

const RECENT_AWARD_LIMIT = 5;

export function buildHappyCircleScore(input: {
  readonly happyCircleScoreEvents?: readonly HappyCircleScoreEventRow[];
  readonly currentUserId: string;
}): HappyCircleScoreDto {
  const userEvents = (input.happyCircleScoreEvents ?? [])
    .filter((event) => event.user_id === input.currentUserId)
    .sort((left, right) => {
      const rightAwardedAt = dateMs(right.awarded_at) ?? 0;
      const leftAwardedAt = dateMs(left.awarded_at) ?? 0;
      if (rightAwardedAt !== leftAwardedAt) {
        return rightAwardedAt - leftAwardedAt;
      }

      return right.id.localeCompare(left.id);
    });
  const awards = userEvents.map((event) => ({
    id: event.id,
    settlementProposalId: event.settlement_proposal_id,
    scoreDelta: event.score_delta,
    participantCount: event.participant_count,
    awardedAt: event.awarded_at,
    claimedAt: event.treasure_claimed_at,
  }));
  const recentAwards = awards.slice(0, RECENT_AWARD_LIMIT);
  const claimableAwards = awards.filter((award) => !award.claimedAt);
  const claimedEvents = userEvents.filter((event) => event.treasure_claimed_at);

  return {
    totalFaces: claimedEvents.reduce((total, event) => total + event.score_delta, 0),
    closedCircleCount: new Set(userEvents.map((event) => event.settlement_proposal_id)).size,
    claimableAwards,
    recentAwards,
    latestAward: recentAwards[0] ?? null,
  };
}
