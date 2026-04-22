import { useSyncExternalStore } from 'react';

export type HomeNavigationIntent =
  | {
      readonly id: number;
      readonly kind: 'open_invite_requests';
      readonly tab: 'received' | 'sent';
    };

let currentIntent: HomeNavigationIntent | null = null;
let nextIntentId = 1;
const listeners = new Set<() => void>();

export function publishHomeNavigationIntent(
  intent: Omit<HomeNavigationIntent, 'id'>,
): HomeNavigationIntent {
  currentIntent = {
    ...intent,
    id: nextIntentId,
  };
  nextIntentId += 1;

  for (const listener of listeners) {
    listener();
  }

  return currentIntent;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): HomeNavigationIntent | null {
  return currentIntent;
}

export function useHomeNavigationIntent(): HomeNavigationIntent | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
