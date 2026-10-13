import { parseHistorySyncState, type HistorySyncState } from './history-sync';
import { randomUUID } from 'expo-crypto';
import { historyCacheReceipt, type HistoryCacheReceipt } from './history-cache-receipt';

// Browser sessions can sync incrementally without adding a native dependency.
// Reloading starts a full bootstrap; mobile uses durable SQLite storage.
const historyByScopeAndUser = new Map<string, string>();
const syncLocks = new Map<string, Promise<void>>();

export async function withHistorySyncLock<T>(
  userId: string,
  scope: string,
  callback: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([scope, userId]);
  const previous = syncLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  syncLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (syncLocks.get(key) === current) {
      syncLocks.delete(key);
    }
  }
}

export async function readCachedHistory(
  userId: string,
  scope: string,
): Promise<HistorySyncState | null> {
  const key = JSON.stringify([scope, userId]);
  const payload = historyByScopeAndUser.get(key);
  if (!payload) {
    return null;
  }
  const state = parseHistorySyncState(JSON.parse(payload));
  if (!state) {
    historyByScopeAndUser.delete(key);
  }
  return state;
}

export async function persistCachedHistory(
  userId: string,
  scope: string,
  state: HistorySyncState,
): Promise<HistoryCacheReceipt> {
  const generation = randomUUID();
  const payload = JSON.stringify({ ...state, cacheGeneration: generation });
  if (!parseHistorySyncState(JSON.parse(payload))) {
    throw new Error('Cannot persist an invalid history sync state.');
  }
  historyByScopeAndUser.set(JSON.stringify([scope, userId]), payload);
  return historyCacheReceipt(userId, scope, generation, state);
}

export async function readCachedHistoryReceipt(
  userId: string,
  scope: string,
): Promise<HistoryCacheReceipt | null> {
  const payload = historyByScopeAndUser.get(JSON.stringify([scope, userId]));
  if (!payload) return null;
  const value = JSON.parse(payload) as HistorySyncState & { cacheGeneration?: string };
  const state = parseHistorySyncState(value);
  return state ? historyCacheReceipt(userId, scope, value.cacheGeneration ?? null, state) : null;
}
