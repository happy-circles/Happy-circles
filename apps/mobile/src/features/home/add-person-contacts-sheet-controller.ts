import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import {
  type ContactIndexReadResult,
  readContactIndex,
  startContactIndexing,
} from '@/features/home/add-person-contact-index';
import { mergeUniqueContactCandidates } from '@/features/home/add-person-contact-candidates';
import { useAddPersonContactIndexRefresh } from '@/features/home/add-person-contact-index-refresh';
import { useAddPersonContactPermissionActions } from '@/features/home/add-person-contact-permissions';
import { useAddPersonContactResolutionController } from '@/features/home/add-person-contact-resolution-controller';
import { useAddPersonOutreachActions } from '@/features/home/add-person-outreach-actions';
import { useAddPersonQrActions } from '@/features/home/add-person-qr-actions';
import { useAddPersonContactReadWindow } from '@/features/home/add-person-contact-read-window';
import { useAddPersonContactResolutionEffects } from '@/features/home/add-person-contact-resolution-effects';
import {
  readWarmContactScanCache,
  writeWarmContactScanCache,
} from '@/features/home/add-person-contact-scan-cache';
import {
  bestResolutionForContact,
  buildContactSectionItems,
  CONTACT_INDEX_IN_APP_BACKFILL_READ_LIMIT,
  shouldShowInApp,
  uniqueContactPhoneE164List,
  type AddPersonTransactionContext,
} from '@/features/home/contacts-sheet-helpers';
import { loadPeopleTargetResolutionCache } from '@/features/home/people-target-resolution-cache';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
  type ContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  type PeopleTargetResolution,
  useCreateExternalFriendshipInviteMutation,
  useCreatePeopleOutreachMutation,
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [contactsPermissionStatus, setContactsPermissionStatus] =
    useState<ContactsPermissionStatus>('undetermined');
  const [contacts, setContacts] = useState<readonly ContactCandidate[]>([]);
  const [inAppBackfillContacts, setInAppBackfillContacts] = useState<readonly ContactCandidate[]>(
    [],
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsScanComplete, setContactsScanComplete] = useState(false);
  const [contactsLoadedCount, setContactsLoadedCount] = useState(0);
  const indexReadVersionRef = useRef(0);
  const refreshContactIndexRef = useRef<() => Promise<ContactIndexReadResult | null>>(
    async () => null,
  );
  const {
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
  } = useAddPersonContactResolutionController({
    busyKey,
    setBusyKey,
    setMessage,
    userId: session.userId,
  });

  const canReadContacts = canReadContactsPermissionStatus(contactsPermissionStatus);

  const inAppBackfillContactsWithResolution = useMemo(
    () =>
      inAppBackfillContacts.filter((contact) =>
        shouldShowInApp(bestResolutionForContact(contact, targetCache)),
      ),
    [inAppBackfillContacts, targetCache],
  );
  const sectionContacts = useMemo(
    () => mergeUniqueContactCandidates(contacts, inAppBackfillContactsWithResolution),
    [contacts, inAppBackfillContactsWithResolution],
  );
  const contactSections = useMemo(
    () => buildContactSectionItems({ contacts: sectionContacts, searchValue, targetCache }),
    [sectionContacts, searchValue, targetCache],
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

  const writeWarmContactSnapshot = useCallback(
    (input: {
      readonly contacts: readonly ContactCandidate[];
      readonly permissionStatus: ContactsPermissionStatus;
    }) => {
      if (
        !session.userId ||
        input.contacts.length === 0 ||
        !canReadContactsPermissionStatus(input.permissionStatus)
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
    [session.userId],
  );

  const applyWarmContactSnapshot = useCallback(
    (permissionStatus: ContactsPermissionStatus) => {
      if (!session.userId || !canReadContactsPermissionStatus(permissionStatus)) {
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
    [session.userId, setContactsMatchingCount],
  );

  const refreshInAppBackfillContacts = useCallback(
    async (readVersion: number) => {
      if (!session.userId || searchValue.trim().length > 0) {
        return;
      }

      try {
        const result = await readContactIndex({
          limit: CONTACT_INDEX_IN_APP_BACKFILL_READ_LIMIT,
          searchValue: '',
          userId: session.userId,
        });
        if (indexReadVersionRef.current !== readVersion) {
          return;
        }

        setInAppBackfillContacts(result.contacts);
        const indexedPhones = uniqueContactPhoneE164List(result.contacts);
        if (indexedPhones.length === 0) {
          return;
        }

        await loadCachedTargetResolutionsForPhones(scanRunIdRef.current, indexedPhones);
        if (indexReadVersionRef.current === readVersion) {
          hydrateAndEnqueueResolutionPhones(scanRunIdRef.current, indexedPhones, 'background');
        }
      } catch {
        // Backfill only improves ranking of known HC contacts. The visible list can continue.
      }
    },
    [
      hydrateAndEnqueueResolutionPhones,
      loadCachedTargetResolutionsForPhones,
      searchValue,
      session.userId,
    ],
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
    if (searchValue.trim().length === 0) {
      writeWarmContactSnapshot({
        contacts: result.contacts,
        permissionStatus: result.permissionStatus,
      });
      if (result.status === 'ready') {
        void refreshInAppBackfillContacts(readVersion);
      }
    }

    return result;
  }, [
    contactsReadLimit,
    mergeTargetResolutions,
    refreshInAppBackfillContacts,
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
      setInAppBackfillContacts([]);
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
        setInAppBackfillContacts([]);
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
      resetResolutionState();
      setInAppBackfillContacts([]);
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
    resetResolutionState,
    visible,
  ]);

  useAddPersonContactResolutionEffects({
    canReadContacts,
    contactResolutionWindow,
    contacts,
    hydrateAndEnqueueResolutionPhones,
    scanRunIdRef,
    visible,
    visibleResolutionPhonesRef,
  });

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
