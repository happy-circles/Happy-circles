import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { pumpAddPersonResolutionQueue } from '@/features/home/add-person-contact-resolution-queue';
import { updateWarmContactScanTargetCache } from '@/features/home/add-person-contact-scan-cache';
import { runAddPersonContactScan } from '@/features/home/add-person-contact-scan-runner';
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
  savePeopleTargetResolutionsToCache,
} from '@/features/home/people-target-resolution-cache';
import {
  canReadContactsPermissionStatus,
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

  const loadContacts = useCallback(async () => {
    await runAddPersonContactScan({
      contactsRef,
      hydrateAndEnqueueResolutionPhones,
      inFlightResolutionSetRef,
      pendingResolutionQueueRef,
      pendingResolutionSetRef,
      scanRunIdRef,
      setBusyKey,
      setContacts,
      setContactsLoadedCount,
      setContactsLoading,
      setContactsPermissionStatus,
      setContactsScanComplete,
      setMessage,
      setTargetCache,
      targetCacheRef,
      userId: session.userId,
      visibleResolutionPhonesRef,
    });
  }, [hydrateAndEnqueueResolutionPhones, session.userId]);

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
    hydrateAndEnqueueResolutionPhones(scanRunIdRef.current, visiblePhones, 'visible');
  }, [canReadContacts, contactResolutionWindow, hydrateAndEnqueueResolutionPhones, visible]);

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
