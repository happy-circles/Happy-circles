import { queryClient } from '@/lib/query-client';

import { appConfig } from '../../config';
import { buildLiveSnapshot } from '../build-snapshot';
import { buildPeopleOverviewFromAppSnapshot } from '../build-people-overview';
import { assertSupabaseClient } from '../client';
import { cachedSnapshotMatchesBackend } from '../confirmed-request-overlay';
import { APP_SNAPSHOT_QUERY_KEY, PEOPLE_OVERVIEW_QUERY_KEY } from '../constants';
import {
  readCachedHistory,
  persistCachedHistory,
  withHistorySyncLock,
} from '../history-sync-cache';
import { mergeHistoryWithLiveRows } from '../history-sync';
import {
  authoritativeRows,
  applicableDerivedRows,
  mergeConfirmedRows,
  reconcile,
  reconcileDerivedSnapshot,
} from '../confirmed-sender-request-state';
import { persistCachedPeopleOverview } from '../people-overview-cache';
import { readCachedAppSnapshot, persistCachedAppSnapshot } from '../snapshot-cache';
import type { AppSnapshot, PeopleOverview } from '../types';

async function sameActor(userId: string): Promise<boolean> {
  const { data } = await assertSupabaseClient().auth.getSession();
  return data.session?.user.id === userId;
}

function warn(error: unknown) {
  console.warn(
    'Failed to persist confirmed sender request state',
    error instanceof Error ? error.message : String(error),
  );
}

/** Reconcile server-confirmed rows without acknowledging the next journal cursor. */
export async function confirmSenderRequestInCache(
  userId: string,
  response: unknown,
): Promise<void> {
  try {
    const rows = authoritativeRows(response, userId);
    if (rows.length === 0 || !(await sameActor(userId))) return;
    const snapshotKey = [APP_SNAPSHOT_QUERY_KEY, userId] as const;
    const overviewKey = [PEOPLE_OVERVIEW_QUERY_KEY, userId] as const;
    // Abort readers before waiting for their lock, so an older fetch cannot
    // publish its snapshot after the committed action has been reconciled.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: snapshotKey, exact: true }),
      queryClient.cancelQueries({ queryKey: overviewKey, exact: true }),
    ]).catch(warn);
    await withHistorySyncLock(userId, appConfig.supabaseUrl, async () => {
      if (!(await sameActor(userId))) return;
      const loaded = await readCachedAppSnapshot(userId).catch((error: unknown) => {
        warn(error);
        return null;
      });
      const cached =
        loaded && cachedSnapshotMatchesBackend(loaded.snapshot, appConfig.supabaseUrl)
          ? loaded
          : null;
      const memory = queryClient.getQueryData<AppSnapshot>(snapshotKey);
      const current =
        memory && cachedSnapshotMatchesBackend(memory, appConfig.supabaseUrl)
          ? memory
          : cached?.snapshot;
      const previousRows = mergeConfirmedRows(
        [],
        [cached?.snapshot.confirmedFinancialRequests, current?.confirmedFinancialRequests].flatMap(
          (overlay) =>
            overlay?.backendScope === appConfig.supabaseUrl
              ? authoritativeRows({ financialRequests: overlay.rows }, userId)
              : [],
        ),
      );
      const combined = mergeConfirmedRows(previousRows, rows);
      const confirmedRows = current ? applicableDerivedRows(current, combined) : combined;
      const state = await readCachedHistory(userId, appConfig.supabaseUrl).catch(
        (error: unknown) => {
          warn(error);
          return null;
        },
      );
      const next = state ? reconcile(state, confirmedRows) : null;
      let rawDurable = false;
      if (next) {
        try {
          await persistCachedHistory(userId, appConfig.supabaseUrl, next);
          rawDurable = Boolean(next.liveRows);
        } catch (error) {
          warn(error);
        }
      }
      let snapshot: AppSnapshot | undefined;
      let avatars = next?.liveRows?.avatarSignedUrlsByPath ?? {};
      let fetchedAt = next?.liveRows?.fetchedAt ?? new Date().toISOString();
      if (next?.liveRows && next.bootstrapComplete === true) {
        snapshot = buildLiveSnapshot({
          ...mergeHistoryWithLiveRows(next.liveRows, next),
          currentUserId: userId,
        });
      } else {
        if (current) snapshot = reconcileDerivedSnapshot(userId, current, confirmedRows);
        avatars = cached?.avatarSignedUrlsByPath ?? avatars;
        fetchedAt = new Date().toISOString();
      }
      if (!snapshot) return;
      const affected = new Set(confirmedRows.map((row) => row.id));
      const overlayRows = next?.liveRows
        ? mergeConfirmedRows(
            [],
            next.liveRows.financialRequests.filter((row) => affected.has(row.id)),
          )
        : mergeConfirmedRows([], confirmedRows);
      snapshot = {
        ...snapshot,
        confirmedFinancialRequests: rawDurable
          ? undefined
          : {
              backendScope: appConfig.supabaseUrl,
              rows: overlayRows,
            },
      };
      const overview: PeopleOverview = buildPeopleOverviewFromAppSnapshot(snapshot, fetchedAt);
      await persistCachedAppSnapshot(userId, snapshot, avatars).catch(warn);
      await persistCachedPeopleOverview(userId, overview, avatars).catch(warn);
      if (!(await sameActor(userId))) return;
      queryClient.setQueryData(snapshotKey, snapshot);
      queryClient.setQueryData(overviewKey, overview);
    });
  } catch (error) {
    // Server success stays success even if a local observer or SQLite fails.
    warn(error);
  }
}
