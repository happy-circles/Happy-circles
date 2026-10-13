import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/providers/session-provider';
import { hydrateSignedAvatarUrlCache } from '../avatar';
import { isSessionDataGenerationCurrent, useSessionDataGeneration } from '../session-data-boundary';
import { PEOPLE_OVERVIEW_QUERY_KEY } from './constants';
import { fetchPeopleOverviewForUser } from './people-overview-fetcher';
import { readCachedPeopleOverview } from './people-overview-cache';
import { restorePeopleOverviewForSession } from './people-overview-hydration';
import type { PeopleOverview } from './types';

const PEOPLE_OVERVIEW_STALE_TIME_MS = 5 * 60_000;
const PEOPLE_OVERVIEW_CACHE_RESTORE_TIMEOUT_MS = 500;

interface CacheHydrationState {
  readonly complete: boolean;
  readonly restored: boolean;
  readonly userId: string | null;
  readonly generation: number;
}

const EMPTY_HYDRATION_STATE: CacheHydrationState = {
  complete: false,
  restored: false,
  userId: null,
  generation: -1,
};

function parsedUpdatedAt(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function usePeopleOverview() {
  const { userId } = useSession();
  const generation = useSessionDataGeneration();
  const queryClient = useQueryClient();
  const [hydration, setHydration] = useState<CacheHydrationState>(EMPTY_HYDRATION_STATE);
  const queryKey = useMemo(
    () => [PEOPLE_OVERVIEW_QUERY_KEY, userId ?? 'signed-out'] as const,
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && isSessionDataGenerationCurrent(generation);

    if (!userId) {
      setHydration(EMPTY_HYDRATION_STATE);
      return () => {
        cancelled = true;
      };
    }

    setHydration({
      complete: false,
      restored: false,
      userId,
      generation,
    });

    const restoreTimeout = setTimeout(() => {
      if (isCurrent()) {
        setHydration({
          complete: true,
          restored: false,
          userId,
          generation,
        });
      }
    }, PEOPLE_OVERVIEW_CACHE_RESTORE_TIMEOUT_MS);

    void restorePeopleOverviewForSession({
      read: () => readCachedPeopleOverview(userId),
      canRestore: () => isCurrent() && !queryClient.getQueryData<PeopleOverview>(queryKey),
      publish: (cached) => {
        hydrateSignedAvatarUrlCache(cached.avatarSignedUrlsByPath);
        queryClient.setQueryData(queryKey, cached.overview, {
          updatedAt: parsedUpdatedAt(cached.updatedAt),
        });
      },
    })
      .then((restored) => {
        if (!isCurrent()) {
          return;
        }

        clearTimeout(restoreTimeout);
        setHydration({
          complete: true,
          restored,
          userId,
          generation,
        });
      })
      .catch(() => {
        if (isCurrent()) {
          clearTimeout(restoreTimeout);
          setHydration({
            complete: true,
            restored: false,
            userId,
            generation,
          });
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(restoreTimeout);
    };
  }, [queryClient, queryKey, userId, generation]);

  const hydrationComplete = Boolean(
    userId &&
    hydration.userId === userId &&
    hydration.generation === generation &&
    hydration.complete,
  );
  const query = useQuery({
    enabled: hydrationComplete,
    gcTime: 24 * 60 * 60_000,
    queryFn: ({ signal }) => fetchPeopleOverviewForUser(userId, signal),
    queryKey,
    staleTime: PEOPLE_OVERVIEW_STALE_TIME_MS,
  });

  return {
    ...query,
    isRestoringCache: Boolean(userId) && !query.data && !hydrationComplete,
    isShowingCachedData: Boolean(query.data && hydration.restored && query.isFetching),
  };
}
