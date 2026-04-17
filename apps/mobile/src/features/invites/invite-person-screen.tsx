import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Contacts from 'expo-contacts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Modal, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { AppTextInput } from '@/components/app-text-input';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { appConfig } from '@/lib/config';
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
  type PeopleOutreachResult,
  type PeopleTargetResolution,
  useCreatePeopleOutreachMutation,
  useResolvePeopleTargetsMutation,
} from '@/lib/live-data';
import { buildPhoneE164, COUNTRY_OPTIONS, DEFAULT_COUNTRY, normalizePhoneDigits } from '@/lib/phone';
import { theme } from '@/lib/theme';

type FriendshipOrAccountResult = PeopleOutreachResult['result'];

type ContactPhoneOption = {
  readonly id: string;
  readonly label: string | null;
  readonly phoneE164: string;
  readonly maskedPhone: string;
};

type ContactCandidate = {
  readonly contactId: string;
  readonly alias: string;
  readonly phoneOptions: readonly ContactPhoneOption[];
  readonly primaryPhone: ContactPhoneOption;
  readonly searchKey: string;
};

type PendingContactSelection = {
  readonly contactId: string;
  readonly alias: string;
  readonly phoneOptions: readonly ContactPhoneOption[];
};

function buildAppInviteLink(deliveryToken: string): string {
  return `${appConfig.appWebOrigin.replace(/\/$/, '')}/join/${deliveryToken}`;
}

