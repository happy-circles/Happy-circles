import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/providers/session-provider';
import { hydrateSignedAvatarUrlCache } from '../avatar';
import { PEOPLE_OVERVIEW_QUERY_KEY } from './constants';
import { fetchPeopleOverviewForUser } from './people-overview-fetcher';
import { readCachedPeopleOverview } from './people-overview-cache';
import type { PeopleOverview } from './types';

const PEOPLE_OVERVIEW_STALE_TIME_MS = 5 * 60_000;
const PEOPLE_OVERVIEW_CACHE_RESTORE_TIMEOUT_MS = 500;

interface CacheHydrationState {
  readonly complete: boolean;
  readonly restored: boolean;
  readonly userId: string | null;
}

const EMPTY_HYDRATION_STATE: CacheHydrationState = {
  complete: false,
  restored: false,
  userId: null,
};

function parsedUpdatedAt(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function usePeopleOverview() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const [hydration, setHydration] = useState<CacheHydrationState>(EMPTY_HYDRATION_STATE);
  const queryKey = useMemo(
    () => [PEOPLE_OVERVIEW_QUERY_KEY, userId ?? 'signed-out'] as const,
    [userId],
  );

  useEffect(() => {
    let cancelled = false;

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
    });

    const restoreTimeout = setTimeout(() => {
      if (!cancelled) {
        setHydration({
          complete: true,
          restored: false,
          userId,
        });
      }
    }, PEOPLE_OVERVIEW_CACHE_RESTORE_TIMEOUT_MS);

    void readCachedPeopleOverview(userId)
      .then((cached) => {
        if (cancelled) {
          return;
        }

        clearTimeout(restoreTimeout);
        if (cached) {
          hydrateSignedAvatarUrlCache(cached.avatarSignedUrlsByPath);
          const existing = queryClient.getQueryData<PeopleOverview>(queryKey);
          if (!existing) {
            queryClient.setQueryData(queryKey, cached.overview, {
              updatedAt: parsedUpdatedAt(cached.updatedAt),
            });
          }
        }

        setHydration({
          complete: true,
          restored: Boolean(cached),
          userId,
        });
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(restoreTimeout);
          setHydration({
            complete: true,
            restored: false,
            userId,
          });
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(restoreTimeout);
    };
  }, [queryClient, queryKey, userId]);

  const hydrationComplete = Boolean(userId && hydration.userId === userId && hydration.complete);
  const query = useQuery({
    enabled: hydrationComplete,
    gcTime: 24 * 60 * 60_000,
    queryFn: () => fetchPeopleOverviewForUser(userId),
    queryKey,
    staleTime: PEOPLE_OVERVIEW_STALE_TIME_MS,
  });

  return {
    ...query,
    isRestoringCache: Boolean(userId) && !query.data && !hydrationComplete,
    isShowingCachedData: Boolean(query.data && hydration.restored && query.isFetching),
  };
}
