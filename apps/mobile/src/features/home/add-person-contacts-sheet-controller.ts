import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { pumpAddPersonResolutionQueue } from '@/features/home/add-person-contact-resolution-queue';
import {
  type ContactIndexReadResult,
  readContactIndex,
  startContactIndexing,
} from '@/features/home/add-person-contact-index';
import { useAddPersonContactIndexRefresh } from '@/features/home/add-person-contact-index-refresh';
import { useAddPersonContactPermissionActions } from '@/features/home/add-person-contact-permissions';
import { useAddPersonOutreachActions } from '@/features/home/add-person-outreach-actions';
import { useAddPersonQrActions } from '@/features/home/add-person-qr-actions';
import { useAddPersonContactReadWindow } from '@/features/home/add-person-contact-read-window';
import { useAddPersonContactResolutionEffects } from '@/features/home/add-person-contact-resolution-effects';
import {
  readWarmContactScanCache,
  updateWarmContactScanTargetCache,
  writeWarmContactScanCache,
} from '@/features/home/add-person-contact-scan-cache';
import {
  buildContactSectionItems,
  getUnresolvedContactPhoneE164List,
  uniqueContactPhoneE164List,
  type AddPersonTransactionContext,
} from '@/features/home/contacts-sheet-helpers';
import {
  loadPeopleTargetResolutionCache,
  savePeopleTargetResolutionsToCache,
} from '@/features/home/people-target-resolution-cache';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
  type ContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  type PeopleTargetResolution,
  useCreateExternalFriendshipInviteMutation,
  useCreatePeopleOutreachMutation,
  useResolvePeopleTargetsMutation,
} from '@/lib/live-data';
import { useSession } from '@/providers/session-provider';
import { type ContactCandidate } from '@/features/invites/people-outreach-utils';

