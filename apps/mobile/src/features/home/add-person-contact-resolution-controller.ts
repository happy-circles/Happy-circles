import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { onlineManager } from '@tanstack/react-query';
import { uniqueContactPhoneE164List } from './contacts-sheet-helpers';
import { loadPeopleTargetResolutionCache } from './people-target-resolution-cache';
import { resolveContactPhones } from './contact-resolution-service';
import {
  setContactDiscoveryKnownPhones,
  setContactDiscoveryVisiblePhones,
} from '@/lib/contact-discovery-runtime';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import {
  contactResolutionEpoch,
  mergeContactResolutions,
  readContactResolutions,
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
  const hydratedPhonesRef = useRef(new Set<string>());
  const cacheLoadsRef = useRef(new Map<string, Promise<void>>());

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
      void runId;
      const hydrated = hydratedPhonesRef.current;
      const loads = cacheLoadsRef.current;
      const needed = [...new Set(phones)].filter(
        (phone) => !targetCacheRef.current[phone] && !hydrated.has(phone) && !loads.has(phone),
      );
      const pending = phones.flatMap((phone) => (loads.get(phone) ? [loads.get(phone)!] : []));
      if (!needed.length) {
        await Promise.all(pending);
        return;
      }
      const expectedEpoch = contactResolutionEpoch(userId);
      const load = loadPeopleTargetResolutionCache(userId, needed)
        .then((cached) => {
          mergeContactResolutions(userId, Object.values(cached), {
            fromCache: true,
            expectedEpoch,
          });
          for (const phone of needed) hydrated.add(phone);
        })
        .catch(() => undefined)
        .finally(() => {
          for (const phone of needed) loads.delete(phone);
        });
      for (const phone of needed) loads.set(phone, load);
      await Promise.all([...pending, load]);
    },
    [userId],
  );

  const hydrateAndEnqueueResolutionPhones = useCallback(
    (runId: number, phones: readonly string[], priority: 'visible' | 'background') => {
      void loadCachedTargetResolutionsForPhones(runId, phones).then(() => {
        if (!userId || scanRunIdRef.current !== runId) return;
        if (priority === 'visible')
          setContactDiscoveryVisiblePhones(userId, [...visibleResolutionPhonesRef.current]);
        setContactDiscoveryKnownPhones(userId, phones, priority);
      });
    },
    [loadCachedTargetResolutionsForPhones, userId],
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
      setContactDiscoveryKnownPhones(userId, phones, 'visible');
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
    if (userId) setContactDiscoveryVisiblePhones(userId, []);
  }, [userId]);

  useEffect(() => {
    scanRunIdRef.current += 1;
    hydratedPhonesRef.current = new Set();
    cacheLoadsRef.current = new Map();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!visible) setContactDiscoveryVisiblePhones(userId, []);
    return () => {
      setContactDiscoveryVisiblePhones(userId, []);
    };
  }, [userId, visible]);

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
