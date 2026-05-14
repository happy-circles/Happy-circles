import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  type HappyTreasureRewardInput,
  useHappyTreasureReward,
} from '@/components/happy-treasure-overlay';
import { useAppSnapshot } from '@/lib/live-data';
import { getStoredItem, setStoredItem } from '@/lib/storage';
import { useSession } from './session-provider';

const SEEN_AWARD_STORAGE_PREFIX = 'happy-circles:seen-score-awards:v1:';
const MAX_SEEN_AWARD_IDS = 80;

export interface HappyRewardClaim extends HappyTreasureRewardInput {
  readonly id: string;
  readonly settlementProposalId: string;
}

interface HappyRewardContextValue {
  readonly claimReward: (input: HappyRewardClaim) => Promise<void>;
  readonly clearReward: () => void;
  readonly getRewardForSettlement: (
    settlementProposalId: string | null | undefined,
  ) => HappyRewardClaim | null;
}

const HappyRewardContext = createContext<HappyRewardContextValue | null>(null);

function seenAwardStorageKey(userId: string) {
  return `${SEEN_AWARD_STORAGE_PREFIX}${userId}`;
}

function parseSeenAwardIds(value: string | null): Set<string> {
  if (!value) {
    return new Set();
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

function trimSeenAwardIds(ids: Set<string>) {
  while (ids.size > MAX_SEEN_AWARD_IDS) {
    const oldestId = ids.values().next().value;
    if (!oldestId) {
      break;
    }

    ids.delete(oldestId);
  }
}

export function HappyRewardProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const { clearReward, rewardOverlay, showReward: showTreasureReward } = useHappyTreasureReward();
  const [seenAwardIds, setSeenAwardIds] = useState<ReadonlySet<string> | null>(null);

  const userId = session.userId;
  const score = snapshotQuery.data?.happyCircleScore ?? null;
  const recentAwards = score?.recentAwards ?? [];
  const totalFaces = score?.totalFaces ?? 0;

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setSeenAwardIds(new Set());
      return () => {
        cancelled = true;
      };
    }

    setSeenAwardIds(null);
    void getStoredItem(seenAwardStorageKey(userId))
      .then((storedValue) => {
        if (!cancelled) {
          setSeenAwardIds(parseSeenAwardIds(storedValue));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSeenAwardIds(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const rememberAwardSeen = useCallback(
    (awardId: string) => {
      if (!userId) {
        return;
      }

      setSeenAwardIds((current) => {
        const next = new Set(current ?? []);
        if (next.has(awardId)) {
          return current;
        }

        next.add(awardId);
        trimSeenAwardIds(next);
        void setStoredItem(seenAwardStorageKey(userId), JSON.stringify([...next])).catch(
          () => undefined,
        );

        return next;
      });
    },
    [userId],
  );

  const getRewardForSettlement = useCallback(
    (settlementProposalId: string | null | undefined): HappyRewardClaim | null => {
      if (!settlementProposalId || !seenAwardIds) {
        return null;
      }

      const award = recentAwards.find(
        (item) => item.settlementProposalId === settlementProposalId && !seenAwardIds.has(item.id),
      );
      if (!award) {
        return null;
      }

      return {
        id: award.id,
        scoreDelta: award.scoreDelta,
        settlementProposalId: award.settlementProposalId,
        startingTotalFaces: Math.max(0, totalFaces - award.scoreDelta),
        title: 'Tesoro desbloqueado',
      };
    },
    [recentAwards, seenAwardIds, totalFaces],
  );

  const claimReward = useCallback(
    async (input: HappyRewardClaim) => {
      rememberAwardSeen(input.id);
      await showTreasureReward(input);
    },
    [rememberAwardSeen, showTreasureReward],
  );

  const contextValue = useMemo(
    () => ({ claimReward, clearReward, getRewardForSettlement }),
    [claimReward, clearReward, getRewardForSettlement],
  );

  return (
    <HappyRewardContext.Provider value={contextValue}>
      {children}
      {rewardOverlay}
    </HappyRewardContext.Provider>
  );
}

export function useHappyReward() {
  const context = useContext(HappyRewardContext);
  if (!context) {
    throw new Error('useHappyReward must be used inside HappyRewardProvider.');
  }

  return context;
}
