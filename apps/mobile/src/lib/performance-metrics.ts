import type { AnalyticsScreenName } from '@happy-circles/shared';

import { recordProductEventSafe } from './analytics-client';

type AppStartKind = 'cached_restore' | 'cold_start' | 'warm_start';
type SnapshotNetworkStatus = 'error' | 'success';
type SnapshotCacheState = 'hit' | 'miss' | 'none' | 'stale' | 'unknown';

interface FirstScreenReadyListener {
  (): void;
}

const appStartedAtMs = nowMs();
const firstScreenReadyListeners = new Set<FirstScreenReadyListener>();
const backgroundRefetchFailures = new Set<string>();

let appStartRecorded = false;
let splashHiddenAtMs: number | null = null;
let firstScreenReadyAtMs: number | null = null;
let latestSnapshotCacheState: SnapshotCacheState = 'unknown';
let latestSnapshotVersion: string | null = null;
let currentRoute: string | null = null;

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function elapsedSinceAppStart(): number {
  return Math.max(0, Math.round(nowMs() - appStartedAtMs));
}

function cleanRoute(route: string): string {
  const normalized = route.trim();
  return normalized.length > 0 ? normalized.slice(0, 120) : 'home';
}

function startKind(): AppStartKind {
  if (firstScreenReadyAtMs !== null) {
    return 'warm_start';
  }

  return latestSnapshotCacheState === 'hit' || latestSnapshotCacheState === 'stale'
    ? 'cached_restore'
    : 'cold_start';
}

export function recordPerformanceAppStart(): void {
  if (appStartRecorded) {
    return;
  }

  appStartRecorded = true;
  recordProductEventSafe({
    eventName: 'performance_app_start',
    metadata: {
      durationMs: elapsedSinceAppStart(),
      phase: 'runtime_ready',
      startKind: startKind(),
    },
  });
}

export function markSplashHidden(): void {
  if (splashHiddenAtMs !== null) {
    return;
  }

  splashHiddenAtMs = nowMs();
  recordProductEventSafe({
    eventName: 'performance_app_start',
    metadata: {
      durationMs: elapsedSinceAppStart(),
      phase: 'splash_hidden',
      startKind: startKind(),
    },
  });
}

export function recordSnapshotCacheRestored(input: {
  readonly cacheHit: boolean;
  readonly durationMs: number;
  readonly updatedAt?: string | null;
}): void {
  latestSnapshotCacheState = input.cacheHit ? 'hit' : 'miss';
  latestSnapshotVersion = input.updatedAt ?? null;

  const cachedAtMs = input.updatedAt ? Date.parse(input.updatedAt) : Number.NaN;
  const cachedAgeMs = Number.isFinite(cachedAtMs) ? Math.max(0, Date.now() - cachedAtMs) : null;

  recordProductEventSafe({
    eventName: 'performance_snapshot_cache_restored',
    metadata: {
      cacheHit: input.cacheHit,
      cacheState: latestSnapshotCacheState,
      cachedAgeMs,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      networkStatus: 'pending',
      snapshotVersion: latestSnapshotVersion,
    },
  });
}

export function recordSnapshotNetworkResolved(input: {
  readonly durationMs: number;
  readonly status: SnapshotNetworkStatus;
  readonly snapshotVersion?: string | null;
}): void {
  if (input.status === 'success') {
    latestSnapshotCacheState = 'stale';
    latestSnapshotVersion = input.snapshotVersion ?? new Date().toISOString();
  }

  recordProductEventSafe({
    eventName: 'performance_snapshot_network_resolved',
    metadata: {
      durationMs: Math.max(0, Math.round(input.durationMs)),
      networkStatus: input.status,
      snapshotVersion: input.snapshotVersion ?? latestSnapshotVersion,
    },
  });
}

export function recordPerformanceScreenReady(input: {
  readonly route: string;
  readonly screenName: AnalyticsScreenName;
}): void {
  const isFirstScreen = firstScreenReadyAtMs === null;
  const durationMs = isFirstScreen ? elapsedSinceAppStart() : 0;

  if (isFirstScreen) {
    firstScreenReadyAtMs = nowMs();
  }

  recordProductEventSafe({
    eventName: 'performance_screen_ready',
    screenName: input.screenName,
    metadata: {
      cacheState: latestSnapshotCacheState,
      durationMs,
      route: cleanRoute(input.route),
      startKind: startKind(),
    },
  });

  if (isFirstScreen) {
    for (const listener of firstScreenReadyListeners) {
      listener();
    }
  }
}

export function setCurrentPerformanceRoute(route: string): void {
  currentRoute = cleanRoute(route);
}

export function recordBackgroundRefetchFailed(input: {
  readonly error: Error;
  readonly route?: string | null;
  readonly snapshotVersion?: string | null;
}): void {
  const failureKey = `${input.route ?? 'unknown'}:${input.snapshotVersion ?? latestSnapshotVersion ?? 'none'}:${input.error.message}`;
  if (backgroundRefetchFailures.has(failureKey)) {
    return;
  }

  backgroundRefetchFailures.add(failureKey);
  recordProductEventSafe({
    eventName: 'performance_background_refetch_failed',
    metadata: {
      cacheState: latestSnapshotCacheState,
      networkStatus: 'error',
      reason: input.error.message.slice(0, 120),
      route: input.route ? cleanRoute(input.route) : currentRoute,
      snapshotVersion: input.snapshotVersion ?? latestSnapshotVersion,
    },
  });
}

export function subscribeFirstScreenReady(listener: FirstScreenReadyListener): () => void {
  if (firstScreenReadyAtMs !== null) {
    listener();
    return () => undefined;
  }

  firstScreenReadyListeners.add(listener);
  return () => {
    firstScreenReadyListeners.delete(listener);
  };
}