export function useAddPersonContactsSheetController({
  initialSearchValue,
  onClose,
  transactionContext,
  visible,
}: {
  readonly initialSearchValue?: string | null;
  readonly onClose: () => void;
  readonly transactionContext?: AddPersonTransactionContext | null;
  readonly visible: boolean;
}) {
  const router = useRouter();
  const session = useSession();
  const createExternalFriendshipInvite = useCreateExternalFriendshipInviteMutation();
  const createPeopleOutreach = useCreatePeopleOutreachMutation();
  const resolvePeopleTargets = useResolvePeopleTargetsMutation();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [contactsPermissionStatus, setContactsPermissionStatus] =
    useState<ContactsPermissionStatus>('undetermined');
  const [contacts, setContacts] = useState<readonly ContactCandidate[]>([]);
  const [targetCache, setTargetCache] = useState<Record<string, PeopleTargetResolution>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsScanComplete, setContactsScanComplete] = useState(false);
  const [contactsLoadedCount, setContactsLoadedCount] = useState(0);
  const scanRunIdRef = useRef(0);
  const indexReadVersionRef = useRef(0);
  const refreshContactIndexRef = useRef<() => Promise<ContactIndexReadResult | null>>(
    async () => null,
  );
  const targetCacheRef = useRef<Record<string, PeopleTargetResolution>>({});
  const pendingResolutionQueueRef = useRef<string[]>([]);
  const pendingResolutionSetRef = useRef(new Set<string>());
  const inFlightResolutionSetRef = useRef(new Set<string>());
  const visibleResolutionPhonesRef = useRef(new Set<string>());
  const resolutionPumpRunningRef = useRef(false);
  const resolvePeopleTargetsMutateRef = useRef(resolvePeopleTargets.mutateAsync);

  const canReadContacts = canReadContactsPermissionStatus(contactsPermissionStatus);

  const contactSections = useMemo(
    () => buildContactSectionItems({ contacts, searchValue, targetCache }),
    [contacts, searchValue, targetCache],
  );
  const contactResolutionWindow = contactSections.visibleResolutionContacts;
  const inAppContacts = contactSections.inAppContacts;
  const unresolvedContacts = contactSections.unresolvedContacts;
  const inviteContacts = contactSections.inviteContacts;
  const {
    contactsReadLimit,
    hasMoreContactsToDisplay,
    requestMoreContacts,
    resetContactReadLimit,
    setContactsMatchingCount,
  } = useAddPersonContactReadWindow(contacts.length);

  const {
    handleBarcodeScanned,
    handleOpenScanner,
    handleRefreshMyQr,
    handleShareMyQr,
    handleShowMyQr,
    myQrDelivery,
    myQrLink,
    myQrMessage,
    myQrVisible,
    resetQrStateOnClose,
    scannerMessage,
    scannerOpen,
    setMyQrVisible,
    setScannerOpen,
  } = useAddPersonQrActions({
    cameraPermission,
    createExternalFriendshipInvite,
    onClose,
    requestCameraPermission,
    router,
    setBusyKey,
    setMessage,
  });

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
      updateWarmContactScanTargetCache(session.userId, next);
    },
    [session.userId],
  );

  const persistTargetResolutions = useCallback(
    (resolutions: readonly PeopleTargetResolution[]) => {
      if (!session.userId || resolutions.length === 0) {
        return;
      }

      void savePeopleTargetResolutionsToCache(session.userId, resolutions).catch(() => undefined);
    },
    [session.userId],
  );

  const mergeAndPersistTargetResolutions = useCallback(
    (resolutions: readonly PeopleTargetResolution[]) => {
      mergeTargetResolutions(resolutions);
      persistTargetResolutions(resolutions);
    },
    [mergeTargetResolutions, persistTargetResolutions],
  );

  const {
    contactActionFeedback,
    handleContactPress,
    handleCreateOutreach,
    pendingContactOptions,
    pendingContactSelection,
    resetPendingContactSelection,
    setPendingContactSelection,
  } = useAddPersonOutreachActions({
    busyKey,
    createPeopleOutreach,
    ensurePhoneStatuses,
    mergeAndPersistTargetResolutions,
    resolvePhoneStatusesNow,
    router,
    setBusyKey,
    setMessage,
    targetCache,
    transactionContext,
  });

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
        setMessage,
        targetCacheRef,
        visibleResolutionPhonesRef,
      }),
    [mergeAndPersistTargetResolutions],
  );

  const enqueueResolutionPhones = useCallback(
    (phoneE164List: readonly string[], priority: 'visible' | 'background') => {
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
      if (!session.userId || phoneE164List.length === 0) {
        return;
      }

      try {
        const cachedResolutions = await loadPeopleTargetResolutionCache(
          session.userId,
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
    [mergeTargetResolutions, session.userId],
  );

  const hydrateAndEnqueueResolutionPhones = useCallback(
    (runId: number, phoneE164List: readonly string[], priority: 'visible' | 'background') => {
      if (phoneE164List.length === 0) {
        return;
      }

      void loadCachedTargetResolutionsForPhones(runId, phoneE164List).finally(() => {
        if (scanRunIdRef.current === runId) {
          enqueueResolutionPhones(phoneE164List, priority);
        }
      });
    },
    [enqueueResolutionPhones, loadCachedTargetResolutionsForPhones],
  );

  const writeWarmContactSnapshot = useCallback(
    (input: {
      readonly contacts: readonly ContactCandidate[];
      readonly permissionStatus: ContactsPermissionStatus;
    }) => {
      if (
        !session.userId ||
        input.contacts.length === 0 ||
        !canReadContactsPermissionStatus(input.permissionStatus) ||
        searchValue.trim().length > 0
      ) {
        return;
      }

      writeWarmContactScanCache({
        contacts: input.contacts,
        contactsPermissionStatus: input.permissionStatus,
        targetCache: targetCacheRef.current,
        userId: session.userId,
      });
    },
    [searchValue, session.userId],
  );

  const applyWarmContactSnapshot = useCallback(
    (permissionStatus: ContactsPermissionStatus) => {
      if (
        !session.userId ||
        !canReadContactsPermissionStatus(permissionStatus) ||
        searchValue.trim().length > 0
      ) {
        return false;
      }

      const warmCache = readWarmContactScanCache(session.userId);
      if (!warmCache || warmCache.contacts.length === 0) {
        return false;
      }

      targetCacheRef.current = warmCache.targetCache;
      setTargetCache(warmCache.targetCache);
      setContacts(warmCache.contacts);
      setContactsLoadedCount(warmCache.contacts.length);
      setContactsMatchingCount(warmCache.contacts.length);
      setContactsLoading(false);
      setContactsScanComplete(true);
      setContactsPermissionStatus(warmCache.contactsPermissionStatus);
      return true;
    },
    [searchValue, session.userId, setContactsMatchingCount],
  );

  const refreshContactIndex = useCallback(async () => {
    const readVersion = indexReadVersionRef.current + 1;
    indexReadVersionRef.current = readVersion;

    if (!session.userId) {
      setContacts([]);
      setContactsLoadedCount(0);
      setContactsMatchingCount(0);
      setContactsLoading(false);
      setContactsScanComplete(false);
      return null;
    }

    const result = await readContactIndex({
      limit: contactsReadLimit,
      searchValue,
      userId: session.userId,
    });

    if (indexReadVersionRef.current !== readVersion) {
      return null;
    }

    const indexedPhones = uniqueContactPhoneE164List(result.contacts);
    let cachedResolutions: Record<string, PeopleTargetResolution> = {};
    try {
      cachedResolutions = await loadPeopleTargetResolutionCache(session.userId, indexedPhones);
    } catch {
      cachedResolutions = {};
    }

    if (indexReadVersionRef.current !== readVersion) {
      return null;
    }

    mergeTargetResolutions(Object.values(cachedResolutions));

    setContacts(result.contacts);
    setContactsLoadedCount(result.loadedCount);
    setContactsMatchingCount(result.matchingCount);
    setContactsLoading(result.status === 'indexing');
    setContactsScanComplete(result.status === 'ready');
    setContactsPermissionStatus((current) =>
      result.permissionStatus === 'undetermined' && canReadContactsPermissionStatus(current)
        ? current
        : result.permissionStatus,
    );
    writeWarmContactSnapshot({
      contacts: result.contacts,
      permissionStatus: result.permissionStatus,
    });

    return result;
  }, [
    contactsReadLimit,
    mergeTargetResolutions,
    searchValue,
    session.userId,
    setContactsMatchingCount,
    writeWarmContactSnapshot,
  ]);

  useEffect(() => {
    refreshContactIndexRef.current = refreshContactIndex;
  }, [refreshContactIndex]);

  const loadContacts = useCallback(async () => {
    if (!session.userId) {
      setContacts([]);
      setContactsLoadedCount(0);
      setContactsMatchingCount(0);
      setContactsLoading(false);
      setContactsScanComplete(false);
      return;
    }

    try {
      const permissionStatus = await getContactsPermissionStatus();
      setContactsPermissionStatus(permissionStatus);

      if (!canReadContactsPermissionStatus(permissionStatus)) {
        setContacts([]);
        setContactsLoadedCount(0);
        setContactsMatchingCount(0);
        setContactsLoading(false);
        setContactsScanComplete(true);
        return;
      }

      const usedWarmSnapshot = applyWarmContactSnapshot(permissionStatus);
      const cachedResult = await refreshContactIndexRef.current();
      setContactsLoading(
        cachedResult
          ? cachedResult.status === 'indexing' ||
              (cachedResult.status !== 'ready' && cachedResult.contacts.length === 0)
          : !usedWarmSnapshot,
      );
      void startContactIndexing({
        permissionStatus,
        reason: 'sheet_open',
        userId: session.userId,
      }).catch(() => undefined);
    } catch (error) {
      setContactsLoading(false);
      setMessage(error instanceof Error ? error.message : 'No se pudo leer la agenda.');
    }
  }, [applyWarmContactSnapshot, session.userId, setContactsMatchingCount]);

  const { handleExpandLimitedContactsAccess, requestContactsAccess } =
    useAddPersonContactPermissionActions({
      busyKey,
      contactsPermissionStatus,
      loadContacts,
      setBusyKey,
      setContacts,
      setContactsPermissionStatus,
      setMessage,
    });

  async function handleRefreshContacts() {
    if (busyKey || !session.userId) {
      return;
    }

    setBusyKey('refresh-contacts');
    setMessage('Actualizando agenda. Mantendremos lo que ya estaba consultado.');

    try {
      const permissionStatus = await getContactsPermissionStatus();
      setContactsPermissionStatus(permissionStatus);

      if (!canReadContactsPermissionStatus(permissionStatus)) {
        setContacts([]);
        setContactsLoadedCount(0);
        setContactsMatchingCount(0);
        setContactsLoading(false);
        setContactsScanComplete(true);
        setMessage('Necesitamos acceso a contactos para actualizar la agenda.');
        return;
      }

      resetContactReadLimit();
      setContactsLoading(true);
      await startContactIndexing({
        permissionStatus,
        reason: 'manual_refresh',
        userId: session.userId,
      });
      await refreshContactIndexRef.current();
      setMessage('Agenda actualizándose en segundo plano.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la agenda.');
    } finally {
      setBusyKey(null);
    }
  }

  useAddPersonContactIndexRefresh({
    contactsReadLimit,
    refreshContactIndexRef,
    searchValue,
    userId: session.userId,
    visible,
  });

  useEffect(() => {
    if (!visible) {
      scanRunIdRef.current += 1;
      pendingResolutionQueueRef.current = [];
      pendingResolutionSetRef.current.clear();
      inFlightResolutionSetRef.current.clear();
      visibleResolutionPhonesRef.current.clear();
      setContactsLoading(false);
      resetQrStateOnClose();
      resetPendingContactSelection();
      return;
    }

    setMessage(null);
    resetContactReadLimit();
    setSearchValue(initialSearchValue?.trim() ?? '');
    void loadContacts();
  }, [
    initialSearchValue,
    loadContacts,
    resetContactReadLimit,
    resetPendingContactSelection,
    resetQrStateOnClose,
    visible,
  ]);

  useAddPersonContactResolutionEffects({
    canReadContacts,
    contactResolutionWindow,
    contacts,
    hydrateAndEnqueueResolutionPhones,
    scanRunIdRef,
    searchValue,
    visible,
    visibleResolutionPhonesRef,
  });

  async function ensurePhoneStatuses(phoneE164List: readonly string[]) {
    const cachedResolutions = await loadPeopleTargetResolutionCache(session.userId, phoneE164List);
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
  }

  async function resolvePhoneStatusesNow(
    phoneE164List: readonly string[],
  ): Promise<readonly PeopleTargetResolution[]> {
    const uniquePhones = [...new Set(phoneE164List)].slice(0, 60);
    if (uniquePhones.length === 0) {
      return [];
    }

    const resolutions = await resolvePeopleTargets.mutateAsync(uniquePhones);
    mergeAndPersistTargetResolutions(resolutions);
    return resolutions;
  }

  async function forceResolvePhones(input: {
    readonly busyKey: string;
    readonly phoneE164List: readonly string[];
  }) {
    if (busyKey || input.phoneE164List.length === 0) {
      return;
    }

    const uniquePhones = [...new Set(input.phoneE164List)].slice(0, 60);
    setBusyKey(input.busyKey);
    setMessage('Consultando este contacto en Happy Circles.');

    try {
      const resolutions = await resolvePeopleTargets.mutateAsync(uniquePhones);
      mergeAndPersistTargetResolutions(resolutions);
      setMessage('Contacto consultado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo revisar este contacto.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleReviewContact(contact: ContactCandidate) {
    await forceResolvePhones({
      busyKey: contact.primaryPhone.phoneE164,
      phoneE164List: uniqueContactPhoneE164List([contact]),
    });
  }

  async function handleReviewPhone(input: { readonly phoneE164: string }) {
    await forceResolvePhones({
      busyKey: input.phoneE164,
      phoneE164List: [input.phoneE164],
    });
  }

  return {
    busyKey,
    canReadContacts,
    contactActionFeedback,
    contactsLoadedCount,
    contactsLoading,
    contactsPermissionStatus,
    contactsScanComplete,
    handleBarcodeScanned,
    handleContactPress,
    handleCreateOutreach,
    handleExpandLimitedContactsAccess,
    handleOpenScanner,
    handleRefreshMyQr,
    handleRefreshContacts,
    handleReviewContact,
    handleReviewPhone,
    handleShareMyQr,
    handleShowMyQr,
    hasMoreContactsToDisplay,
    inAppContacts,
    inviteContacts,
    message,
    myQrDelivery,
    myQrLink,
    myQrMessage,
    myQrVisible,
    pendingContactOptions,
    pendingContactSelection,
    requestContactsAccess,
    requestMoreContacts,
    scannerMessage,
    scannerOpen,
    searchValue,
    setMyQrVisible,
    setPendingContactSelection,
    setScannerOpen,
    setSearchValue,
    unresolvedContacts,
  };
}
