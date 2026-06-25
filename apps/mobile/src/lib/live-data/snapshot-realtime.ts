import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { supabase } from '../supabase';
import { invalidateAppSnapshot } from './client';

const SNAPSHOT_REALTIME_DEBOUNCE_MS = 650;
const FOREGROUND_REFETCH_AFTER_MS = 5 * 60_000;
const MAX_REMEMBERED_EVENT_IDS = 80;

interface BroadcastEnvelope {
  readonly payload?: unknown;
}

interface SnapshotRealtimePayload {
  readonly eventId?: string;
  readonly kind?: string;
  readonly sourceItemId?: string | null;
  readonly sentAt?: string;
  readonly version?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSnapshotPayload(envelope: BroadcastEnvelope): SnapshotRealtimePayload | null {
  const payload = asRecord(envelope.payload);
  if (!payload) {
    return null;
  }

  const parsed: {
    eventId?: string;
    kind?: string;
    sourceItemId?: string | null;
    sentAt?: string;
    version?: string;
  } = {};

  if (typeof payload.eventId === 'string') {
    parsed.eventId = payload.eventId;
  }

  if (typeof payload.kind === 'string') {
    parsed.kind = payload.kind;
  }

  if (typeof payload.sourceItemId === 'string' || payload.sourceItemId === null) {
    parsed.sourceItemId = payload.sourceItemId;
  }

  if (typeof payload.sentAt === 'string') {
    parsed.sentAt = payload.sentAt;
  }

  if (typeof payload.version === 'string') {
    parsed.version = payload.version;
  }

  return parsed;
}

async function setRealtimeAuthForCurrentSession(userId: string): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== userId) {
    return false;
  }

  await supabase.realtime.setAuth(session.access_token);
  return true;
}

export function useSnapshotRealtimeBridge(userId: string | null | undefined, enabled: boolean) {
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInvalidateAtRef = useRef(0);
  const seenEventIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId || !enabled) {
      return undefined;
    }

    let isMounted = true;
    let appState: AppStateStatus = AppState.currentState;
    const channel = client.channel(`user:${userId}`, {
      config: {
        private: true,
      },
    });

    function rememberEventId(eventId: string): boolean {
      if (seenEventIdsRef.current.includes(eventId)) {
        return false;
      }

      seenEventIdsRef.current = [...seenEventIdsRef.current, eventId].slice(
        -MAX_REMEMBERED_EVENT_IDS,
      );
      return true;
    }

    function scheduleSnapshotInvalidation(delayMs = SNAPSHOT_REALTIME_DEBOUNCE_MS) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        debounceTimeoutRef.current = null;
        lastInvalidateAtRef.current = Date.now();
        void invalidateAppSnapshot().catch(() => undefined);
      }, delayMs);
    }

    function handleSnapshotChanged(envelope: BroadcastEnvelope) {
      const payload = parseSnapshotPayload(envelope);
      if (payload?.eventId && !rememberEventId(payload.eventId)) {
        return;
      }

      scheduleSnapshotInvalidation();
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = appState !== 'active' && nextState === 'active';
      appState = nextState;

      if (!wasBackgrounded) {
        return;
      }

      void setRealtimeAuthForCurrentSession(userId).catch(() => undefined);

      if (Date.now() - lastInvalidateAtRef.current > FOREGROUND_REFETCH_AFTER_MS) {
        scheduleSnapshotInvalidation(0);
      }
    });

    const authSubscription = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === userId) {
        void client.realtime.setAuth(session.access_token);
      }
    }).data.subscription;

    void setRealtimeAuthForCurrentSession(userId)
      .then((canSubscribe) => {
        if (!isMounted || !canSubscribe) {
          return;
        }

        channel
          .on('broadcast', { event: 'snapshot_changed' }, handleSnapshotChanged)
          .subscribe((status) => {
            const statusText = String(status);
            if (statusText === 'CHANNEL_ERROR' || statusText === 'TIMED_OUT') {
              scheduleSnapshotInvalidation();
            }
          });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      appStateSubscription.remove();
      authSubscription.unsubscribe();
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      void client.removeChannel(channel);
    };
  }, [enabled, userId]);
}
