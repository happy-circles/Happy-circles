import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {
  KeyboardAvoidingView,
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
import { theme } from '@/lib/theme';
import {
  buildAccountInviteShareMessage,
  buildAppInviteLink,
  buildFriendshipInviteLink,
  type ContactCandidate,
  type ContactPhoneOption,
  extractInviteToken,
  formatPhonePreview,
  isAccountInviteDeliveryResult,
  type PendingContactSelection,
  readContactsFromDevice,
} from '@/features/invites/people-outreach-utils';

const CONTACT_AVATAR_COLORS = ['#e11d48', '#ea580c', '#059669', '#0891b2', '#2563eb', '#9333ea'];

type EnrichedContact = {
  readonly contact: ContactCandidate;
  readonly resolution: PeopleTargetResolution | null;
};

function contactAvatarColor(contact: ContactCandidate): string {
  const source = `${contact.contactId}:${contact.alias}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return CONTACT_AVATAR_COLORS[hash % CONTACT_AVATAR_COLORS.length] ?? theme.colors.primary;
}

function actionMetaForResolution(
  resolution: PeopleTargetResolution | null,
  hasMultiplePhones: boolean,
): {
  readonly label: string;
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly tone: 'primary' | 'invite' | 'muted';
  readonly disabled: boolean;
} {
  if (hasMultiplePhones) {
    return {
      disabled: false,
      icon: 'list-outline',
      label: 'Elegir',
      tone: 'primary',
    };
  }

  if (!resolution) {
    return {
      disabled: true,
      icon: 'sync-outline',
      label: '...',
      tone: 'muted',
    };
  }

  if (resolution.status === 'active_user') {
    return {
      disabled: false,
      icon: 'person-add-outline',
      label: 'Agregar',
      tone: 'primary',
    };
  }

  if (resolution.status === 'no_account') {
    return {
      disabled: false,
      icon: 'paper-plane-outline',
      label: 'Invitar',
      tone: 'invite',
    };
  }

  if (resolution.status === 'pending_activation') {
    return {
      disabled: false,
      icon: 'paper-plane-outline',
      label: 'Reenviar',
      tone: 'invite',
    };
  }

  if (resolution.status === 'pending_friendship') {
    return {
      disabled: true,
      icon: 'time-outline',
      label: 'Pendiente',
      tone: 'muted',
    };
  }

  return {
    disabled: true,
    icon: 'checkmark-outline',
    label: 'Agregado',
    tone: 'muted',
  };
}

function shouldShowInApp(resolution: PeopleTargetResolution | null): boolean {
  return (
    resolution?.status === 'active_user' ||
    resolution?.status === 'already_related' ||
    resolution?.status === 'pending_friendship'
  );
}

function contactMeta(phoneOption: ContactPhoneOption): string {
  const number = formatPhonePreview(phoneOption.phoneE164);
  if (phoneOption.label) {
    return `${phoneOption.label} ${number}`;
  }

  return number;
}

function formatQrExpiry(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'QR temporal';
  }

  return `Vence ${new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))}`;
}

function isFreshQrDelivery(
  delivery: FriendshipInviteDeliveryResult | null,
): delivery is FriendshipInviteDeliveryResult {
  if (!delivery) {
    return false;
  }

  const timestamp = Date.parse(delivery.expiresAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }

  return timestamp - Date.now() > 60_000;
}

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
  onClose,
  visible,
}: {
  readonly currentUserAvatarUrl?: string | null;
  readonly currentUserLabel: string;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const router = useRouter();
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

  const canReadContacts = canReadContactsPermissionStatus(contactsPermissionStatus);

  const filteredContacts = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLocaleLowerCase('es-CO');
    if (normalizedSearch.length === 0) {
      return contacts;
    }

    return contacts.filter((contact) => contact.searchKey.includes(normalizedSearch));
  }, [contacts, searchValue]);

  const displayedContacts = useMemo(
    () => filteredContacts.slice(0, searchValue.trim().length > 0 ? 60 : 36),
    [filteredContacts, searchValue],
  );

  const enrichedContacts = useMemo<readonly EnrichedContact[]>(
    () =>
      displayedContacts.map((contact) => ({
        contact,
        resolution: targetCache[contact.primaryPhone.phoneE164] ?? null,
      })),
    [displayedContacts, targetCache],
  );

  const inAppContacts = useMemo(
    () => enrichedContacts.filter((item) => shouldShowInApp(item.resolution)),
    [enrichedContacts],
  );

  const inviteContacts = useMemo(
    () => enrichedContacts.filter((item) => !shouldShowInApp(item.resolution)),
    [enrichedContacts],
  );
  const myQrLink = isFreshQrDelivery(myQrDelivery)
    ? buildFriendshipInviteLink(myQrDelivery.deliveryToken)
    : null;

  const mergeTargetResolutions = useCallback((resolutions: readonly PeopleTargetResolution[]) => {
    setTargetCache((current) => {
      if (resolutions.length === 0) {
        return current;
      }

      const next = { ...current };
      for (const resolution of resolutions) {
        next[resolution.phoneE164] = resolution;
      }
      return next;
    });
  }, []);

  const loadContacts = useCallback(async () => {
    if (Platform.OS === 'web') {
      setContactsPermissionStatus('unavailable');
      setContacts([]);
      return;
    }

    setBusyKey('load-contacts');
    try {
      const nextStatus = await getContactsPermissionStatus();
      setContactsPermissionStatus(nextStatus);

      if (!canReadContactsPermissionStatus(nextStatus)) {
        setContacts([]);
        return;
      }

      const nextContacts = await readContactsFromDevice();
      setContacts(nextContacts);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo leer la agenda.');
    } finally {
      setBusyKey((current) => (current === 'load-contacts' ? null : current));
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setScannerOpen(false);
      setScannerLocked(false);
      setScannerMessage(null);
      setMyQrVisible(false);
      setMyQrMessage(null);
      setPendingContactSelection(null);
      return;
    }

    setMessage(null);
    void loadContacts();
  }, [loadContacts, visible]);

  useEffect(() => {
    if (!visible || !canReadContacts || displayedContacts.length === 0) {
      return;
    }

    const missingPhones = [
      ...new Set(
        displayedContacts
          .map((contact) => contact.primaryPhone.phoneE164)
          .filter((phoneE164) => !targetCache[phoneE164]),
      ),
    ];

    if (missingPhones.length === 0) {
      return;
    }

    void resolvePeopleTargets
      .mutateAsync(missingPhones)
      .then(mergeTargetResolutions)
      .catch((error) => {
        setMessage(
          error instanceof Error ? error.message : 'No se pudo revisar esta parte de tu agenda.',
        );
      });
  }, [
    canReadContacts,
    displayedContacts,
    mergeTargetResolutions,
    resolvePeopleTargets,
    targetCache,
    visible,
  ]);

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
        setMessage('Puedes seguir conectando en persona con QR.');
        return;
      }

      const nextContacts = await readContactsFromDevice();
      setContacts(nextContacts);
      setMessage(
        nextStatus === 'limited'
          ? `Tu telefono compartio ${nextContacts.length} contactos con numero.`
          : 'Tu agenda ya quedo lista.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo abrir el permiso de contactos.',
      );
    } finally {
      setBusyKey(null);
    }
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

      const nextContacts = await readContactsFromDevice();
      setContacts(nextContacts);
      setMessage(`Ahora vemos ${nextContacts.length} contactos con numero.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo ampliar el acceso a tus contactos.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function ensurePhoneStatuses(phoneE164List: readonly string[]) {
    const missingPhones = [
      ...new Set(phoneE164List.filter((phoneE164) => !targetCache[phoneE164])),
    ];
    if (missingPhones.length === 0) {
      return;
    }

    const resolutions = await resolvePeopleTargets.mutateAsync(missingPhones);
    mergeTargetResolutions(resolutions);
  }

  async function shareAccountInviteLink(alias: string, delivery: AccountInviteDeliveryResult) {
    const inviteLink = buildAppInviteLink(delivery.deliveryToken);
    const shareMessage = buildAccountInviteShareMessage({
      amountMinor: null,
      description: null,
      direction: null,
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
    if (response.kind === 'already_related') {
      mergeTargetResolutions([
        {
          accountInviteId: null,
          accountInviteStatus: null,
          avatarPath: null,
          displayName: response.displayName ?? alias,
          friendshipInviteId: null,
          matchedUserId: response.matchedUserId,
          phoneE164,
          relationshipId: response.relationshipId ?? null,
          status: 'already_related',
        },
      ]);
      return;
    }

    if (response.kind === 'friendship') {
      mergeTargetResolutions([
        {
          accountInviteId: null,
          accountInviteStatus: null,
          avatarPath: null,
          displayName: response.displayName ?? alias,
          friendshipInviteId: response.inviteId ?? null,
          matchedUserId: response.matchedUserId,
          phoneE164,
          relationshipId: response.relationshipId ?? null,
          status: 'pending_friendship',
        },
      ]);
      return;
    }

    const accountInviteId =
      isAccountInviteDeliveryResult(response.result) && typeof response.result.inviteId === 'string'
        ? response.result.inviteId
        : (response.inviteId ?? null);

    mergeTargetResolutions([
      {
        accountInviteId,
        accountInviteStatus: 'pending_activation',
        avatarPath: null,
        displayName: response.displayName ?? alias,
        friendshipInviteId: null,
        matchedUserId: response.matchedUserId,
        phoneE164,
        relationshipId: null,
        status: 'pending_activation',
      },
    ]);
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
      setMessage(error instanceof Error ? error.message : 'No se pudo completar este movimiento.');
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
    router.push({
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
      setMyQrMessage(error instanceof Error ? error.message : 'No se pudo crear tu QR.');
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

            <View style={styles.searchWrap}>
              <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
              <AppTextInput
                autoCapitalize="words"
                autoCorrect={false}
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

                  {busyKey === 'load-contacts' ? (
                    <Text style={styles.helperText}>Leyendo tu agenda...</Text>
                  ) : null}

                  {renderContactSection('En Happy Circles', inAppContacts)}
                  {renderContactSection('Invitar a Happy Circles', inviteContacts)}

                  {displayedContacts.length === 0 && busyKey !== 'load-contacts' ? (
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
              {pendingContactSelection?.phoneOptions.map((phoneOption) => {
                const resolution = targetCache[phoneOption.phoneE164] ?? null;
                const action = actionMetaForResolution(resolution, false);
                const disabled = action.disabled || busyKey === phoneOption.phoneE164;

                return (
                  <View key={phoneOption.id} style={styles.optionRow}>
                    <View style={styles.contactCopy}>
                      <Text style={styles.contactName}>{contactMeta(phoneOption)}</Text>
                      <Text style={styles.contactPhone}>
                        {resolution?.status === 'active_user'
                          ? 'En Happy Circles'
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
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 50,
    paddingHorizontal: theme.spacing.sm,
  },
  searchInput: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    elevation: 0,
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: 0,
    shadowOpacity: 0,
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
