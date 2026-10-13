import { queryClient } from '@/lib/query-client';
import {
  assertSessionDataGeneration,
  captureSessionDataGeneration,
  isSessionDataGenerationCurrent,
} from '@/lib/session-data-boundary';

import { appConfig } from '../../config';
import { buildLiveSnapshot } from '../build-snapshot';
import { buildPeopleOverviewFromAppSnapshot } from '../build-people-overview';
import { assertSupabaseClient } from '../client';
import { cachedSnapshotMatchesBackend } from '../confirmed-request-overlay';
import { APP_SNAPSHOT_QUERY_KEY, PEOPLE_OVERVIEW_QUERY_KEY } from '../constants';
import {
  readCachedHistory,
  readCachedHistoryReceipt,
  persistCachedHistory,
  withHistorySyncLock,
} from '../history-sync-cache';
import { mergeHistoryWithLiveRows, type HistorySyncState } from '../history-sync';
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
import type { HistoryCacheReceipt } from '../history-cache-receipt';
import {
  reconcileAcceptedProjection,
  acceptedProjectionResponse,
  mergeAcceptedProjectionResponses,
} from '../accepted-request-projection';
import {
  readConfirmedRequestOutcomes,
  outcomesForConfirmedRows,
  mergeConfirmedRequestOutcomes,
  suppressConfirmedRequestOutcomes,
} from '../confirmed-request-outcomes';

async function sameActor(userId: string, generation: number): Promise<boolean> {
  if (!isSessionDataGenerationCurrent(generation)) return false;
  const { data } = await assertSupabaseClient().auth.getSession();
  return isSessionDataGenerationCurrent(generation) && data.session?.user.id === userId;
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
  generation = captureSessionDataGeneration(),
): Promise<void> {
  const assertCurrent = () => assertSessionDataGeneration(generation);
  try {
    const rows = authoritativeRows(response, userId);
    const outcomes = mergeConfirmedRequestOutcomes(
      readConfirmedRequestOutcomes(response),
      outcomesForConfirmedRows(rows),
    );
    if ((rows.length === 0 && outcomes.length === 0) || !(await sameActor(userId, generation)))
      return;
    const snapshotKey = [APP_SNAPSHOT_QUERY_KEY, userId] as const;
    const overviewKey = [PEOPLE_OVERVIEW_QUERY_KEY, userId] as const;
    // Abort readers before waiting for their lock, so an older fetch cannot
    // publish its snapshot after the committed action has been reconciled.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: snapshotKey, exact: true }),
      queryClient.cancelQueries({ queryKey: overviewKey, exact: true }),
    ]).catch(warn);
    await withHistorySyncLock(userId, appConfig.supabaseUrl, async () => {
      if (!(await sameActor(userId, generation))) return;
      const loaded = await readCachedAppSnapshot(userId).catch((error: unknown) => {
        warn(error);
        return null;
      });
      assertCurrent();
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
      assertCurrent();
      const combinedOutcomes = mergeConfirmedRequestOutcomes(
        state?.confirmedRequestOutcomes ?? [],
        [cached?.snapshot.confirmedRequestOutcomes, current?.confirmedRequestOutcomes].flatMap(
          (overlay) =>
            overlay?.backendScope === appConfig.supabaseUrl && overlay.userId === userId
              ? overlay.outcomes
              : [],
        ),
      );
      const confirmedOutcomes = mergeConfirmedRequestOutcomes(combinedOutcomes, outcomes);
      const incomingProjection = acceptedProjectionResponse(response, userId);
      const previousProjections = [
        cached?.snapshot.confirmedAcceptedProjections,
        current?.confirmedAcceptedProjections,
      ].flatMap((overlay) =>
        overlay?.backendScope === appConfig.supabaseUrl && overlay.userId === userId
          ? overlay.responses.flatMap((item) => {
              const sanitized = acceptedProjectionResponse(item, userId);
              return sanitized ? [sanitized] : [];
            })
          : [],
      );
      const confirmedProjections = mergeAcceptedProjectionResponses(
        previousProjections,
        incomingProjection ? [incomingProjection] : [],
      );
      const next = state
        ? confirmedProjections.reduce<HistorySyncState>(
            (before, item) => reconcileAcceptedProjection(before, item, userId),
            {
              ...reconcile(state, confirmedRows),
              confirmedRequestOutcomes: confirmedOutcomes,
            },
          )
        : null;
      let rawDurable = false;
      let receipt: HistoryCacheReceipt | undefined;
      if (next) {
        try {
          receipt = await persistCachedHistory(userId, appConfig.supabaseUrl, next, {
            assertCurrent,
          });
          rawDurable = Boolean(next.liveRows);
        } catch (error) {
          warn(error);
        }
      }
      assertCurrent();
      let snapshot: AppSnapshot | undefined;
      let avatars = next?.liveRows?.avatarSignedUrlsByPath ?? {};
      let fetchedAt = next?.liveRows?.fetchedAt ?? new Date().toISOString();
      if (next?.liveRows && next.bootstrapComplete === true) {
        snapshot = buildLiveSnapshot({
          ...mergeHistoryWithLiveRows(next.liveRows, next),
          currentUserId: userId,
        });
      } else {
        if (current)
          snapshot = suppressConfirmedRequestOutcomes(
            reconcileDerivedSnapshot(userId, current, confirmedRows),
            confirmedOutcomes,
          );
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
        localHistoryCache: rawDurable ? receipt : undefined,
        confirmedRequestOutcomes:
          rawDurable || !confirmedOutcomes.length
            ? undefined
            : { backendScope: appConfig.supabaseUrl, userId, outcomes: confirmedOutcomes },
        confirmedAcceptedProjections:
          (rawDurable && next?.bootstrapComplete === true) || !confirmedProjections.length
            ? undefined
            : { backendScope: appConfig.supabaseUrl, userId, responses: confirmedProjections },
        confirmedFinancialRequests: rawDurable
          ? undefined
          : {
              backendScope: appConfig.supabaseUrl,
              rows: overlayRows,
            },
      };
      const overview: PeopleOverview = buildPeopleOverviewFromAppSnapshot(snapshot, fetchedAt);
      if (!(await sameActor(userId, generation))) return;
      queryClient.setQueryData(snapshotKey, snapshot);
      queryClient.setQueryData(overviewKey, overview);
      const confirmedSnapshot = snapshot;
      const persistDerived = async () => {
        assertCurrent();
        await Promise.all([
          persistCachedAppSnapshot(userId, confirmedSnapshot, avatars, { assertCurrent }).catch(
            warn,
          ),
          persistCachedPeopleOverview(userId, overview, avatars, { assertCurrent }).catch(warn),
        ]);
      };
      if (rawDurable && receipt?.generation) {
        const receiptGeneration = receipt.generation;
        // Enqueue while still holding the journal lock so later commands and
        // refreshes retain order. The action can finish before redundant writes.
        void withHistorySyncLock(userId, appConfig.supabaseUrl, async () => {
          if (!(await sameActor(userId, generation))) return;
          const latest = await readCachedHistoryReceipt(userId, appConfig.supabaseUrl);
          assertCurrent();
          if (latest?.generation !== receiptGeneration) return;
          const memory = queryClient.getQueryData<AppSnapshot>(snapshotKey);
          if (memory && memory !== confirmedSnapshot) return;
          await persistDerived();
        }).catch(warn);
      } else {
        // If the raw journal failed, this is the only durable acknowledgement;
        // keep its fallback write on the command path before reporting success.
        await persistDerived();
      }
    });
  } catch (error) {
    // Server success stays success even if a local observer or SQLite fails.
    warn(error);
  }
}
