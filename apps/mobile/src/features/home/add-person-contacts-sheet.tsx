import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import {
  CONTACT_TARGET_RESOLUTION_LIMIT,
  actionMetaForResolution,
  buildContactSectionItems,
  compareEnrichedContacts,
  contactAvatarColor,
  contactMeta,
  formatQrExpiry,
  getUnresolvedContactPhoneE164List,
  isFreshQrDelivery,
  shouldShowInApp,
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
import { formatCop } from '@/lib/data';
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
import { theme } from '@/lib/theme';
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

function ContactRow({
  busy,
  contact,
  onPress,
  resolution,
}: {
  readonly busy: boolean;
  readonly contact: ContactCandidate;
  readonly onPress: () => void;
  readonly resolution: PeopleTargetResolution | null;
}) {
  const hasMultiplePhones = contact.phoneOptions.length > 1;
  const action = actionMetaForResolution(resolution, hasMultiplePhones);
  const disabled = action.disabled || busy;

  return (
    <View style={[styles.contactRow, shouldShowInApp(resolution) ? styles.contactRowInApp : null]}>
      <AppAvatar
        fallbackBackgroundColor={contactAvatarColor(contact)}
        fallbackTextColor={theme.colors.white}
        label={contact.alias}
        size={44}
      />
      <View style={styles.contactCopy}>
        <Text numberOfLines={1} style={styles.contactName}>
          {contact.alias}
        </Text>
        <Text numberOfLines={2} style={styles.contactPhone}>
          {contactMeta(contact.primaryPhone)}
        </Text>
      </View>
      <Pressable
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => [
          styles.contactActionButton,
          action.tone === 'invite' ? styles.contactActionInvite : null,
          action.tone === 'muted' ? styles.contactActionMuted : null,
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Ionicons color={theme.colors.white} name={busy ? 'sync-outline' : action.icon} size={14} />
        <Text numberOfLines={1} style={styles.contactActionText}>
          {busy ? '...' : action.label}
        </Text>
      </Pressable>
    </View>
  );
}

export function AddPersonContactsSheet({
  currentUserAvatarUrl,
  currentUserLabel,
  initialSearchValue,
  onClose,
  transactionContext,
  visible,
}: {
  readonly currentUserAvatarUrl?: string | null;
  readonly currentUserLabel: string;
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

  function renderContactSection(title: string, items: readonly EnrichedContact[]) {
    if (items.length === 0) {
      return null;
    }

    return (
      <View style={styles.contactSection}>
        <Text style={styles.sectionLabel}>{title}</Text>
        <View style={styles.contactList}>
          {items.map(({ contact, resolution }) => (
            <ContactRow
              busy={busyKey === contact.primaryPhone.phoneE164}
              contact={contact}
              key={`${contact.contactId}:${contact.primaryPhone.id}`}
              onPress={() => void handleContactPress(contact)}
              resolution={resolution}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <>
      <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetScrim}
        >
          <Pressable onPress={onClose} style={styles.sheetBackdrop} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Agregar personas</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons color={theme.colors.text} name="close" size={22} />
              </Pressable>
            </View>

            <View style={styles.inPersonBlock}>
              <View style={styles.inPersonCopy}>
                <Text style={styles.inPersonTitle}>Conectar en persona</Text>
                <Text style={styles.inPersonText}>Usa QR cuando ya estan juntos.</Text>
              </View>
              <View style={styles.inPersonActions}>
                <Pressable
                  onPress={() => void handleOpenScanner()}
                  style={({ pressed }) => [styles.qrActionButton, pressed ? styles.pressed : null]}
                >
                  <Ionicons color={theme.colors.text} name="camera-outline" size={18} />
                  <Text style={styles.qrActionText}>Escanear QR</Text>
                </Pressable>
                <Pressable
                  disabled={busyKey === 'my-qr'}
                  onPress={() => void handleShowMyQr()}
                  style={({ pressed }) => [
                    styles.qrActionButton,
                    styles.qrActionButtonPrimary,
                    pressed ? styles.pressed : null,
                    busyKey === 'my-qr' ? styles.disabled : null,
                  ]}
                >
                  <Ionicons color={theme.colors.white} name="qr-code-outline" size={18} />
                  <Text style={[styles.qrActionText, styles.qrActionTextPrimary]}>
                    {busyKey === 'my-qr' ? 'Creando...' : 'Mi QR'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {transactionContext ? (
              <View style={styles.contextBlock}>
                <Text style={styles.contextLabel}>Contexto</Text>
                <Text style={styles.contextBody}>
                  {transactionContext.direction === 'i_owe' ? 'Salida' : 'Entrada'} de{' '}
                  {formatCop(transactionContext.amountMinor)}
                  {transactionContext.description &&
                  transactionContext.description.trim().length > 0
                    ? ` por ${transactionContext.description.trim()}`
                    : ''}
                </Text>
              </View>
            ) : null}

            <View style={styles.searchWrap}>
              <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
              <AppTextInput
                autoCapitalize="words"
                autoCorrect={false}
                chrome="plain"
                density="compact"
                onChangeText={setSearchValue}
                placeholder="Buscar en contactos"
                placeholderTextColor={theme.colors.muted}
                style={styles.searchInput}
                value={searchValue}
              />
            </View>

            {message ? <MessageBanner message={message} tone="neutral" /> : null}

            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {canReadContacts ? (
                <>
                  {contactsPermissionStatus === 'limited' ? (
                    <PrimaryAction
                      compact
                      disabled={Boolean(busyKey)}
                      label={
                        busyKey === 'expand-contacts' ? 'Abriendo agenda...' : 'Ver mas contactos'
                      }
                      onPress={busyKey ? undefined : () => void handleExpandLimitedContactsAccess()}
                      variant="secondary"
                    />
                  ) : null}

                  {contactsLoading ? (
                    <Text style={styles.helperText}>
                      {contactsLoadedCount > 0
                        ? `Cargando agenda en segundo plano (${contactsLoadedCount} contactos).`
                        : 'Leyendo tu agenda...'}
                    </Text>
                  ) : contactsLoadedCount > 0 && !contactsScanComplete ? (
                    <Text style={styles.helperText}>Terminando de revisar la agenda...</Text>
                  ) : null}

                  {renderContactSection('En Happy Circles', inAppContacts)}
                  {renderContactSection('Invitar a Happy Circles', inviteContacts)}

                  {displayedContactsCount === 0 && !contactsLoading ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>
                        {searchValue.trim().length > 0 ? 'Sin resultados' : 'Sin contactos utiles'}
                      </Text>
                      <Text style={styles.emptyText}>
                        {searchValue.trim().length > 0
                          ? 'Prueba con otro nombre o celular.'
                          : 'No encontramos contactos con numero en la agenda disponible.'}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.permissionBox}>
                  <Text style={styles.emptyTitle}>Conecta tu agenda</Text>
                  <Text style={styles.emptyText}>
                    Asi vemos quien ya esta en Happy Circles y quien necesita invitacion.
                  </Text>
                  {contactsPermissionStatus !== 'unavailable' ? (
                    <PrimaryAction
                      compact
                      disabled={Boolean(busyKey)}
                      label={
                        busyKey === 'request-contacts' ? 'Abriendo permiso...' : 'Usar mi agenda'
                      }
                      onPress={busyKey ? undefined : () => void requestContactsAccess()}
                      variant="secondary"
                    />
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>

          {scannerOpen ? (
            <View style={styles.floatingOverlay}>
              <Pressable onPress={() => setScannerOpen(false)} style={styles.sheetBackdrop} />
              <View style={styles.scannerCard}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={styles.optionTitle}>Escanear QR</Text>
                    <Text style={styles.emptyText}>
                      Centra el QR de Happy Circles en la camara.
                    </Text>
                  </View>
                  <Pressable onPress={() => setScannerOpen(false)} style={styles.closeButton}>
                    <Ionicons color={theme.colors.text} name="close" size={22} />
                  </Pressable>
                </View>
                {scannerMessage ? <MessageBanner message={scannerMessage} tone="neutral" /> : null}
                <View style={styles.scannerWrap}>
                  <CameraView
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={handleBarcodeScanned}
                    style={styles.scanner}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {myQrVisible ? (
            <View style={styles.floatingOverlay}>
              <Pressable onPress={() => setMyQrVisible(false)} style={styles.sheetBackdrop} />
              <View style={styles.myQrCard}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={styles.optionTitle}>Mi QR</Text>
                    <Text style={styles.emptyText}>Para conectar en persona.</Text>
                  </View>
                  <Pressable onPress={() => setMyQrVisible(false)} style={styles.closeButton}>
                    <Ionicons color={theme.colors.text} name="close" size={22} />
                  </Pressable>
                </View>

                <View style={styles.qrProfile}>
                  <AppAvatar
                    fallbackBackgroundColor={theme.colors.primary}
                    fallbackTextColor={theme.colors.white}
                    imageUrl={currentUserAvatarUrl ?? null}
                    label={currentUserLabel}
                    size={52}
                  />
                  <View style={styles.contactCopy}>
                    <Text numberOfLines={1} style={styles.contactName}>
                      {currentUserLabel}
                    </Text>
                    <Text style={styles.contactPhone}>
                      {myQrDelivery ? formatQrExpiry(myQrDelivery.expiresAt) : 'Generando QR...'}
                    </Text>
                  </View>
                </View>

                {myQrMessage ? <MessageBanner message={myQrMessage} tone="neutral" /> : null}

                <View style={styles.qrCodeShell}>
                  {myQrLink ? (
                    <QRCode
                      backgroundColor={theme.colors.white}
                      color={theme.colors.text}
                      size={210}
                      value={myQrLink}
                    />
                  ) : (
                    <View style={styles.qrLoading}>
                      <Ionicons color={theme.colors.textMuted} name="sync-outline" size={28} />
                      <Text style={styles.helperText}>
                        {busyKey === 'my-qr' ? 'Creando QR temporal...' : 'Toca renovar QR.'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.qrModalActions}>
                  <PrimaryAction
                    compact
                    disabled={!myQrLink}
                    label="Compartir link"
                    onPress={() => void handleShareMyQr()}
                    variant="secondary"
                  />
                  <PrimaryAction
                    compact
                    disabled={busyKey === 'my-qr'}
                    label={busyKey === 'my-qr' ? 'Renovando...' : 'Renovar QR'}
                    onPress={() => void handleRefreshMyQr()}
                    variant="ghost"
                  />
                </View>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setPendingContactSelection(null)}
        transparent
        visible={pendingContactSelection !== null}
      >
        <View style={styles.optionScrim}>
          <Pressable
            onPress={() => setPendingContactSelection(null)}
            style={styles.sheetBackdrop}
          />
          <View style={styles.optionCard}>
            <Text style={styles.optionTitle}>Elige el numero</Text>
            <Text style={styles.emptyText}>
              {pendingContactSelection
                ? `${pendingContactSelection.alias} tiene varios numeros.`
                : ''}
            </Text>
            <View style={styles.optionList}>
              {pendingContactOptions.map(({ contact, resolution }) => {
                const phoneOption = contact.primaryPhone;
                const action = actionMetaForResolution(resolution, false);
                const disabled = action.disabled || busyKey === phoneOption.phoneE164;

                return (
                  <View key={phoneOption.id} style={styles.optionRow}>
                    <View style={styles.contactCopy}>
                      <Text style={styles.contactName}>{contactMeta(phoneOption)}</Text>
                      <Text style={styles.contactPhone}>
                        {resolution?.status === 'active_user'
                          ? 'Ya esta en Happy Circles'
                          : resolution?.status === 'already_related'
                            ? 'Agregado'
                            : resolution?.status === 'pending_friendship'
                              ? 'Pendiente'
                              : 'Puede recibir invitacion'}
                      </Text>
                    </View>
                    <Pressable
                      disabled={disabled}
                      onPress={
                        disabled || !pendingContactSelection
                          ? undefined
                          : () => {
                              setPendingContactSelection(null);
                              void handleCreateOutreach({
                                alias: pendingContactSelection.alias,
                                phoneE164: phoneOption.phoneE164,
                                phoneLabel: phoneOption.label,
                                sourceContext: 'home_add_contact_option',
                              });
                            }
                      }
                      style={({ pressed }) => [
                        styles.contactActionButton,
                        action.tone === 'invite' ? styles.contactActionInvite : null,
                        action.tone === 'muted' ? styles.contactActionMuted : null,
                        pressed && !disabled ? styles.pressed : null,
                        disabled ? styles.disabled : null,
                      ]}
                    >
                      <Ionicons color={theme.colors.white} name={action.icon} size={14} />
                      <Text style={styles.contactActionText}>{action.label}</Text>
                    </Pressable>
                  </View>
                );
              })}
              <PrimaryAction
                compact
                label="Cancelar"
                onPress={() => setPendingContactSelection(null)}
                variant="ghost"
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheetScrim: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.large,
    borderTopRightRadius: theme.radius.large,
    gap: theme.spacing.md,
    maxHeight: '88%',
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  inPersonBlock: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  inPersonCopy: {
    gap: 2,
  },
  inPersonTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  inPersonText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  inPersonActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  contextBlock: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: 4,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
  },
  contextLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  contextBody: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    lineHeight: 20,
  },
  qrActionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: theme.spacing.sm,
  },
  qrActionButtonPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  qrActionText: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  qrActionTextPrimary: {
    color: theme.colors.white,
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 52,
    paddingHorizontal: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
  },
  sheetContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  contactSection: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  contactList: {
    gap: theme.spacing.sm,
  },
  contactRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.small,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 72,
    padding: theme.spacing.sm,
  },
  contactRowInApp: {
    backgroundColor: theme.colors.successSoft,
    borderColor: 'rgba(15, 138, 95, 0.18)',
    borderWidth: 1,
  },
  contactCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  contactName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  contactPhone: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  contactActionButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 84,
    paddingHorizontal: theme.spacing.sm,
  },
  contactActionInvite: {
    backgroundColor: '#f97316',
  },
  contactActionMuted: {
    backgroundColor: theme.colors.muted,
  },
  contactActionText: {
    color: theme.colors.white,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.52,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
  },
  permissionBox: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.small,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  scannerWrap: {
    borderRadius: theme.radius.medium,
    overflow: 'hidden',
  },
  scanner: {
    height: 260,
    width: '100%',
  },
  optionScrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 40, 0.38)',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  floatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 40, 0.38)',
    elevation: 10,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    zIndex: 10,
  },
  scannerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.large,
    gap: theme.spacing.md,
    maxWidth: 430,
    padding: theme.spacing.md,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  myQrCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.large,
    gap: theme.spacing.md,
    maxWidth: 380,
    padding: theme.spacing.lg,
    width: '100%',
  },
  qrProfile: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  qrCodeShell: {
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 238,
    padding: theme.spacing.md,
    width: '100%',
  },
  qrLoading: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 210,
  },
  qrModalActions: {
    alignSelf: 'stretch',
    gap: theme.spacing.sm,
  },
  optionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.large,
    gap: theme.spacing.md,
    maxWidth: 430,
    padding: theme.spacing.lg,
    width: '100%',
  },
  optionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
  },
  optionList: {
    gap: theme.spacing.sm,
  },
  optionRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.small,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
});
