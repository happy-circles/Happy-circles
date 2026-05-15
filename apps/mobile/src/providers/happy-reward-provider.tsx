import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';

import {
  type HappyTreasureRewardInput,
  useHappyTreasureReward,
} from '@/components/happy-treasure-overlay';
import { useAppSnapshot, useClaimHappyCircleTreasureMutation } from '@/lib/live-data';

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

export function HappyRewardProvider({ children }: PropsWithChildren) {
  const snapshotQuery = useAppSnapshot();
  const { mutateAsync: claimTreasureAsync } = useClaimHappyCircleTreasureMutation();
  const { clearReward, rewardOverlay, showReward: showTreasureReward } = useHappyTreasureReward();

  const score = snapshotQuery.data?.happyCircleScore ?? null;
  const claimableAwards = score?.claimableAwards ?? [];
  const totalFaces = score?.totalFaces ?? 0;

  const getRewardForSettlement = useCallback(
    (settlementProposalId: string | null | undefined): HappyRewardClaim | null => {
      if (!settlementProposalId) {
        return null;
      }

      const award = claimableAwards.find(
        (item) => item.settlementProposalId === settlementProposalId,
      );
      if (!award) {
        return null;
      }

      return {
        id: award.id,
        scoreDelta: award.scoreDelta,
        settlementProposalId: award.settlementProposalId,
        startingTotalFaces: totalFaces,
        title: 'Tesoro desbloqueado',
      };
    },
    [claimableAwards, totalFaces],
  );

  const claimReward = useCallback(
    async (input: HappyRewardClaim) => {
      const result = await claimTreasureAsync(input.id);
      if (result.status === 'claimed') {
        await showTreasureReward(input);
      }
    },
    [claimTreasureAsync, showTreasureReward],
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
