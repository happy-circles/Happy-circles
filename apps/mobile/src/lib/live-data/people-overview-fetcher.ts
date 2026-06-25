import { hydrateSignedAvatarUrlCache } from '../avatar';
import { reportAndCreateSupportError } from '../support-errors';
import { buildPeopleOverview } from './build-people-overview';
import { invokeSupabaseFunction } from './client';
import { persistCachedPeopleOverview } from './people-overview-cache';
import type { PeopleOverviewRows } from './types';

export async function fetchPeopleOverviewForUser(userId: string | null) {
  if (!userId) {
    throw new Error('No hay una sesión lista para cargar personas.');
  }

  try {
    const rows = await invokeSupabaseFunction<Record<string, never>, PeopleOverviewRows>(
      'get-people-overview',
      {},
    );
    hydrateSignedAvatarUrlCache(rows.avatarSignedUrlsByPath);
    const overview = buildPeopleOverview(rows);

    try {
      await persistCachedPeopleOverview(userId, overview, rows.avatarSignedUrlsByPath);
    } catch (cacheError) {
      console.warn(
        'Failed to persist people overview cache',
        cacheError instanceof Error ? cacheError.message : String(cacheError),
      );
    }

    return overview;
  } catch (error) {
    throw reportAndCreateSupportError({
      error,
      fallbackMessage: 'No pudimos sincronizar tus personas.',
      kind: 'data_sync',
      metadata: { operation: 'fetch_people_overview' },
    });
  }
}
