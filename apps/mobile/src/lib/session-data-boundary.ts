import { useSyncExternalStore } from 'react';

import { queryClient } from './query-client';

interface SessionDataIdentity {
  readonly userId: string;
  readonly sessionId: string;
}

const PRIVATE_QUERY_KEYS = new Set([
  'app-snapshot',
  'people-overview',
  'friendship-invite-preview',
  'account-invite-preview',
]);
let identity: SessionDataIdentity | null = null;
let generation = 0;
const listeners = new Set<() => void>();

export function captureSessionDataGeneration(): number {
  return generation;
}

export function currentSessionDataUserId(): string | undefined {
  return identity?.userId;
}

export function isSessionDataGenerationCurrent(expected: number): boolean {
  return expected === generation;
}

export function assertSessionDataGeneration(expected: number, signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Sincronización cancelada.');
  if (!isSessionDataGenerationCurrent(expected))
    throw new Error('La sesión cambió. Vuelve a consultar el estado.');
}

/** Invalidate readers synchronously, including an A -> B -> A transition. */
export function invalidateSessionData(): void {
  generation += 1;
  const previousUserId = identity?.userId;
  if (previousUserId) {
    const filters = {
      predicate: (query: { readonly queryKey: readonly unknown[] }) =>
        PRIVATE_QUERY_KEYS.has(String(query.queryKey[0])) && query.queryKey[1] === previousUserId,
    };
    // Cancellation starts synchronously. Do not await here inside an auth event,
    // or remove later: a new session may already have populated the same key.
    void queryClient.cancelQueries(filters).catch(() => undefined);
    queryClient.removeQueries(filters);
  }
  for (const listener of listeners) listener();
}

export function setSessionDataIdentity(next: SessionDataIdentity | null): boolean {
  if (identity?.userId === next?.userId && identity?.sessionId === next?.sessionId) return false;
  invalidateSessionData();
  identity = next;
  return true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSessionDataGeneration(): number {
  return useSyncExternalStore(
    subscribe,
    captureSessionDataGeneration,
    captureSessionDataGeneration,
  );
}
