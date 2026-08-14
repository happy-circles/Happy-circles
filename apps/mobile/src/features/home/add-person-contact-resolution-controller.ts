import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { pumpAddPersonResolutionQueue } from '@/features/home/add-person-contact-resolution-queue';
import { updateWarmContactScanTargetCache } from '@/features/home/add-person-contact-scan-cache';
import {
  getUnresolvedContactPhoneE164List,
  uniqueContactPhoneE164List,
} from '@/features/home/contacts-sheet-helpers';
import {
  loadPeopleTargetResolutionCache,
  savePeopleTargetResolutionsToCache,
} from '@/features/home/people-target-resolution-cache';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import { type PeopleTargetResolution, useResolvePeopleTargetsMutation } from '@/lib/live-data';

type ResolutionPriority = 'visible' | 'background';

export function useAddPersonContactResolutionController(input: {
  readonly busyKey: string | null;
  readonly setBusyKey: Dispatch<SetStateAction<string | null>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
  readonly userId: string | null;
}) {
  const resolvePeopleTargets = useResolvePeopleTargetsMutation();
  const [targetCache, setTargetCache] = useState<Record<string, PeopleTargetResolution>>({});
  const scanRunIdRef = useRef(0);
  const targetCacheRef = useRef<Record<string, PeopleTargetResolution>>({});
  const pendingResolutionQueueRef = useRef<string[]>([]);
  const pendingResolutionSetRef = useRef(new Set<string>());
  const inFlightResolutionSetRef = useRef(new Set<string>());
  const visibleResolutionPhonesRef = useRef(new Set<string>());
  const resolutionPumpRunningRef = useRef(false);
  const resolvePeopleTargetsMutateRef = useRef(resolvePeopleTargets.mutateAsync);

  const mergeTargetResolutions = useCallback(
    (resolutions: readonly PeopleTargetResolution[]) => {
      if (resolutions.length === 0) {
        return;
      }

      const next = { ...targetCacheRef.current };
      for (const resolution of resolutions) {
        next[resolution.phoneE164] = resolution;
      }

      targetCacheRef.current = next;
      setTargetCache(next);
      updateWarmContactScanTargetCache(input.userId, next);
    },
    [input.userId],
  );

  const persistTargetResolutions = useCallback(
    (resolutions: readonly PeopleTargetResolution[]) => {
      if (!input.userId || resolutions.length === 0) {
        return;
      }

      void savePeopleTargetResolutionsToCache(input.userId, resolutions).catch(() => undefined);
    },
    [input.userId],
  );

  const mergeAndPersistTargetResolutions = useCallback(
    (resolutions: readonly PeopleTargetResolution[]) => {
      mergeTargetResolutions(resolutions);
      persistTargetResolutions(resolutions);
    },
    [mergeTargetResolutions, persistTargetResolutions],
  );

  useEffect(() => {
    resolvePeopleTargetsMutateRef.current = resolvePeopleTargets.mutateAsync;
  }, [resolvePeopleTargets.mutateAsync]);

  const pumpResolutionQueue = useCallback(
    () =>
      pumpAddPersonResolutionQueue({
        inFlightResolutionSetRef,
        mergeAndPersistTargetResolutions,
        pendingResolutionQueueRef,
        pendingResolutionSetRef,
        resolutionPumpRunningRef,
        resolvePeopleTargetsMutateRef,
        scanRunIdRef,
        setMessage: input.setMessage,
        targetCacheRef,
        visibleResolutionPhonesRef,
      }),
    [input.setMessage, mergeAndPersistTargetResolutions],
  );

  const enqueueResolutionPhones = useCallback(
    (phoneE164List: readonly string[], priority: ResolutionPriority) => {
      const missingPhones = getUnresolvedContactPhoneE164List({
        inFlightPhoneE164Set: inFlightResolutionSetRef.current,
        pendingPhoneE164Set: pendingResolutionSetRef.current,
        phoneE164List,
        targetCache: targetCacheRef.current,
      });

      if (missingPhones.length === 0) {
        return;
      }

      for (const phoneE164 of missingPhones) {
        pendingResolutionSetRef.current.add(phoneE164);
      }

      if (priority === 'visible') {
        pendingResolutionQueueRef.current = [
          ...missingPhones,
          ...pendingResolutionQueueRef.current,
        ];
      } else {
        pendingResolutionQueueRef.current.push(...missingPhones);
      }

      void pumpResolutionQueue();
    },
    [pumpResolutionQueue],
  );

  const loadCachedTargetResolutionsForPhones = useCallback(
    async (runId: number, phoneE164List: readonly string[]) => {
      if (!input.userId || phoneE164List.length === 0) {
        return;
      }

      try {
        const cachedResolutions = await loadPeopleTargetResolutionCache(
          input.userId,
          phoneE164List,
        );
        if (scanRunIdRef.current !== runId) {
          return;
        }

        mergeTargetResolutions(Object.values(cachedResolutions));
      } catch {
        // Persistent cache is an optimization. Contact loading should continue without it.
      }
    },
    [input.userId, mergeTargetResolutions],
  );

  const hydrateAndEnqueueResolutionPhones = useCallback(
    (runId: number, phoneE164List: readonly string[], priority: ResolutionPriority) => {
      if (phoneE164List.length === 0) {
        return;
      }

      const unresolvedPhones = getUnresolvedContactPhoneE164List({
        inFlightPhoneE164Set: inFlightResolutionSetRef.current,
        pendingPhoneE164Set: pendingResolutionSetRef.current,
        phoneE164List,
        targetCache: targetCacheRef.current,
      });
      if (unresolvedPhones.length === 0) {
        return;
      }

      void loadCachedTargetResolutionsForPhones(runId, unresolvedPhones).finally(() => {
        if (scanRunIdRef.current === runId) {
          enqueueResolutionPhones(unresolvedPhones, priority);
        }
      });
    },
    [enqueueResolutionPhones, loadCachedTargetResolutionsForPhones],
  );

  const ensurePhoneStatuses = useCallback(
    async (phoneE164List: readonly string[]) => {
      const cachedResolutions = await loadPeopleTargetResolutionCache(input.userId, phoneE164List);
      mergeTargetResolutions(Object.values(cachedResolutions));

      const missingPhones = getUnresolvedContactPhoneE164List({
        inFlightPhoneE164Set: inFlightResolutionSetRef.current,
        pendingPhoneE164Set: pendingResolutionSetRef.current,
        phoneE164List,
        targetCache: targetCacheRef.current,
      });
      if (missingPhones.length === 0) {
        return;
      }

      for (const phoneE164 of missingPhones) {
        visibleResolutionPhonesRef.current.add(phoneE164);
      }
      enqueueResolutionPhones(missingPhones, 'visible');

      const waitUntil = Date.now() + 6_000;
      while (
        Date.now() < waitUntil &&
        missingPhones.some(
          (phoneE164) =>
            !targetCacheRef.current[phoneE164] &&
            (pendingResolutionSetRef.current.has(phoneE164) ||
              inFlightResolutionSetRef.current.has(phoneE164)),
        )
      ) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    },
    [enqueueResolutionPhones, input.userId, mergeTargetResolutions],
  );

  const resolvePhoneStatusesNow = useCallback(
    async (phoneE164List: readonly string[]): Promise<readonly PeopleTargetResolution[]> => {
      const uniquePhones = [...new Set(phoneE164List)].slice(0, 60);
      if (uniquePhones.length === 0) {
        return [];
      }

      const resolutions = await resolvePeopleTargets.mutateAsync(uniquePhones);
      mergeAndPersistTargetResolutions(resolutions);
      return resolutions;
    },
    [mergeAndPersistTargetResolutions, resolvePeopleTargets.mutateAsync],
  );

  const forceResolvePhones = useCallback(
    async (forceInput: { readonly busyKey: string; readonly phoneE164List: readonly string[] }) => {
      if (input.busyKey || forceInput.phoneE164List.length === 0) {
        return;
      }

      const uniquePhones = [...new Set(forceInput.phoneE164List)].slice(0, 60);
      input.setBusyKey(forceInput.busyKey);
      input.setMessage('Consultando este contacto en Happy Circles.');

      try {
        const resolutions = await resolvePeopleTargets.mutateAsync(uniquePhones);
        mergeAndPersistTargetResolutions(resolutions);
        input.setMessage('Contacto consultado.');
      } catch (error) {
        input.setMessage(
          error instanceof Error ? error.message : 'No se pudo revisar este contacto.',
        );
      } finally {
        input.setBusyKey(null);
      }
    },
    [
      input.busyKey,
      input.setBusyKey,
      input.setMessage,
      mergeAndPersistTargetResolutions,
      resolvePeopleTargets.mutateAsync,
    ],
  );

  const handleReviewContact = useCallback(
    async (contact: ContactCandidate) => {
      await forceResolvePhones({
        busyKey: contact.primaryPhone.phoneE164,
        phoneE164List: uniqueContactPhoneE164List([contact]),
      });
    },
    [forceResolvePhones],
  );

  const handleReviewPhone = useCallback(
    async (reviewInput: { readonly phoneE164: string }) => {
      await forceResolvePhones({
        busyKey: reviewInput.phoneE164,
        phoneE164List: [reviewInput.phoneE164],
      });
    },
    [forceResolvePhones],
  );

  const resetResolutionState = useCallback(() => {
    scanRunIdRef.current += 1;
    pendingResolutionQueueRef.current = [];
    pendingResolutionSetRef.current.clear();
    inFlightResolutionSetRef.current.clear();
    visibleResolutionPhonesRef.current.clear();
  }, []);

  return {
    ensurePhoneStatuses,
    handleReviewContact,
    handleReviewPhone,
    hydrateAndEnqueueResolutionPhones,
    loadCachedTargetResolutionsForPhones,
    mergeAndPersistTargetResolutions,
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
