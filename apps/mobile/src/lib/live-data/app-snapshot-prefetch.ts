import { queryClient } from '../query-client';
import { APP_SNAPSHOT_QUERY_KEY } from './constants';
import { fetchAppSnapshotForUser } from './app-snapshot-fetcher';

export async function prefetchAppSnapshot(userId: string) {
  await queryClient.prefetchQuery({
    queryKey: [APP_SNAPSHOT_QUERY_KEY, userId] as const,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchAppSnapshotForUser(userId, signal),
  });
}
