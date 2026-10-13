import { hydrateSignedAvatarUrlCache } from '../avatar';
import { reportAndCreateSupportError } from '../support-errors';
import {
  assertSessionDataGeneration,
  captureSessionDataGeneration,
} from '../session-data-boundary';
import { buildPeopleOverview } from './build-people-overview';
import { assertSupabaseClient, invokeSupabaseFunction } from './client';
import { persistCachedPeopleOverview } from './people-overview-cache';
import type { PeopleOverviewRows } from './types';

export async function fetchPeopleOverviewForUser(userId: string | null, signal?: AbortSignal) {
  if (!userId) {
    throw new Error('No hay una sesión lista para cargar personas.');
  }

  const generation = captureSessionDataGeneration();
  const assertCurrent = () => assertSessionDataGeneration(generation, signal);
  const assertActor = async () => {
    assertCurrent();
    const { data } = await assertSupabaseClient().auth.getSession();
    assertCurrent();
    if (data.session?.user.id !== userId)
      throw new Error('La sesión cambió. Vuelve a consultar el estado.');
  };
  try {
    await assertActor();
    const rows = await invokeSupabaseFunction<Record<string, never>, PeopleOverviewRows>(
      'get-people-overview',
      {},
      { expectedUserId: userId, signal },
    );
    await assertActor();
    hydrateSignedAvatarUrlCache(rows.avatarSignedUrlsByPath);
    const overview = buildPeopleOverview(rows);

    try {
      await persistCachedPeopleOverview(userId, overview, rows.avatarSignedUrlsByPath, {
        assertCurrent,
      });
    } catch (cacheError) {
      console.warn(
        'Failed to persist people overview cache',
        cacheError instanceof Error ? cacheError.message : String(cacheError),
      );
    }

    await assertActor();
    return overview;
  } catch (error) {
    assertCurrent();
    throw reportAndCreateSupportError({
      error,
      fallbackMessage: 'No pudimos sincronizar tus personas.',
      kind: 'data_sync',
      metadata: { operation: 'fetch_people_overview' },
    });
  }
}