function buildAccountInviteShareMessage(input: {
  readonly inviteeAlias: string;
  readonly amountMinor: number | null;
  readonly direction: 'i_owe' | 'owes_me' | null;
  readonly description: string | null;
  readonly inviteLink: string;
}): string {
  const alias = input.inviteeAlias.trim();
  const prefix = alias.length > 0 ? `Hola ${alias},` : 'Hola,';

  if (input.amountMinor && input.amountMinor > 0 && input.direction) {
    const movementText =
      input.direction === 'i_owe'
        ? `una salida de ${formatCop(input.amountMinor)}`
        : `una entrada de ${formatCop(input.amountMinor)}`;
    const descriptionText =
      input.description && input.description.trim().length > 0
        ? ` por ${input.description.trim()}`
        : '';

    return `${prefix} te comparti un acceso privado a Happy Circles para registrar ${movementText}${descriptionText}. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
  }

  return `${prefix} te comparti un acceso privado a Happy Circles para que entres y te conectes conmigo. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
}

function maskPhoneValue(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (digits.length < 4) {
    return value;
  }

  return `***${digits.slice(-4)}`;
}

function formatPhonePreview(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (digits.length === 0) {
    return value;
  }

  if (value.trim().startsWith('+')) {
    return `+${digits}`;
  }

  return digits;
}

function resolveContactName(contact: Contacts.Contact | Contacts.ExistingContact): string {
  const normalizedName = contact.name?.trim();
  if (normalizedName) {
    return normalizedName;
  }

  const composedName = [contact.firstName, contact.middleName, contact.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ')
    .trim();

  if (composedName.length > 0) {
    return composedName;
  }

  return 'Contacto';
}

function findCountryOptionByPhoneNumber(rawNumber: string) {
  const trimmed = rawNumber.trim();
  if (!trimmed.startsWith('+')) {
    return DEFAULT_COUNTRY;
  }

  const digits = normalizePhoneDigits(trimmed);
  const sortedOptions = [...COUNTRY_OPTIONS].sort(
    (left, right) =>
      normalizePhoneDigits(right.callingCode).length - normalizePhoneDigits(left.callingCode).length,
  );

  for (const option of sortedOptions) {
    if (digits.startsWith(normalizePhoneDigits(option.callingCode))) {
      return option;
    }
  }

  return DEFAULT_COUNTRY;
}

function buildManualPhoneE164(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('+')) {
    const digits = normalizePhoneDigits(trimmed);
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digits = normalizePhoneDigits(trimmed);
  if (digits.length < 8) {
    return null;
  }

  return buildPhoneE164(DEFAULT_COUNTRY.callingCode, digits);
}

function extractInviteToken(scannedValue: string): string | null {
  const normalized = scannedValue.trim();
  if (normalized.length === 0) {
    return null;
  }

  const httpsMatch = normalized.match(/\/invite\/([^/?#]+)/i);
  if (httpsMatch?.[1]) {
    return httpsMatch[1];
  }

  const deepLinkMatch = normalized.match(/happycircles:\/\/invite\/([^/?#]+)/i);
  if (deepLinkMatch?.[1]) {
    return deepLinkMatch[1];
  }

  const rawTokenMatch = normalized.match(/^[a-z0-9]{12,}$/i);
  if (rawTokenMatch?.[0]) {
    return rawTokenMatch[0];
  }

  return null;
}

function isAccountInviteDeliveryResult(
  value: FriendshipOrAccountResult | undefined,
): value is AccountInviteDeliveryResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'deliveryToken' in value &&
      typeof value.deliveryToken === 'string',
  );
}

function buildContactPhoneOptions(contact: Contacts.Contact | Contacts.ExistingContact): ContactPhoneOption[] {
  const phoneNumbers = contact.phoneNumbers ?? [];

  return phoneNumbers.flatMap((phoneNumber, index) => {
    const rawNumber = phoneNumber.number?.trim();
    if (!rawNumber) {
      return [];
    }

    const country = findCountryOptionByPhoneNumber(rawNumber);
    const digits = normalizePhoneDigits(rawNumber);
    const callingCodeDigits = normalizePhoneDigits(country.callingCode);
    const nationalNumber =
      rawNumber.startsWith('+') && digits.startsWith(callingCodeDigits)
        ? digits.slice(callingCodeDigits.length)
        : digits;
    const phoneE164 = rawNumber.startsWith('+')
      ? `+${digits}`
      : buildPhoneE164(country.callingCode, nationalNumber);

    if (normalizePhoneDigits(phoneE164).length < 8) {
      return [];
    }

    return [
      {
        id: typeof phoneNumber.id === 'string' ? phoneNumber.id : `phone-${index}`,
        label:
          typeof phoneNumber.label === 'string' && phoneNumber.label.trim().length > 0
            ? phoneNumber.label.trim()
            : null,
        phoneE164,
        maskedPhone: maskPhoneValue(phoneE164),
      },
    ];
  });
}

async function readContactsFromDevice(): Promise<readonly ContactCandidate[]> {
  const response = await Contacts.getContactsAsync({
    fields: [
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.MiddleName,
      Contacts.Fields.LastName,
      Contacts.Fields.PhoneNumbers,
    ],
  });

  const records: ContactCandidate[] = [];
  for (const contact of response.data) {
    const alias = resolveContactName(contact);
    const phoneOptions = buildContactPhoneOptions(contact);
    if (phoneOptions.length === 0) {
      continue;
    }

    records.push({
      contactId: contact.id,
      alias,
      phoneOptions,
      primaryPhone: phoneOptions[0],
      searchKey: `${alias} ${phoneOptions.map((option) => option.phoneE164).join(' ')}`.toLocaleLowerCase('es-CO'),
    });
  }

  return records.sort((left, right) => left.alias.localeCompare(right.alias, 'es-CO'));
}

function badgeForResolution(
  resolution: PeopleTargetResolution | null,
): { readonly label: string; readonly tone: 'neutral' | 'success' | 'warning' | 'primary' } {
  if (!resolution) {
    return {
      label: 'Revisando',
      tone: 'neutral',
    };
  }

  if (resolution.status === 'already_related') {
    return {
      label: 'Conectados',
      tone: 'success',
    };
  }

  if (resolution.status === 'pending_friendship') {
    return {
      label: 'Solicitud pendiente',
      tone: 'primary',
    };
  }

  if (resolution.status === 'active_user') {
    return {
      label: 'En Happy Circles',
      tone: 'success',
    };
  }

  return {
    label: 'Invite to app',
    tone: 'warning',
  };
}

function actionLabelForResolution(resolution: PeopleTargetResolution | null): string {
  if (!resolution) {
    return 'Revisar contacto';
  }

  if (resolution.status === 'already_related') {
    return 'Ya estan conectados';
  }

  if (resolution.status === 'pending_friendship' || resolution.status === 'pending_activation') {
    return 'Ya tiene una invitacion pendiente';
  }

  if (resolution.status === 'active_user') {
    return 'Enviar solicitud de amistad';
  }

  return 'Invitar a Happy Circles';
}

function canPressForResolution(resolution: PeopleTargetResolution | null): boolean {
  if (!resolution) {
    return true;
  }

  return resolution.status !== 'already_related' && resolution.status !== 'pending_friendship';
}

function buildContactMeta(contact: ContactCandidate): string {
  const primaryLine = [contact.primaryPhone.label, formatPhonePreview(contact.primaryPhone.phoneE164)]
    .filter(Boolean)
    .join(' | ');

  if (contact.phoneOptions.length === 1) {
    return primaryLine;
  }

  return `${primaryLine} · ${contact.phoneOptions.length} numeros`;
}

export function InvitePersonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    amountMinor?: string;
    direction?: string;
    description?: string;
  }>();
  const createPeopleOutreach = useCreatePeopleOutreachMutation();
  const resolvePeopleTargets = useResolvePeopleTargetsMutation();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const transactionAmountMinor =
    typeof params.amountMinor === 'string' ? Number.parseInt(params.amountMinor, 10) : Number.NaN;
  const transactionDirection =
    params.direction === 'i_owe' || params.direction === 'owes_me' ? params.direction : null;
  const transactionDescription = typeof params.description === 'string' ? params.description : null;

  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [contactsPermissionStatus, setContactsPermissionStatus] =
    useState<ContactsPermissionStatus>('undetermined');
  const [contacts, setContacts] = useState<readonly ContactCandidate[]>([]);
  const [targetCache, setTargetCache] = useState<Record<string, PeopleTargetResolution>>({});
  const [searchValue, setSearchValue] = useState('');
  const [manualAlias, setManualAlias] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualInviteInput, setManualInviteInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [pendingContactSelection, setPendingContactSelection] =
    useState<PendingContactSelection | null>(null);

  const filteredContacts = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLocaleLowerCase('es-CO');
    if (normalizedSearch.length === 0) {
      return contacts;
    }

    return contacts.filter((contact) => contact.searchKey.includes(normalizedSearch));
  }, [contacts, searchValue]);

  const displayedContacts = useMemo(
    () => filteredContacts.slice(0, searchValue.trim().length > 0 ? 60 : 28),
    [filteredContacts, searchValue],
  );
  const canReadContacts = canReadContactsPermissionStatus(contactsPermissionStatus);
  const contactsStatusLabel =
    contactsPermissionStatus === 'granted'
      ? 'Badges activos'
      : contactsPermissionStatus === 'limited'
        ? 'Agenda parcial'
        : 'Sin agenda todavia';
  const contactsStatusTone =
    contactsPermissionStatus === 'granted'
      ? 'success'
      : contactsPermissionStatus === 'limited'
        ? 'warning'
        : 'warning';
  const contactsHelperMessage =
    contactsPermissionStatus === 'limited'
      ? 'Tu telefono solo compartio los contactos seleccionados. Si quieres ver mas, amplia el acceso desde aqui.'
      : 'Verde significa que ya existe una cuenta activa en Happy Circles. Naranja significa que todavia necesita acceso.';

  const manualPhoneE164 = useMemo(() => buildManualPhoneE164(manualPhone), [manualPhone]);

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
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (!canReadContacts || displayedContacts.length === 0) {
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
      .then((resolutions) => {
        mergeTargetResolutions(resolutions);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : 'No se pudo revisar esta parte de tu agenda.');
      });
  }, [
    canReadContacts,
    displayedContacts,
    mergeTargetResolutions,
    resolvePeopleTargets,
    targetCache,
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
        setMessage('Puedes seguir invitando por celular, aunque no usemos tu agenda todavia.');
        return;
      }

      const nextContacts = await readContactsFromDevice();
      setContacts(nextContacts);
      setMessage(
        nextStatus === 'limited'
          ? `Tu telefono compartio ${nextContacts.length} contactos con numero. Si quieres ver mas, amplia el acceso.`
          : 'Tu agenda ya quedo lista para revisar quien ya esta en Happy Circles.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir el permiso de contactos.');
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
        setMessage('La agenda dejo de estar disponible. Puedes seguir invitando por celular.');
        return;
      }

      const nextContacts = await readContactsFromDevice();
      setContacts(nextContacts);
      setMessage(
        nextStatus === 'limited'
          ? `Seguimos con acceso parcial. Ahora vemos ${nextContacts.length} contactos con numero.`
          : `Listo. Ahora vemos ${nextContacts.length} contactos con numero en tu agenda.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo ampliar el acceso a tus contactos.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function ensurePhoneStatuses(phoneE164List: readonly string[]) {
    const missingPhones = [...new Set(phoneE164List.filter((phoneE164) => !targetCache[phoneE164]))];
    if (missingPhones.length === 0) {
      return;
    }

    const resolutions = await resolvePeopleTargets.mutateAsync(missingPhones);
    mergeTargetResolutions(resolutions);
  }

  async function shareAccountInviteLink(alias: string, delivery: AccountInviteDeliveryResult) {
    const inviteLink = buildAppInviteLink(delivery.deliveryToken);
    const shareMessage = buildAccountInviteShareMessage({
      inviteeAlias: alias,
      amountMinor:
        Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 ? transactionAmountMinor : null,
      direction: transactionDirection,
      description: transactionDescription,
      inviteLink,
    });

    try {
      await Share.share({
        title: 'Invitacion a Happy Circles',
        message: shareMessage,
      });
      setMessage(`Listo. Ya puedes compartir el acceso privado con ${alias}.`);
    } catch {
      await Clipboard.setStringAsync(inviteLink);
      setMessage(`No pudimos abrir el menu para compartir. Copiamos el link privado de ${alias}.`);
    }
  }

  function updateCacheFromOutreach(phoneE164: string, alias: string, response: PeopleOutreachResult) {
    if (response.kind === 'already_related') {
      mergeTargetResolutions([
        {
          phoneE164,
          status: 'already_related',
          matchedUserId: response.matchedUserId,
          displayName: response.displayName ?? alias,
          avatarPath: null,
          relationshipId: response.relationshipId ?? null,
          friendshipInviteId: null,
          accountInviteId: null,
          accountInviteStatus: null,
        },
      ]);
      return;
    }

    if (response.kind === 'friendship') {
      mergeTargetResolutions([
        {
          phoneE164,
          status: 'pending_friendship',
          matchedUserId: response.matchedUserId,
          displayName: response.displayName ?? alias,
          avatarPath: null,
          relationshipId: response.relationshipId ?? null,
          friendshipInviteId: response.inviteId ?? null,
          accountInviteId: null,
          accountInviteStatus: null,
        },
      ]);
      return;
    }

    const accountInviteId =
      isAccountInviteDeliveryResult(response.result) && typeof response.result.inviteId === 'string'
        ? response.result.inviteId
        : response.inviteId ?? null;

    mergeTargetResolutions([
      {
        phoneE164,
        status: 'pending_activation',
        matchedUserId: response.matchedUserId,
        displayName: response.displayName ?? alias,
        avatarPath: null,
        relationshipId: null,
        friendshipInviteId: null,
        accountInviteId,
        accountInviteStatus: 'pending_activation',
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
        sourceContext: input.sourceContext,
        intendedRecipientAlias: input.alias,
        intendedRecipientPhoneE164: input.phoneE164,
        intendedRecipientPhoneLabel: input.phoneLabel ?? undefined,
      });

      updateCacheFromOutreach(input.phoneE164, input.alias, response);

      if (response.kind === 'already_related') {
        setMessage(`${input.alias} ya aparece en tus personas.`);
        return;
      }

      if (response.kind === 'friendship') {
        setMessage(
          response.status === 'pending_friendship'
            ? `${input.alias} ya tiene una solicitud de amistad pendiente.`
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
        sourceContext: 'people_screen_contact_list',
      });
      return;
    }

    try {
      await ensurePhoneStatuses(contact.phoneOptions.map((phoneOption) => phoneOption.phoneE164));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo revisar los numeros de este contacto.');
    }

    setPendingContactSelection({
      contactId: contact.contactId,
      alias: contact.alias,
      phoneOptions: contact.phoneOptions,
    });
  }

  async function handleManualInvite() {
    if (!manualPhoneE164 || busyKey) {
      return;
    }

    await handleCreateOutreach({
      alias: manualAlias.trim() || 'Contacto',
      phoneE164: manualPhoneE164,
      sourceContext: 'people_screen_manual_phone',
    });
  }

  function navigateToInviteToken(rawValue: string) {
    const token = extractInviteToken(rawValue);
    if (!token) {
      setMessage('Pega un link completo o un codigo valido de invitacion.');
      return;
    }

    setManualInviteInput('');
    setScannerOpen(false);
    router.push({
      pathname: '/invite/[token]',
      params: { token },
    });
  }

  async function handlePasteManualInvite() {
    if (busyKey) {
      return;
    }

    setBusyKey('paste-manual');
    setMessage(null);

    try {
      const value = await Clipboard.getStringAsync();
      if (!value.trim()) {
        setMessage('No encontramos nada en el portapapeles.');
        return;
      }

      setManualInviteInput(value);
      navigateToInviteToken(value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el portapapeles.');
    } finally {
      setBusyKey(null);
    }
  }

  function handleSubmitManualInvite() {
    if (busyKey) {
      return;
    }

    setMessage(null);
    navigateToInviteToken(manualInviteInput);
  }

  async function handleOpenScanner() {
    if (cameraPermission?.granted) {
      setScannerLocked(false);
      setScannerOpen((current) => !current);
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

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scannerLocked) {
      return;
    }

    const token = extractInviteToken(result.data);
    if (!token) {
      setScannerLocked(true);
      setMessage('Ese QR no parece ser una invitacion valida de Happy Circles.');
      setTimeout(() => {
        setScannerLocked(false);
      }, 1200);
      return;
    }

    setScannerLocked(true);
    setScannerOpen(false);
    router.push({
      pathname: '/invite/[token]',
      params: { token },
    });
  }

  return (
    <ScreenShell
      footer={
        <View style={styles.footer}>
          <PrimaryAction label="Cerrar" onPress={() => router.dismiss()} variant="ghost" />
        </View>
      }
      headerVariant="plain"
      largeTitle={false}
      subtitle="Tu agenda decide si esta persona recibe amistad o un acceso privado a la app."
      title="Personas"
      titleSize="title1"
    >
      {message ? <MessageBanner message={message} /> : null}

      {Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 && transactionDirection ? (
        <SurfaceCard padding="md" variant="muted">
          <Text style={styles.contextLabel}>Contexto</Text>
          <Text style={styles.contextBody}>
            {transactionDirection === 'i_owe' ? 'Salida' : 'Entrada'} de {formatCop(transactionAmountMinor)}
            {transactionDescription && transactionDescription.trim().length > 0
              ? ` por ${transactionDescription.trim()}`
              : ''}
          </Text>
        </SurfaceCard>
      ) : null}

      <SurfaceCard padding="md" variant="elevated">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tu agenda</Text>
          <StatusChip label={contactsStatusLabel} tone={contactsStatusTone} />
        </View>

        <Text style={styles.helper}>{contactsHelperMessage}</Text>

        {canReadContacts ? (
          <View style={styles.stack}>
            {contactsPermissionStatus === 'limited' ? (
              <PrimaryAction
                label={busyKey === 'expand-contacts' ? 'Abriendo agenda...' : 'Ver mas contactos'}
                onPress={busyKey ? undefined : () => void handleExpandLimitedContactsAccess()}
                variant="secondary"
              />
            ) : null}

            <AppTextInput
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={setSearchValue}
              placeholder="Buscar por nombre o celular"
              placeholderTextColor={theme.colors.muted}
              value={searchValue}
            />

            {busyKey === 'load-contacts' ? <Text style={styles.helper}>Leyendo tu agenda...</Text> : null}

            {displayedContacts.length > 0 ? (
              <View style={styles.contactList}>
                {displayedContacts.map((contact) => {
                  const resolution = targetCache[contact.primaryPhone.phoneE164] ?? null;
                  const badge = badgeForResolution(resolution);
                  const actionLabel =
                    contact.phoneOptions.length > 1 ? 'Elegir numero' : actionLabelForResolution(resolution);
                  const actionEnabled =
                    contact.phoneOptions.length > 1 ? true : canPressForResolution(resolution);
                  const isBusy = busyKey === contact.primaryPhone.phoneE164;

                  return (
                    <SurfaceCard key={`${contact.contactId}:${contact.primaryPhone.id}`} padding="md" variant="default">
                      <View style={styles.contactRow}>
                        <View style={styles.contactCopy}>
                          <View style={styles.contactTitleRow}>
                            <Text style={styles.contactName}>{contact.alias}</Text>
                            <StatusChip label={badge.label} tone={badge.tone} />
                          </View>
                          <Text style={styles.contactMeta}>{buildContactMeta(contact)}</Text>
                        </View>
                        <View style={styles.contactAction}>
                          <PrimaryAction
                            compact
                            disabled={!actionEnabled || isBusy}
                            label={isBusy ? 'Procesando...' : actionLabel}
                            onPress={!actionEnabled || isBusy ? undefined : () => void handleContactPress(contact)}
                            variant={resolution?.status === 'active_user' ? 'secondary' : 'primary'}
                          />
                        </View>
                      </View>
                    </SurfaceCard>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.helper}>
                {searchValue.trim().length > 0
                  ? 'No encontramos contactos con ese filtro.'
                  : contactsPermissionStatus === 'limited'
                    ? 'No encontramos mas contactos compartidos con numeros utiles. Amplia el acceso para ver el resto.'
                    : 'No encontramos contactos con numeros utiles en esta agenda.'}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.stack}>
            <Text style={styles.helper}>
              Puedes dar permiso a tus contactos para ver rapidamente quien ya esta en Happy Circles, o seguir por celular manual.
            </Text>
            {contactsPermissionStatus !== 'unavailable' ? (
              <PrimaryAction
                label={busyKey === 'request-contacts' ? 'Abriendo permiso...' : 'Usar mi agenda'}
                onPress={busyKey ? undefined : () => void requestContactsAccess()}
                variant="secondary"
              />
            ) : null}
          </View>
        )}
      </SurfaceCard>

      <SurfaceCard padding="md" variant="default">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Invitar por celular</Text>
          <StatusChip label="Fallback light" tone="neutral" />
        </View>

        <View style={styles.stack}>
          <AppTextInput
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setManualAlias}
            placeholder="Nombre del contacto"
            placeholderTextColor={theme.colors.muted}
            value={manualAlias}
          />
          <AppTextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            onChangeText={setManualPhone}
            placeholder="Celular (puede llevar +57)"
            placeholderTextColor={theme.colors.muted}
            value={manualPhone}
          />
          <Text style={styles.helper}>
            {manualPhoneE164
              ? `Usaremos ${manualPhoneE164}`
              : 'Si no empieza por +, asumimos el codigo de Colombia por defecto.'}
          </Text>
          <PrimaryAction
            disabled={!manualPhoneE164 || Boolean(busyKey)}
            label={busyKey === manualPhoneE164 ? 'Preparando...' : 'Resolver este contacto'}
            onPress={busyKey ? undefined : () => void handleManualInvite()}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard padding="md" variant="muted">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ya tienes una invitacion de amistad</Text>
          <StatusChip label="Receiver" tone="primary" />
        </View>

        <View style={styles.stack}>
          <AppTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setManualInviteInput}
            placeholder="Pega el link o codigo"
            placeholderTextColor={theme.colors.muted}
            value={manualInviteInput}
          />
          <PrimaryAction
            label={busyKey === 'paste-manual' ? 'Pegando...' : 'Pegar desde portapapeles'}
            onPress={busyKey ? undefined : () => void handlePasteManualInvite()}
            variant="secondary"
          />
          <PrimaryAction label="Abrir invitacion" onPress={busyKey ? undefined : handleSubmitManualInvite} />
          <PrimaryAction
            label={scannerOpen ? 'Cerrar scanner' : 'Escanear QR'}
            onPress={() => void handleOpenScanner()}
            variant="ghost"
          />

          {scannerOpen ? (
            <View style={styles.scannerWrap}>
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleBarcodeScanned}
                style={styles.scanner}
              />
            </View>
          ) : null}
        </View>
      </SurfaceCard>

      <Modal
        animationType="fade"
        onRequestClose={() => setPendingContactSelection(null)}
        transparent
        visible={pendingContactSelection !== null}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPendingContactSelection(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Elige el numero</Text>
            <Text style={styles.helper}>
              {pendingContactSelection
                ? `${pendingContactSelection.alias} tiene varios numeros. Elige el correcto.`
                : ''}
            </Text>
            <View style={styles.modalActions}>
              {pendingContactSelection?.phoneOptions.map((phoneOption) => {
                const resolution = targetCache[phoneOption.phoneE164] ?? null;
                const badge = badgeForResolution(resolution);
                const actionLabel = actionLabelForResolution(resolution);
                const disabled = !canPressForResolution(resolution) || busyKey === phoneOption.phoneE164;

                return (
                  <SurfaceCard key={phoneOption.id} padding="sm" variant="default">
                    <View style={styles.modalOptionRow}>
                      <View style={styles.modalOptionCopy}>
                        <Text style={styles.modalOptionLabel}>
                          {phoneOption.label
                            ? `${phoneOption.label} | ${formatPhonePreview(phoneOption.phoneE164)}`
                            : formatPhonePreview(phoneOption.phoneE164)}
                        </Text>
                        <StatusChip label={badge.label} tone={badge.tone} />
                      </View>
                      <PrimaryAction
                        compact
                        disabled={disabled}
                        label={busyKey === phoneOption.phoneE164 ? 'Procesando...' : actionLabel}
                        onPress={
                          disabled || !pendingContactSelection
                            ? undefined
                            : () => {
                                setPendingContactSelection(null);
                                void handleCreateOutreach({
                                  alias: pendingContactSelection.alias,
                                  phoneE164: phoneOption.phoneE164,
                                  phoneLabel: phoneOption.label,
                                  sourceContext: 'people_screen_contact_option',
                                });
                              }
                        }
                        variant={resolution?.status === 'active_user' ? 'secondary' : 'primary'}
                      />
                    </View>
                  </SurfaceCard>
                );
              })}
              <PrimaryAction label="Cancelar" onPress={() => setPendingContactSelection(null)} variant="ghost" />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
  },
  stack: {
    gap: theme.spacing.md,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
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
  contactList: {
    gap: theme.spacing.sm,
  },
  contactRow: {
    gap: theme.spacing.sm,
  },
  contactCopy: {
    gap: 6,
  },
  contactTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  contactName: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  contactMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  contactAction: {
    width: '100%',
  },
  scannerWrap: {
    borderRadius: theme.radius.large,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  scanner: {
    minHeight: 280,
    width: '100%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(6, 11, 20, 0.7)',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxWidth: 420,
    padding: theme.spacing.lg,
    width: '100%',
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
  },
  modalActions: {
    gap: theme.spacing.sm,
  },
  modalOptionRow: {
    gap: theme.spacing.sm,
  },
  modalOptionCopy: {
    gap: theme.spacing.xs,
  },
  modalOptionLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
});
