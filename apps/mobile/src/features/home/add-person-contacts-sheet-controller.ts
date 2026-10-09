import { useCallback, useEffect, useRef, useState } from 'react';
import { useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAddPersonContactList } from './use-add-person-contact-list';
import { useAddPersonContactPermissionActions } from './add-person-contact-permissions';
import { useAddPersonContactResolutionController } from './add-person-contact-resolution-controller';
import { useAddPersonContactResolutionEffects } from './add-person-contact-resolution-effects';
import { useAddPersonOutreachActions } from './add-person-outreach-actions';
import { useAddPersonQrActions } from './add-person-qr-actions';
import { ContactSectionProjection } from './contact-section-projection';
import {
  uniqueContactPhoneE164List,
  type AddPersonTransactionContext,
} from './contacts-sheet-helpers';
import { contactResolutionEpoch } from '@/lib/contact-resolution-state';
import {
  useCreateExternalFriendshipInviteMutation,
  useCreatePeopleOutreachMutation,
} from '@/lib/live-data';
import { useSession } from '@/providers/session-provider';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';

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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const projectionRef = useRef(new ContactSectionProjection());
  const {
    ensurePhoneStatuses,
    handleReviewContact,
    handleReviewPhone,
    hydrateAndEnqueueResolutionPhones,
    loadCachedTargetResolutionsForPhones,
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
    visible,
  });

  const {
    contacts,
    canReadContacts,
    contactsLoadedCount,
    contactsLoading,
    contactsPermissionStatus,
    contactsScanComplete,
    contactResolutionWindow,
    hasMoreContactsToDisplay,
    requestMoreContacts,
    resetContactReadLimit,
    loadContacts,
    handleRefreshContacts,
    setContacts,
    setContactsPermissionStatus,
    setContactsLoading,
  } = useAddPersonContactList({
    userId: session.userId,
    searchValue,
    visible,
    busyKey,
    setBusyKey,
    setMessage,
    loadCachedTargetResolutionsForPhones,
    resetResolutionState,
    resolvePhoneStatusesNow,
    scanRunIdRef,
    setTargetCache,
    targetCacheRef,
    visibleResolutionPhonesRef,
  });
  useEffect(() => {
    projectionRef.current = new ContactSectionProjection();
  }, [session.userId]);

  const contactSections = projectionRef.current.update({
    contacts,
    searchValue,
    targetCache,
  });
  const { inAppContacts, unresolvedContacts, inviteContacts } = contactSections;
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
    onClose,
    busyKey,
    createPeopleOutreach,
    ensurePhoneStatuses,
    resolvePhoneStatusesNow,
    router,
    setBusyKey,
    setMessage,
    targetCache,
    transactionContext,
  });

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

  const handleViewableContactsChanged = useCallback(
    (rows: readonly ContactCandidate[]) => {
      if (!session.userId || !canReadContacts || !visible) return;
      const phones = uniqueContactPhoneE164List(rows);
      visibleResolutionPhonesRef.current = new Set(phones);
      hydrateAndEnqueueResolutionPhones(scanRunIdRef.current, phones, 'visible');
    },
    [
      session.userId,
      canReadContacts,
      visible,
      visibleResolutionPhonesRef,
      hydrateAndEnqueueResolutionPhones,
      scanRunIdRef,
    ],
  );

  useEffect(() => {
    if (!visible) {
      resetResolutionState();
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
    resetContactReadLimit,
    resetPendingContactSelection,
    resetQrStateOnClose,
    resetResolutionState,
    visible,
  ]);

  useAddPersonContactResolutionEffects({
    userId: session.userId,
    resolutionEpoch: session.userId ? contactResolutionEpoch(session.userId) : 0,
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
    handleViewableContactsChanged,
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
