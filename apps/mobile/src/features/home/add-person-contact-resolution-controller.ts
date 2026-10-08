import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { onlineManager } from '@tanstack/react-query';
import { updateWarmContactScanTargetCache } from './add-person-contact-scan-cache';
import { uniqueContactPhoneE164List } from './contacts-sheet-helpers';
import { loadPeopleTargetResolutionCache } from './people-target-resolution-cache';
import {
  manageContactDiscovery,
  resolveContactPhones,
  setContactDiscoverySession,
} from './contact-resolution-service';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import {
  contactResolutionEpoch,
  invalidateContactResolutions,
  isContactRealtimeReady,
  mergeContactResolutions,
  readContactResolutions,
  subscribeContactRealtime,
  subscribeContactResolutions,
} from '@/lib/contact-resolution-state';

export function useAddPersonContactResolutionController(input: {
  readonly busyKey: string | null;
  readonly setBusyKey: Dispatch<SetStateAction<string | null>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
  readonly userId: string | null;
  readonly visible: boolean;
}) {
  const { userId, setMessage, visible } = input;
  const subscribe = useCallback(
    (listener: () => void) =>
      userId ? subscribeContactResolutions(userId, listener) : () => undefined,
    [userId],
  );
  const getSnapshot = useCallback(() => readContactResolutions(userId), [userId]);
  const targetCache = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const targetCacheRef = useRef(targetCache);
  targetCacheRef.current = targetCache;
  const scanRunIdRef = useRef(0);
  const visibleResolutionPhonesRef = useRef(new Set<string>());
  const knownPhonesRef = useRef(new Set<string>());
  const activeRef = useRef(false);

  const mergeTargetResolutions = useCallback(
    (rows: readonly PeopleTargetResolution[]) => {
      if (userId) mergeContactResolutions(userId, rows, { fromCache: true });
    },
    [userId],
  );
  const setTargetCache = useCallback(
    (rows: Record<string, PeopleTargetResolution>) => {
      mergeTargetResolutions(Object.values(rows));
    },
    [mergeTargetResolutions],
  );

  const loadCachedTargetResolutionsForPhones = useCallback(
    async (runId: number, phones: readonly string[]) => {
      if (!userId || !phones.length) return;
      const expectedEpoch = contactResolutionEpoch(userId);
      const cached = await loadPeopleTargetResolutionCache(userId, phones).catch(() => ({}));
      if (scanRunIdRef.current === runId)
        mergeContactResolutions(userId, Object.values(cached), { fromCache: true, expectedEpoch });
    },
    [userId],
  );

  const refreshPhones = useCallback(
    async (
      phones: readonly string[],
      priority: 'visible' | 'background' | 'event',
      force = false,
    ) => {
      if (!userId || !activeRef.current || !onlineManager.isOnline()) return;
      try {
        await resolveContactPhones(userId, phones, priority, force);
      } catch {
        if (priority === 'visible')
          setMessage(
            'Mostramos la última información disponible. Volveremos a consultar al recuperar la conexión.',
          );
      }
    },
    [setMessage, userId],
  );

  const hydrateAndEnqueueResolutionPhones = useCallback(
    (runId: number, phones: readonly string[], priority: 'visible' | 'background') => {
      for (const phone of phones) knownPhonesRef.current.add(phone);
      void loadCachedTargetResolutionsForPhones(runId, phones).then(() => {
        if (scanRunIdRef.current === runId) void refreshPhones(phones, priority);
      });
    },
    [loadCachedTargetResolutionsForPhones, refreshPhones],
  );

  const resolvePhoneStatusesNow = useCallback(
    async (phones: readonly string[]) => {
      if (!userId) return [];
      if (!onlineManager.isOnline())
        throw new Error('Necesitas conexión para confirmar el estado de este contacto.');
      return resolveContactPhones(userId, phones, 'interactive', true);
    },
    [userId],
  );
  const ensurePhoneStatuses = useCallback(
    async (phones: readonly string[]) => {
      if (!userId) return;
      for (const phone of phones) knownPhonesRef.current.add(phone);
      await resolveContactPhones(userId, phones, 'interactive');
    },
    [userId],
  );
  const forceResolvePhones = useCallback(
    async (phones: readonly string[], busyKey: string) => {
      if (input.busyKey) return;
      input.setBusyKey(busyKey);
      try {
        await resolvePhoneStatusesNow(phones);
        setMessage('Contacto actualizado.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo consultar el contacto.');
      } finally {
        input.setBusyKey(null);
      }
    },
    [input.busyKey, input.setBusyKey, resolvePhoneStatusesNow, setMessage],
  );
  const handleReviewContact = useCallback(
    (contact: ContactCandidate) =>
      forceResolvePhones(uniqueContactPhoneE164List([contact]), contact.primaryPhone.phoneE164),
    [forceResolvePhones],
  );
  const handleReviewPhone = useCallback(
    (value: { readonly phoneE164: string }) =>
      forceResolvePhones([value.phoneE164], value.phoneE164),
    [forceResolvePhones],
  );
  const resetResolutionState = useCallback(() => {
    scanRunIdRef.current += 1;
    visibleResolutionPhonesRef.current.clear();
  }, []);

  useEffect(() => {
    knownPhonesRef.current.clear();
    scanRunIdRef.current += 1;
  }, [userId]);

  useEffect(() => {
    if (!userId || !visible) return;
    const sessionId = Crypto.randomUUID();
    let lastRenewedAt = Date.now();
    let registered = false;
    const registerKnown = () => {
      if (!activeRef.current || !isContactRealtimeReady(userId) || !knownPhonesRef.current.size)
        return;
      registered = true;
      void refreshPhones([...knownPhonesRef.current], 'background', true);
    };
    const activate = () => {
      activeRef.current = AppState.currentState === 'active';
      setContactDiscoverySession(userId, activeRef.current ? sessionId : null);
      if (activeRef.current) {
        invalidateContactResolutions({ userId });
        registerKnown();
      }
    };
    activeRef.current = AppState.currentState === 'active';
    setContactDiscoverySession(userId, activeRef.current ? sessionId : null);
    const unsubscribe = subscribeContactResolutions(userId, ({ invalidatedPhones, priority }) => {
      updateWarmContactScanTargetCache(userId, readContactResolutions(userId));
      if (!invalidatedPhones.length) return;
      if (priority === 'event') {
        void refreshPhones(invalidatedPhones, 'event', true);
      } else {
        const visiblePhones = invalidatedPhones.filter((phone) =>
          visibleResolutionPhonesRef.current.has(phone),
        );
        void refreshPhones(visiblePhones, 'visible', true);
        void refreshPhones(invalidatedPhones, 'background', true);
      }
    });
    const unsubscribeRealtime = subscribeContactRealtime(userId, registerKnown);
    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) activate();
    });
    const appState = AppState.addEventListener('change', activate);
    const interval = setInterval(() => {
      if (!activeRef.current || !onlineManager.isOnline()) return;
      void refreshPhones([...visibleResolutionPhonesRef.current], 'visible');
      if (!registered && isContactRealtimeReady(userId)) registerKnown();
      if (Date.now() - lastRenewedAt >= 5 * 60_000 && isContactRealtimeReady(userId)) {
        lastRenewedAt = Date.now();
        void manageContactDiscovery(sessionId, 'renew')
          .then((result) => {
            if (result.status === 'expired') registerKnown();
          })
          .catch(() => {
            lastRenewedAt = 0;
          });
      }
    }, 15_000);
    return () => {
      activeRef.current = false;
      clearInterval(interval);
      unsubscribe();
      unsubscribeRealtime();
      unsubscribeOnline();
      appState.remove();
      setContactDiscoverySession(userId, null);
      void manageContactDiscovery(sessionId, 'stop').catch(() => undefined);
    };
  }, [refreshPhones, userId, visible]);

  return {
    ensurePhoneStatuses,
    handleReviewContact,
    handleReviewPhone,
    hydrateAndEnqueueResolutionPhones,
    loadCachedTargetResolutionsForPhones,
    mergeTargetResolutions,
    resetResolutionState,
    resolvePhoneStatusesNow,
    scanRunIdRef,
    setTargetCache,
    targetCache,
    targetCacheRef,
    visibleResolutionPhonesRef,
  };
}
