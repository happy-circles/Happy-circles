import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Alert, Linking, Platform, Share } from 'react-native';

import {
  CONTACT_TARGET_RESOLUTION_LIMIT,
  buildContactSectionItems,
  compareEnrichedContacts,
  getUnresolvedContactPhoneE164List,
  isFreshQrDelivery,
  uniqueContactPhoneE164List,
  type AddPersonTransactionContext,
  type EnrichedContact,
} from '@/features/home/contacts-sheet-helpers';
import {
  loadPeopleTargetResolutionCache,
  pruneExpiredPeopleTargetResolutionCache,
  savePeopleTargetResolutionsToCache,
} from '@/features/home/people-target-resolution-cache';
import { showBlockedActionAlert } from '@/lib/action-feedback';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
  presentLimitedContactsAccessPicker,
  requestContactsPermissionStatus,
  type ContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  type AccountInviteDeliveryResult,
  type FriendshipInviteDeliveryResult,
  type PeopleOutreachResult,
  type PeopleTargetResolution,
  useCreateExternalFriendshipInviteMutation,
  useCreatePeopleOutreachMutation,
  useResolvePeopleTargetsMutation,
} from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { useSession } from '@/providers/session-provider';
import {
  buildAccountInviteShareMessage,
  buildAppInviteLink,
  buildFriendshipInviteLink,
  CONTACTS_PAGE_SIZE,
  extractInviteToken,
  isAccountInviteDeliveryResult,
  type ContactCandidate,
  type PendingContactSelection,
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [scannerMessage, setScannerMessage] = useState<string | null>(null);
  const [myQrVisible, setMyQrVisible] = useState(false);
  const [myQrDelivery, setMyQrDelivery] = useState<FriendshipInviteDeliveryResult | null>(null);
  const [myQrMessage, setMyQrMessage] = useState<string | null>(null);
  const [pendingContactSelection, setPendingContactSelection] =
    useState<PendingContactSelection | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsScanComplete, setContactsScanComplete] = useState(false);
  const [contactsLoadedCount, setContactsLoadedCount] = useState(0);
  const scanRunIdRef = useRef(0);
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
  const myQrLink = isFreshQrDelivery(myQrDelivery)
    ? buildFriendshipInviteLink(myQrDelivery.deliveryToken)
    : null;

  const pendingContactOptions = useMemo<readonly EnrichedContact[]>(
    () =>
      pendingContactSelection
        ? pendingContactSelection.phoneOptions
            .map((phoneOption) => ({
              contact: {
                alias: pendingContactSelection.alias,
                contactId: pendingContactSelection.contactId,
                phoneOptions: [phoneOption],
                primaryPhone: phoneOption,
                searchKey: '',
              },
              resolution: targetCache[phoneOption.phoneE164] ?? null,
            }))
            .sort(compareEnrichedContacts)
        : [],
    [pendingContactSelection, targetCache],
  );

  const mergeTargetResolutions = useCallback((resolutions: readonly PeopleTargetResolution[]) => {
    if (resolutions.length === 0) {
      return;
    }

    const next = { ...targetCacheRef.current };
    for (const resolution of resolutions) {
      next[resolution.phoneE164] = resolution;
    }

    targetCacheRef.current = next;
    setTargetCache(next);
  }, []);

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

  useEffect(() => {
    resolvePeopleTargetsMutateRef.current = resolvePeopleTargets.mutateAsync;
  }, [resolvePeopleTargets.mutateAsync]);

  const pumpResolutionQueue = useCallback(async () => {
    if (resolutionPumpRunningRef.current) {
      return;
    }

    resolutionPumpRunningRef.current = true;
    const activeRunId = scanRunIdRef.current;

    try {
      while (scanRunIdRef.current === activeRunId && pendingResolutionQueueRef.current.length > 0) {
        const batch: string[] = [];
        while (
          batch.length < CONTACT_TARGET_RESOLUTION_LIMIT &&
          pendingResolutionQueueRef.current.length > 0
        ) {
          const phoneE164 = pendingResolutionQueueRef.current.shift();
          if (!phoneE164) {
            continue;
          }

          pendingResolutionSetRef.current.delete(phoneE164);
          if (
            targetCacheRef.current[phoneE164] ||
            inFlightResolutionSetRef.current.has(phoneE164)
          ) {
            continue;
          }

          batch.push(phoneE164);
        }

        if (batch.length === 0) {
          continue;
        }

        for (const phoneE164 of batch) {
          inFlightResolutionSetRef.current.add(phoneE164);
        }

        try {
          const resolutions = await resolvePeopleTargetsMutateRef.current(batch);
          if (scanRunIdRef.current === activeRunId) {
            mergeAndPersistTargetResolutions(resolutions);
          }
        } catch (error) {
          const affectsVisibleContact = batch.some((phoneE164) =>
            visibleResolutionPhonesRef.current.has(phoneE164),
          );
          if (affectsVisibleContact && scanRunIdRef.current === activeRunId) {
            setMessage(
              error instanceof Error
                ? error.message
                : 'No se pudo revisar esta parte de tu agenda.',
            );
          }
        } finally {
          if (scanRunIdRef.current === activeRunId) {
            for (const phoneE164 of batch) {
              inFlightResolutionSetRef.current.delete(phoneE164);
            }
          }
        }
      }
    } finally {
      resolutionPumpRunningRef.current = false;
      if (pendingResolutionQueueRef.current.length > 0) {
        void pumpResolutionQueue();
      }
    }
  }, [mergeAndPersistTargetResolutions]);

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

  function resetContactScan(runId: number) {
    scanRunIdRef.current = runId;
    pendingResolutionQueueRef.current = [];
    pendingResolutionSetRef.current.clear();
    inFlightResolutionSetRef.current.clear();
    visibleResolutionPhonesRef.current.clear();
    targetCacheRef.current = {};
    setContacts([]);
    setTargetCache({});
    setContactsLoadedCount(0);
    setContactsLoading(false);
    setContactsScanComplete(false);
  }

  const loadContacts = useCallback(async () => {
    const runId = scanRunIdRef.current + 1;
    resetContactScan(runId);

    if (Platform.OS === 'web') {
      setContactsPermissionStatus('unavailable');
      setContacts([]);
      setContactsScanComplete(true);
      return;
    }

    setBusyKey('load-contacts');
    setContactsLoading(true);
    try {
      const nextStatus = await getContactsPermissionStatus();
      if (scanRunIdRef.current !== runId) {
        return;
      }

      setContactsPermissionStatus(nextStatus);

      if (!canReadContactsPermissionStatus(nextStatus)) {
        setContacts([]);
        setContactsScanComplete(true);
        return;
      }

      void pruneExpiredPeopleTargetResolutionCache(session.userId).catch(() => undefined);

      let pageOffset = 0;
      let hasNextPage = true;
      let loadedCount = 0;
      let isFirstPage = true;

      while (hasNextPage && scanRunIdRef.current === runId) {
        const page = await readContactsPageFromDevice({
          pageOffset,
          pageSize: CONTACTS_PAGE_SIZE,
        });
        if (scanRunIdRef.current !== runId) {
          return;
        }

        if (page.contacts.length > 0) {
          setContacts((current) => {
            const existingContactIds = new Set(current.map((contact) => contact.contactId));
            const nextContacts = [...current];
            for (const contact of page.contacts) {
              if (!existingContactIds.has(contact.contactId)) {
                existingContactIds.add(contact.contactId);
                nextContacts.push(contact);
              }
            }

            return nextContacts;
          });

          loadedCount += page.contacts.length;
          setContactsLoadedCount(loadedCount);

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
        setContactsScanComplete(true);
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

  useEffect(() => {
    if (!visible) {
      scanRunIdRef.current += 1;
      pendingResolutionQueueRef.current = [];
      pendingResolutionSetRef.current.clear();
      inFlightResolutionSetRef.current.clear();
      visibleResolutionPhonesRef.current.clear();
      setContactsLoading(false);
      setScannerOpen(false);
      setScannerLocked(false);
      setScannerMessage(null);
      setMyQrVisible(false);
      setMyQrMessage(null);
      setPendingContactSelection(null);
      return;
    }

    setMessage(null);
    setSearchValue(initialSearchValue?.trim() ?? '');
    void loadContacts();
  }, [initialSearchValue, loadContacts, visible]);

  useEffect(() => {
    if (!visible || !canReadContacts || contactResolutionWindow.length === 0) {
      visibleResolutionPhonesRef.current = new Set();
      return;
    }

    const visiblePhones = uniqueContactPhoneE164List(contactResolutionWindow);
    visibleResolutionPhonesRef.current = new Set(visiblePhones);
    enqueueResolutionPhones(visiblePhones, 'visible');
  }, [canReadContacts, contactResolutionWindow, enqueueResolutionPhones, visible]);

  async function requestContactsAccess() {
    if (busyKey) {
      return;
    }

    setBusyKey('request-contacts');
    setMessage(null);

    try {
      const nextStatus = await requestContactsPermissionStatus();
      setContactsPermissionStatus(nextStatus);

      if (!canReadContactsPermissionStatus(nextStatus)) {
        setContacts([]);
        setMessage(
          nextStatus === 'denied'
            ? 'Contactos bloqueados. Puedes activarlos en Ajustes.'
            : 'Puedes seguir conectando en persona con QR.',
        );
        if (nextStatus === 'denied') {
          openContactsSettings();
        }
        return;
      }

      setMessage(
        nextStatus === 'limited'
          ? 'Tu telefono compartio contactos limitados. Los estamos cargando.'
          : 'Tu agenda se esta cargando.',
      );
      void loadContacts();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo abrir el permiso de contactos.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  function openContactsSettings() {
    Alert.alert(
      'Permiso de contactos bloqueado',
      'Abre Ajustes y permite contactos para encontrar personas desde tu agenda.',
      [
        { style: 'cancel', text: 'Ahora no' },
        { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
      ],
    );
  }

  async function handleExpandLimitedContactsAccess() {
    if (busyKey || contactsPermissionStatus !== 'limited') {
      return;
    }

    setBusyKey('expand-contacts');
    setMessage(null);

    try {
      await presentLimitedContactsAccessPicker();
      const nextStatus = await getContactsPermissionStatus();
      setContactsPermissionStatus(nextStatus);

      if (!canReadContactsPermissionStatus(nextStatus)) {
        setContacts([]);
        setMessage('La agenda dejo de estar disponible. Puedes seguir con QR en persona.');
        return;
      }

      setMessage('Actualizando la agenda compartida.');
      void loadContacts();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo ampliar el acceso a tus contactos.',
      );
    } finally {
      setBusyKey(null);
    }
  }

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

  async function shareAccountInviteLink(alias: string, delivery: AccountInviteDeliveryResult) {
    const inviteLink = buildAppInviteLink(delivery.deliveryToken);
    const shareMessage = buildAccountInviteShareMessage({
      amountMinor: transactionContext?.amountMinor ?? null,
      description: transactionContext?.description ?? null,
      direction: transactionContext?.direction ?? null,
      inviteLink,
      inviteeAlias: alias,
    });

    try {
      await Share.share({
        message: shareMessage,
        title: 'Invitacion a Happy Circles',
      });
      setMessage(`Listo. Ya puedes compartir el acceso privado con ${alias}.`);
    } catch {
      await Clipboard.setStringAsync(inviteLink);
      setMessage(`No pudimos abrir compartir. Copiamos el link privado de ${alias}.`);
    }
  }

  function updateCacheFromOutreach(
    phoneE164: string,
    alias: string,
    response: PeopleOutreachResult,
  ) {
    let resolution: PeopleTargetResolution;

    if (response.kind === 'already_related') {
      resolution = {
        accountInviteId: null,
        accountInviteStatus: null,
        avatarPath: null,
        displayName: response.displayName ?? alias,
        friendshipInviteId: null,
        matchedUserId: response.matchedUserId,
        phoneE164,
        relationshipId: response.relationshipId ?? null,
        status: 'already_related',
      };
      mergeAndPersistTargetResolutions([resolution]);
      return;
    }

    if (response.kind === 'friendship') {
      resolution = {
        accountInviteId: null,
        accountInviteStatus: null,
        avatarPath: null,
        displayName: response.displayName ?? alias,
        friendshipInviteId: response.inviteId ?? null,
        matchedUserId: response.matchedUserId,
        phoneE164,
        relationshipId: response.relationshipId ?? null,
        status: 'pending_friendship',
      };
      mergeAndPersistTargetResolutions([resolution]);
      return;
    }

    const accountInviteId =
      isAccountInviteDeliveryResult(response.result) && typeof response.result.inviteId === 'string'
        ? response.result.inviteId
        : (response.inviteId ?? null);

    resolution = {
      accountInviteId,
      accountInviteStatus: 'pending_activation',
      avatarPath: null,
      displayName: response.displayName ?? alias,
      friendshipInviteId: null,
      matchedUserId: response.matchedUserId,
      phoneE164,
      relationshipId: null,
      status: 'pending_activation',
    };
    mergeAndPersistTargetResolutions([resolution]);
  }

  async function handleCreateOutreach(input: {
    readonly alias: string;
    readonly phoneE164: string;
    readonly phoneLabel?: string | null;
    readonly sourceContext: string;
  }) {
    if (busyKey) {
      return;
    }

    setBusyKey(input.phoneE164);
    setMessage(null);

    try {
      const response = await createPeopleOutreach.mutateAsync({
        channel: 'remote',
        intendedRecipientAlias: input.alias,
        intendedRecipientPhoneE164: input.phoneE164,
        intendedRecipientPhoneLabel: input.phoneLabel ?? undefined,
        sourceContext: input.sourceContext,
      });

      updateCacheFromOutreach(input.phoneE164, input.alias, response);

      if (response.kind === 'already_related') {
        setMessage(`${input.alias} ya aparece en tus personas.`);
        return;
      }

      if (response.kind === 'friendship') {
        setMessage(
          response.status === 'pending_friendship'
            ? `${input.alias} ya tiene una solicitud pendiente.`
            : `Enviamos una solicitud de amistad a ${input.alias}.`,
        );
        return;
      }

      if (!isAccountInviteDeliveryResult(response.result)) {
        throw new Error('No pudimos preparar el link de acceso para este contacto.');
      }

      await shareAccountInviteLink(input.alias, response.result);
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : 'No se pudo completar este movimiento.';
      setMessage(failureMessage);
      showBlockedActionAlert(failureMessage, router);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleContactPress(contact: ContactCandidate) {
    if (contact.phoneOptions.length === 1) {
      await handleCreateOutreach({
        alias: contact.alias,
        phoneE164: contact.primaryPhone.phoneE164,
        phoneLabel: contact.primaryPhone.label,
        sourceContext: 'home_add_contact_list',
      });
      return;
    }

    try {
      await ensurePhoneStatuses(contact.phoneOptions.map((phoneOption) => phoneOption.phoneE164));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo revisar los numeros de este contacto.',
      );
    }

    setPendingContactSelection({
      alias: contact.alias,
      contactId: contact.contactId,
      phoneOptions: contact.phoneOptions,
    });
  }

  function navigateToInviteToken(rawValue: string) {
    const token = extractInviteToken(rawValue);
    if (!token) {
      setMessage('Pega un link completo o un codigo valido de invitacion.');
      return;
    }

    setScannerOpen(false);
    onClose();
    pushRoute(router, {
      params: { token },
      pathname: '/invite/[token]',
    });
  }

  async function handleOpenScanner() {
    setMessage(null);
    setScannerMessage(null);
    setMyQrVisible(false);

    if (cameraPermission?.granted) {
      setScannerLocked(false);
      setScannerOpen(true);
      return;
    }

    const permission = await requestCameraPermission();
    if (!permission.granted) {
      setMessage('Necesitamos permiso de camara para escanear QR.');
      return;
    }

    setScannerLocked(false);
    setScannerOpen(true);
  }

  async function handleShowMyQr() {
    setMyQrVisible(true);
    setScannerOpen(false);
    setMessage(null);
    setMyQrMessage(null);

    if (isFreshQrDelivery(myQrDelivery)) {
      return;
    }

    await handleRefreshMyQr();
  }

  async function handleRefreshMyQr() {
    setBusyKey('my-qr');
    setMyQrMessage(null);
    try {
      const delivery = await createExternalFriendshipInvite.mutateAsync({
        channel: 'qr',
        sourceContext: 'home_add_my_qr',
      });
      if (!delivery.deliveryToken) {
        throw new Error('El servidor no devolvio un token para el QR.');
      }
      setMyQrDelivery(delivery);
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : 'No se pudo crear tu QR.';
      setMyQrMessage(failureMessage);
      showBlockedActionAlert(failureMessage, router);
    } finally {
      setBusyKey((current) => (current === 'my-qr' ? null : current));
    }
  }

  async function handleShareMyQr() {
    if (!myQrLink) {
      return;
    }

    try {
      await Share.share({
        message: `Escanea o abre este link para conectar conmigo en Happy Circles: ${myQrLink}`,
        title: 'Mi QR de Happy Circles',
      });
    } catch {
      await Clipboard.setStringAsync(myQrLink);
      setMyQrMessage('No pudimos abrir compartir. Copiamos tu link de QR.');
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannerLocked) {
      return;
    }

    const token = extractInviteToken(result.data);
    if (!token) {
      setScannerLocked(true);
      setScannerMessage('Ese QR no parece ser una invitacion valida de Happy Circles.');
      setTimeout(() => {
        setScannerLocked(false);
      }, 1200);
      return;
    }

    setScannerLocked(true);
    navigateToInviteToken(token);
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
