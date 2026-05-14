import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';

import { pumpAddPersonResolutionQueue } from '@/features/home/add-person-contact-resolution-queue';
import {
  clearWarmContactScanCache,
  readWarmContactScanCache,
  updateWarmContactScanTargetCache,
  writeWarmContactScanCache,
  type WarmContactScanCache,
} from '@/features/home/add-person-contact-scan-cache';
import { useAddPersonContactPermissionActions } from '@/features/home/add-person-contact-permissions';
import { useAddPersonOutreachActions } from '@/features/home/add-person-outreach-actions';
import { useAddPersonQrActions } from '@/features/home/add-person-qr-actions';
import {
  buildContactSectionItems,
  getUnresolvedContactPhoneE164List,
  uniqueContactPhoneE164List,
  type AddPersonTransactionContext,
} from '@/features/home/contacts-sheet-helpers';
import {
  loadPeopleTargetResolutionCache,
  pruneExpiredPeopleTargetResolutionCache,
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
import {
  CONTACTS_PAGE_SIZE,
  type ContactCandidate,
  readContactsPageFromDevice,
} from '@/features/invites/people-outreach-utils';

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
  const contactsRef = useRef<readonly ContactCandidate[]>([]);
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
  const inviteContacts = contactSections.inviteContacts;
  const displayedContactsCount = inAppContacts.length + inviteContacts.length;

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
      updateWarmContactScanTargetCache(session.userId, next);
      setTargetCache(next);
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

  async function loadCachedTargetResolutionsForPhones(
    runId: number,
    phoneE164List: readonly string[],
  ) {
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
  }

  function resetContactScan(runId: number, warmCache: WarmContactScanCache | null = null) {
    scanRunIdRef.current = runId;
    pendingResolutionQueueRef.current = [];
    pendingResolutionSetRef.current.clear();
    inFlightResolutionSetRef.current.clear();
    visibleResolutionPhonesRef.current.clear();
    const nextContacts = warmCache?.contacts ?? [];
    const nextTargetCache = warmCache?.targetCache ?? {};

    contactsRef.current = nextContacts;
    targetCacheRef.current = nextTargetCache;
    setContacts(nextContacts);
    setTargetCache(nextTargetCache);
    setContactsLoadedCount(nextContacts.length);
    setContactsLoading(false);
    setContactsScanComplete(Boolean(warmCache));

    if (warmCache) {
      setContactsPermissionStatus(warmCache.contactsPermissionStatus);
    }
  }

  const loadContacts = useCallback(async () => {
    const runId = scanRunIdRef.current + 1;
    const warmCache = readWarmContactScanCache(session.userId);
    const hasWarmContacts = Boolean(
      warmCache &&
      canReadContactsPermissionStatus(warmCache.contactsPermissionStatus) &&
      warmCache.contacts.length > 0,
    );

    resetContactScan(runId, warmCache);

    if (Platform.OS === 'web') {
      setContactsPermissionStatus('unavailable');
      contactsRef.current = [];
      setContacts([]);
      setContactsScanComplete(true);
      return;
    }

    if (!hasWarmContacts) {
      setBusyKey('load-contacts');
      setContactsLoading(true);
    }

    try {
      const nextStatus = await getContactsPermissionStatus();
      if (scanRunIdRef.current !== runId) {
        return;
      }

      setContactsPermissionStatus(nextStatus);

      if (!canReadContactsPermissionStatus(nextStatus)) {
        contactsRef.current = [];
        targetCacheRef.current = {};
        clearWarmContactScanCache(session.userId);
        setContacts([]);
        setTargetCache({});
        setContactsLoadedCount(0);
        setContactsScanComplete(true);
        return;
      }

      void pruneExpiredPeopleTargetResolutionCache(session.userId).catch(() => undefined);

      let pageOffset = 0;
      let hasNextPage = true;
      let loadedCount = 0;
      let isFirstPage = true;
      const refreshedContacts: ContactCandidate[] = [];
      const refreshedContactIds = new Set<string>();

      while (hasNextPage && scanRunIdRef.current === runId) {
        const page = await readContactsPageFromDevice({
          pageOffset,
          pageSize: CONTACTS_PAGE_SIZE,
        });
        if (scanRunIdRef.current !== runId) {
          return;
        }

        if (page.contacts.length > 0) {
          if (hasWarmContacts) {
            for (const contact of page.contacts) {
              if (!refreshedContactIds.has(contact.contactId)) {
                refreshedContactIds.add(contact.contactId);
                refreshedContacts.push(contact);
              }
            }
          } else {
            setContacts((current) => {
              const existingContactIds = new Set(current.map((contact) => contact.contactId));
              const nextContacts = [...current];
              for (const contact of page.contacts) {
                if (!existingContactIds.has(contact.contactId)) {
                  existingContactIds.add(contact.contactId);
                  nextContacts.push(contact);
                }
              }

              contactsRef.current = nextContacts;
              return nextContacts;
            });

            loadedCount += page.contacts.length;
            setContactsLoadedCount(loadedCount);
          }

          const pagePhones = uniqueContactPhoneE164List(page.contacts);
          await loadCachedTargetResolutionsForPhones(runId, pagePhones);
          if (scanRunIdRef.current !== runId) {
            return;
          }

          enqueueResolutionPhones(pagePhones, 'background');
        }

        if (isFirstPage) {
          setBusyKey((current) => (current === 'load-contacts' ? null : current));
          isFirstPage = false;
        }

        pageOffset = page.nextPageOffset;
        hasNextPage = page.hasNextPage;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      if (scanRunIdRef.current === runId) {
        if (hasWarmContacts) {
          contactsRef.current = refreshedContacts;
          setContacts(refreshedContacts);
          setContactsLoadedCount(refreshedContacts.length);
        }

        setContactsScanComplete(true);
        writeWarmContactScanCache({
          contacts: contactsRef.current,
          contactsPermissionStatus: nextStatus,
          targetCache: targetCacheRef.current,
          userId: session.userId ?? null,
        });
      }
    } catch (error) {
      if (scanRunIdRef.current === runId) {
        setMessage(error instanceof Error ? error.message : 'No se pudo leer la agenda.');
      }
    } finally {
      if (scanRunIdRef.current === runId) {
        setContactsLoading(false);
        setBusyKey((current) => (current === 'load-contacts' ? null : current));
      }
    }
  }, [enqueueResolutionPhones, mergeTargetResolutions, session.userId]);

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
    setSearchValue(initialSearchValue?.trim() ?? '');
    void loadContacts();
  }, [
    initialSearchValue,
    loadContacts,
    resetPendingContactSelection,
    resetQrStateOnClose,
    visible,
  ]);

  useEffect(() => {
    if (!visible || !canReadContacts || contactResolutionWindow.length === 0) {
      visibleResolutionPhonesRef.current = new Set();
      return;
    }

    const visiblePhones = uniqueContactPhoneE164List(contactResolutionWindow);
    visibleResolutionPhonesRef.current = new Set(visiblePhones);
    enqueueResolutionPhones(visiblePhones, 'visible');
  }, [canReadContacts, contactResolutionWindow, enqueueResolutionPhones, visible]);

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

  return {
    busyKey,
    canReadContacts,
    contactsLoadedCount,
    contactsLoading,
    contactsPermissionStatus,
    contactsScanComplete,
    displayedContactsCount,
    handleBarcodeScanned,
    handleContactPress,
    handleCreateOutreach,
    handleExpandLimitedContactsAccess,
    handleOpenScanner,
    handleRefreshMyQr,
    handleShareMyQr,
    handleShowMyQr,
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
    scannerMessage,
    scannerOpen,
    searchValue,
    setMyQrVisible,
    setPendingContactSelection,
    setScannerOpen,
    setSearchValue,
  };
}
