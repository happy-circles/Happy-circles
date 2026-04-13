import { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceChip } from '@/components/choice-chip';
import { EmptyState } from '@/components/empty-state';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SegmentedControl } from '@/components/segmented-control';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import {
  useAcceptRelationshipInviteMutation,
  useAppSnapshot,
  useCreateShareableInviteMutation,
  useCreateWhatsAppInviteMutation,
  useRejectRelationshipInviteMutation,
} from '@/lib/live-data';
import {
  buildPhoneE164,
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  formatPhoneForWhatsApp,
  normalizePhoneDigits,
  type CountryOption,
} from '@/lib/phone';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

type InviteSegment = 'pending' | 'history';
type ContactPhoneOption = {
  readonly key: string;
  readonly label: string;
  readonly nationalNumber: string;
  readonly countryIso: string;
  readonly callingCode: string;
};
type ContactPhonePickerState = {
  readonly contactName: string;
  readonly options: readonly ContactPhoneOption[];
};

const COUNTRY_OPTIONS_BY_CALLING_CODE = [...COUNTRY_OPTIONS].sort(
  (left, right) =>
    normalizePhoneDigits(right.callingCode).length - normalizePhoneDigits(left.callingCode).length,
);

function findCountryOptionByIso2(iso2: string | null | undefined): CountryOption | null {
  if (!iso2) {
    return null;
  }

  const normalizedIso2 = iso2.trim().toUpperCase();
  return COUNTRY_OPTIONS.find((country) => country.iso2 === normalizedIso2) ?? null;
}

function findCountryOptionByPhoneNumber(rawNumber: string): CountryOption | null {
  if (!rawNumber.trim().startsWith('+')) {
    return null;
  }

  const normalizedDigits = normalizePhoneDigits(rawNumber);
  return (
    COUNTRY_OPTIONS_BY_CALLING_CODE.find((country) =>
      normalizedDigits.startsWith(normalizePhoneDigits(country.callingCode)),
    ) ?? null
  );
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

function buildContactPhoneOptions(
  contact: Contacts.ExistingContact,
  fallbackCountryIso: string,
): ContactPhoneOption[] {
  const fallbackCountry = findCountryOptionByIso2(fallbackCountryIso) ?? DEFAULT_COUNTRY;
  const seenNumbers = new Set<string>();

  return (contact.phoneNumbers ?? []).flatMap((phoneNumber, index) => {
    const rawNumber = phoneNumber.number?.trim() ?? '';
    const fallbackDigits = phoneNumber.digits ?? '';
    const normalizedDigits = normalizePhoneDigits(rawNumber || fallbackDigits);
    if (normalizedDigits.length === 0) {
      return [];
    }

    const country =
      findCountryOptionByIso2(phoneNumber.countryCode) ??
      findCountryOptionByPhoneNumber(rawNumber) ??
      fallbackCountry;
    const normalizedCallingCode = normalizePhoneDigits(country.callingCode);
    const nationalNumber =
      rawNumber.startsWith('+') && normalizedDigits.startsWith(normalizedCallingCode)
        ? normalizedDigits.slice(normalizedCallingCode.length)
        : normalizedDigits;

    if (nationalNumber.length === 0) {
      return [];
    }

    const dedupeKey = buildPhoneE164(country.callingCode, nationalNumber);
    if (seenNumbers.has(dedupeKey)) {
      return [];
    }

    seenNumbers.add(dedupeKey);

    const label = phoneNumber.label?.trim().length ? phoneNumber.label.trim() : `Numero ${index + 1}`;
    const displayNumber =
      rawNumber.length > 0 ? rawNumber : `${country.callingCode} ${nationalNumber}`;

    return [
      {
        key: phoneNumber.id ?? dedupeKey,
        label: `${label} | ${displayNumber}`,
        nationalNumber,
        countryIso: country.iso2,
        callingCode: country.callingCode,
      },
    ];
  });
}

function formatInviteDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return 'reciente';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function buildWhatsAppInviteMessage(input: {
  readonly inviteeName: string;
  readonly amountMinor: number | null;
  readonly direction: 'i_owe' | 'owes_me' | null;
  readonly description: string | null;
}): string {
  const inviteeName = input.inviteeName;
  const prefix = inviteeName.trim().length > 0 ? `Hola ${inviteeName.trim()},` : 'Hola,';

  if (input.amountMinor && input.amountMinor > 0 && input.direction) {
    const movementText =
      input.direction === 'i_owe'
        ? `una salida de ${formatCop(input.amountMinor)}`
        : `una entrada de ${formatCop(input.amountMinor)}`;
    const descriptionText =
      input.description && input.description.trim().length > 0
        ? ` por ${input.description.trim()}`
        : '';

    return `${prefix} quiero registrar ${movementText}${descriptionText} en Happy Circles. Registrate con este mismo numero para que la propuesta te aparezca dentro de la app.`;
  }

  return `${prefix} te invito a Happy Circles para llevar saldos y movimientos entre amigos sin enredos. Registrate con este mismo numero para que la invitacion te aparezca dentro de la app.`;
}

function inviteChipTone(status: string): StatusChipProps['tone'] {
  if (status === 'accepted') {
    return 'success';
  }

  if (status === 'rejected' || status === 'expired' || status === 'canceled') {
    return 'danger';
  }

  if (status === 'pending' || status === 'requires_you') {
    return 'warning';
  }

  if (status === 'matched') {
    return 'primary';
  }

  return 'neutral';
}

function inviteStatusLabel(status: string): string {
  if (status === 'accepted') {
    return 'Aceptada';
  }

  if (status === 'rejected') {
    return 'Rechazada';
  }

  if (status === 'expired') {
    return 'Expirada';
  }

  if (status === 'canceled') {
    return 'Cancelada';
  }

  if (status === 'matched') {
    return 'Enlazada';
  }

  if (status === 'requires_you') {
    return 'Por responder';
  }

  if (status === 'waiting_other_side') {
    return 'En espera';
  }

  return 'Pendiente';
}

function contactTrackingPresentation(invite: {
  readonly status: string;
  readonly relationshipInviteStatus: string | null;
}): { readonly label: string; readonly tone: StatusChipProps['tone'] } {
  if (invite.relationshipInviteStatus) {
    return {
      label: inviteStatusLabel(invite.relationshipInviteStatus),
      tone: inviteChipTone(invite.relationshipInviteStatus),
    };
  }

  if (invite.status === 'matched') {
    return {
      label: 'Enlazada',
      tone: 'primary',
    };
  }

  if (invite.status === 'canceled') {
    return {
      label: 'Cancelada',
      tone: 'danger',
    };
  }

  return {
    label: 'Pendiente afuera',
    tone: 'neutral',
  };
}

function extractConnectionToken(scannedValue: string): string | null {
  const normalized = scannedValue.trim();
  if (normalized.length === 0) {
    return null;
  }

  const deepLinkMatch = normalized.match(/(?:happycircles:\/\/connect\/)([^/?#]+)/i);
  if (deepLinkMatch?.[1]) {
    return deepLinkMatch[1];
  }

  const rawTokenMatch = normalized.match(/^[a-z0-9]{12,}$/i);
  if (rawTokenMatch?.[0]) {
    return rawTokenMatch[0];
  }

  return null;
}

export function InvitePersonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    inviteeName?: string;
    amountMinor?: string;
    direction?: string;
    description?: string;
  }>();
  const { profile } = useSession();
  const snapshotQuery = useAppSnapshot();
  const createWhatsAppInvite = useCreateWhatsAppInviteMutation();
  const createShareableInvite = useCreateShareableInviteMutation();
  const acceptInvite = useAcceptRelationshipInviteMutation();
  const rejectInvite = useRejectRelationshipInviteMutation();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const initialInviteeName = typeof params.inviteeName === 'string' ? params.inviteeName : '';
  const transactionAmountMinor =
    typeof params.amountMinor === 'string' ? Number.parseInt(params.amountMinor, 10) : Number.NaN;
  const transactionDirection =
    params.direction === 'i_owe' || params.direction === 'owes_me' ? params.direction : null;
  const transactionDescription = typeof params.description === 'string' ? params.description : null;

  const [inviteeName, setInviteeName] = useState(initialInviteeName);
  const [phoneNationalNumber, setPhoneNationalNumber] = useState('');
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY.iso2);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [segment, setSegment] = useState<InviteSegment>('pending');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [contactPhonePicker, setContactPhonePicker] = useState<ContactPhonePickerState | null>(null);

  const selectedCountry = useMemo(
    () => COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY,
    [countryIso],
  );
  const currentUserProfile = snapshotQuery.data?.currentUserProfile;
  const incomingInvites = snapshotQuery.data?.incomingInvites ?? [];
  const outgoingInvites = snapshotQuery.data?.outgoingInvites ?? [];
  const whatsappInvites = snapshotQuery.data?.whatsappInvites ?? [];
  const historyInviteItems = snapshotQuery.data?.inviteHistory ?? [];
  const externalPendingInvites = useMemo(
    () =>
      whatsappInvites.filter(
        (invite) => invite.status === 'pending' && !invite.relationshipInviteStatus,
      ),
    [whatsappInvites],
  );
  const externalHistoryInvites = useMemo(
    () =>
      whatsappInvites.filter(
        (invite) => invite.status !== 'pending' && !invite.relationshipInviteStatus,
      ),
    [whatsappInvites],
  );
  const profileConnectionToken = currentUserProfile?.publicConnectionToken ?? profile?.public_connection_token ?? null;
  const profileConnectionLink = profileConnectionToken
    ? `happycircles://connect/${profileConnectionToken}`
    : null;

  function applySelectedContact(contactName: string, phoneOption: ContactPhoneOption) {
    setInviteeName(contactName);
    setCountryIso(phoneOption.countryIso);
    setPhoneNationalNumber(phoneOption.nationalNumber);
    setContactPhonePicker(null);
    setMessage(`Precargamos ${contactName} con ${phoneOption.label}.`);
  }

  async function handlePickContact() {
    if (busyKey) {
      return;
    }

    if (Platform.OS === 'web') {
      setMessage('Elegir desde contactos solo esta disponible en iOS y Android.');
      return;
    }

    setBusyKey('pick-contact');
    setMessage(null);

    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setMessage('Necesitamos permiso de contactos para rellenar nombre y celular desde tu agenda.');
        return;
      }

      const pickedContact = await Contacts.presentContactPickerAsync();
      if (!pickedContact) {
        return;
      }

      const contact =
        (await Contacts.getContactByIdAsync(pickedContact.id, [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.MiddleName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
        ])) ?? pickedContact;
      const contactName = resolveContactName(contact);
      const phoneOptions = buildContactPhoneOptions(contact, selectedCountry.iso2);

      if (phoneOptions.length === 0) {
        setMessage('Ese contacto no tiene numeros validos para usar en la invitacion.');
        return;
      }

      if (phoneOptions.length === 1) {
        applySelectedContact(contactName, phoneOptions[0]);
        return;
      }

      setContactPhonePicker({
        contactName,
        options: phoneOptions,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir tu agenda.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateInvite() {
    setBusyKey('create-whatsapp');
    setMessage(null);

    try {
      const response = await createWhatsAppInvite.mutateAsync({
        inviteeName,
        phoneCountryIso2: selectedCountry.iso2,
        phoneCountryCallingCode: selectedCountry.callingCode,
        phoneNationalNumber,
      });

      if (response.status === 'matched') {
        setInviteeName('');
        setPhoneNationalNumber('');
        setMessage('Ese celular ya pertenece a una cuenta. Dejamos la invitacion interna pendiente dentro de la app.');
        setSegment('pending');
        return;
      }

      const phoneE164 = buildPhoneE164(selectedCountry.callingCode, phoneNationalNumber);
      const whatsappText = buildWhatsAppInviteMessage({
        inviteeName,
        amountMinor:
          Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 ? transactionAmountMinor : null,
        direction: transactionDirection,
        description: transactionDescription,
      });
      const whatsappUrl = `https://wa.me/${formatPhoneForWhatsApp(phoneE164)}?text=${encodeURIComponent(whatsappText)}`;

      await Linking.openURL(whatsappUrl);

      setInviteeName('');
      setPhoneNationalNumber('');
      setMessage(
        'Abrimos WhatsApp con el mensaje listo. Si esa persona se registra con este numero, la app enlazara la invitacion automaticamente.',
      );
      setSegment('pending');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo preparar la invitacion.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateShareLink() {
    if (busyKey) {
      return;
    }

    setBusyKey('create-link');
    setMessage(null);

    try {
      const response = await createShareableInvite.mutateAsync();
      await Clipboard.setStringAsync(response.inviteLink);
      setShareLink(response.inviteLink);
      setMessage('Copiamos un link nuevo al portapapeles. Si generas otro, el anterior deja de servir.');
      setSegment('pending');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el link.');
    } finally {
      setBusyKey(null);
    }
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

    const token = extractConnectionToken(result.data);
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
      pathname: '/connect/[token]',
      params: { token },
    });
  }

  async function handleIncomingInvite(inviteId: string, action: 'accept' | 'reject') {
    setBusyKey(`${action}:${inviteId}`);
    setMessage(null);

    try {
      if (action === 'accept') {
        await acceptInvite.mutateAsync(inviteId);
        setMessage('Invitacion aceptada. La relacion ya deberia aparecer en tu app.');
      } else {
        await rejectInvite.mutateAsync(inviteId);
        setMessage('Invitacion rechazada.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo responder la invitacion.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScreenShell
      eyebrow="Red"
      footer={
        <View style={styles.footer}>
          <PrimaryAction label="Cerrar" onPress={() => router.dismiss()} variant="ghost" />
        </View>
      }
      largeTitle={false}
      subtitle="Usa telefono, link o QR sin perder el estado canonico de cada relacion."
      title="Invitar persona"
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.cardTitle}>Tres canales, una sola verdad</Text>
        <Text style={styles.helper}>
          WhatsApp para telefono, link para compartir y QR para encuentros presenciales. Todas las respuestas terminan en la misma invitacion interna.
        </Text>
      </SurfaceCard>

      {message ? <MessageBanner message={message} /> : null}

      {Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 && transactionDirection ? (
        <SurfaceCard padding="lg" variant="accent">
          <Text style={styles.cardTitle}>Esta invitacion nace desde un movimiento</Text>
          <Text style={styles.helper}>
            {transactionDirection === 'i_owe' ? 'Salida de' : 'Entrada de'} {formatCop(transactionAmountMinor)}
            {transactionDescription && transactionDescription.trim().length > 0
              ? ` por ${transactionDescription.trim()}`
              : ''}
            . Ese contexto sale prellenado cuando abres WhatsApp.
          </Text>
        </SurfaceCard>
      ) : null}

      {!snapshotQuery.isLoading && !snapshotQuery.error ? (
        <>
          <SectionBlock
            title="WhatsApp por telefono"
            subtitle="Si el numero ya existe en Happy Circles, lo resolvemos como invitacion interna y no abrimos WhatsApp."
          >
            <SurfaceCard padding="lg" variant="elevated">
              <PrimaryAction
                label={busyKey === 'pick-contact' ? 'Abriendo contactos...' : 'Elegir de contactos'}
                onPress={busyKey ? undefined : () => void handlePickContact()}
                subtitle="Precarga nombre y numero desde tu agenda"
                variant="secondary"
              />

              <FieldBlock label="Nombre">
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setInviteeName}
                  placeholder="Nombre y apellido"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  value={inviteeName}
                />
              </FieldBlock>

              <FieldBlock label="Celular">
                <View style={styles.phoneRow}>
                  <View style={styles.callingCodeBox}>
                    <Text style={styles.callingCodeText}>{selectedCountry.callingCode}</Text>
                  </View>
                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={setPhoneNationalNumber}
                    placeholder="3001234567"
                    placeholderTextColor={theme.colors.muted}
                    style={[styles.input, styles.phoneInput]}
                    value={phoneNationalNumber}
                  />
                </View>
              </FieldBlock>

              <FieldBlock label="Pais">
                <View style={styles.choiceRow}>
                  {COUNTRY_OPTIONS.map((country) => (
                    <ChoiceChip
                      key={country.iso2}
                      label={`${country.label} ${country.callingCode}`}
                      onPress={() => setCountryIso(country.iso2)}
                      selected={country.iso2 === selectedCountry.iso2}
                    />
                  ))}
                </View>
              </FieldBlock>

              <PrimaryAction
                label={busyKey === 'create-whatsapp' ? 'Preparando...' : 'Enviar por WhatsApp'}
                onPress={busyKey ? undefined : () => void handleCreateInvite()}
                subtitle="Solo abre WhatsApp si la otra persona aun no esta adentro."
              />
            </SurfaceCard>
          </SectionBlock>

          <SectionBlock
            title="Copiar link"
            subtitle="Genera un link de un solo uso. Si creas otro, el anterior queda invalidado."
          >
            <SurfaceCard padding="lg" variant="elevated">
              <Text style={styles.cardTitle}>Link compartible</Text>
              <Text style={styles.helper}>
                Ideal para copiar en Telegram, email, SMS o donde quieras. La relacion solo se crea cuando la otra persona confirma.
              </Text>
              {shareLink ? <Text style={styles.linkPreview}>{shareLink}</Text> : null}
              <PrimaryAction
                label={busyKey === 'create-link' ? 'Generando...' : 'Crear y copiar link'}
                onPress={busyKey ? undefined : () => void handleCreateShareLink()}
                subtitle="Deep link directo a la confirmacion"
              />
            </SurfaceCard>
          </SectionBlock>

          <SectionBlock
            title="Escanear / mostrar QR"
            subtitle="Tu QR sirve para que otra persona te descubra sin directorio publico. Escanear uno ajeno crea una invitacion directa."
          >
            <SurfaceCard padding="lg" variant="elevated">
              <Text style={styles.cardTitle}>Mi QR</Text>
              <Text style={styles.helper}>
                Comparte este codigo en persona. No crea relaciones automaticamente: siempre hay confirmacion.
              </Text>
              {profileConnectionLink ? (
                <View style={styles.qrBlock}>
                  <View style={styles.qrCanvas}>
                    <QRCode value={profileConnectionLink} size={176} />
                  </View>
                  <Text style={styles.linkPreview}>{profileConnectionLink}</Text>
                </View>
              ) : (
                <Text style={styles.helper}>Tu perfil aun no tiene token publico disponible.</Text>
              )}
              <View style={styles.qrActionRow}>
                <View style={styles.qrActionSlot}>
                  <PrimaryAction
                    label="Copiar mi QR"
                    onPress={
                      profileConnectionLink
                        ? () => {
                            void Clipboard.setStringAsync(profileConnectionLink);
                            setMessage('Copiamos tu deep link de QR al portapapeles.');
                          }
                        : undefined
                    }
                    variant="secondary"
                  />
                </View>
                <View style={styles.qrActionSlot}>
                  <PrimaryAction
                    label={scannerOpen ? 'Cerrar scanner' : 'Escanear QR'}
                    onPress={() => void handleOpenScanner()}
                  />
                </View>
              </View>
              {scannerOpen ? (
                <View style={styles.scannerWrap}>
                  <CameraView
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={handleBarcodeScanned}
                    style={styles.scanner}
                  />
                </View>
              ) : null}
            </SurfaceCard>
          </SectionBlock>

          <SectionBlock
            title="Estado"
            subtitle="Pendientes para responder o seguir, y luego historial resuelto."
          >
            <SegmentedControl
              onChange={setSegment}
              options={[
                { label: 'Pendientes', value: 'pending' },
                { label: 'Historial', value: 'history' },
              ]}
              value={segment}
            />

            {segment === 'pending' ? (
              <View style={styles.stack}>
                <SectionBlock title="Por responder">
                  {incomingInvites.length === 0 ? (
                    <EmptyState
                      description="Cuando alguien te invite directamente, aparecera aqui."
                      title="Nada pendiente por responder"
                    />
                  ) : (
                    incomingInvites.map((invite) => (
                      <SurfaceCard key={invite.id} padding="lg">
                        <View style={styles.header}>
                          <View style={styles.textWrap}>
                            <Text style={styles.cardTitle}>{invite.displayName}</Text>
                            <Text style={styles.helper}>
                              {invite.channelLabel} | enviada {formatInviteDate(invite.createdAt)}
                            </Text>
                            {invite.expiresAt ? (
                              <Text style={styles.helper}>Vence {formatInviteDate(invite.expiresAt)}</Text>
                            ) : null}
                          </View>
                          <StatusChip label="Por responder" tone="warning" />
                        </View>
                        <View style={styles.actionRow}>
                          <View style={styles.actionSlot}>
                            <PrimaryAction
                              label={busyKey === `accept:${invite.id}` ? 'Aceptando...' : 'Aceptar'}
                              onPress={busyKey ? undefined : () => void handleIncomingInvite(invite.id, 'accept')}
                            />
                          </View>
                          <View style={styles.actionSlot}>
                            <PrimaryAction
                              label={busyKey === `reject:${invite.id}` ? 'Rechazando...' : 'Rechazar'}
                              onPress={busyKey ? undefined : () => void handleIncomingInvite(invite.id, 'reject')}
                              variant="ghost"
                            />
                          </View>
                        </View>
                      </SurfaceCard>
                    ))
                  )}
                </SectionBlock>

                <SectionBlock title="Salientes dentro de la app">
                  {outgoingInvites.length === 0 ? (
                    <EmptyState
                      description="Las invitaciones creadas por link, QR o numero ya resuelto aparecen aqui."
                      title="Sin invitaciones salientes"
                    />
                  ) : (
                    outgoingInvites.map((invite) => (
                      <SurfaceCard key={invite.id} padding="lg">
                        <View style={styles.header}>
                          <View style={styles.textWrap}>
                            <Text style={styles.cardTitle}>{invite.displayName}</Text>
                            <Text style={styles.helper}>
                              {invite.channelLabel} | enviada {formatInviteDate(invite.createdAt)}
                            </Text>
                            {invite.expiresAt ? (
                              <Text style={styles.helper}>Vence {formatInviteDate(invite.expiresAt)}</Text>
                            ) : null}
                          </View>
                          <StatusChip label={invite.targetMode === 'share_link' ? 'Link activo' : 'Pendiente'} tone="warning" />
                        </View>
                      </SurfaceCard>
                    ))
                  )}
                </SectionBlock>

                <SectionBlock title="Seguimiento externo por WhatsApp">
                  {externalPendingInvites.length === 0 ? (
                    <EmptyState
                      description="Aqui solo quedan las invitaciones que siguen afuera de la app."
                      title="Sin seguimiento externo"
                    />
                  ) : (
                    externalPendingInvites.map((invite) => (
                      <SurfaceCard key={invite.id} padding="lg">
                        <View style={styles.header}>
                          <View style={styles.textWrap}>
                            <Text style={styles.cardTitle}>{invite.inviteeName}</Text>
                            <Text style={styles.helper}>
                              {invite.phoneE164} | enviada {formatInviteDate(invite.createdAt)}
                            </Text>
                            <Text style={styles.helper}>
                              Aun no hay una cuenta asociada a este telefono.
                            </Text>
                          </View>
                          <StatusChip label="Pendiente afuera" tone="neutral" />
                        </View>
                      </SurfaceCard>
                    ))
                  )}
                </SectionBlock>
              </View>
            ) : (
              <View style={styles.stack}>
                <SectionBlock title="Invitaciones resueltas">
                  {historyInviteItems.length === 0 ? (
                    <EmptyState
                      description="Cuando una invitacion se acepte, rechace o expire, quedara aqui."
                      title="Sin historial de invitaciones"
                    />
                  ) : (
                    historyInviteItems.map((item) => (
                      <SurfaceCard key={item.id} padding="lg">
                        <View style={styles.header}>
                          <View style={styles.textWrap}>
                            <Text style={styles.cardTitle}>{item.title}</Text>
                            <Text style={styles.helper}>{item.subtitle}</Text>
                          </View>
                          <StatusChip label={inviteStatusLabel(item.status)} tone={inviteChipTone(item.status)} />
                        </View>
                      </SurfaceCard>
                    ))
                  )}
                </SectionBlock>

                <SectionBlock title="Historial externo">
                  {externalHistoryInvites.length === 0 ? (
                    <EmptyState
                      description="Solo mostramos aqui invitaciones de telefono que no terminaron en una invitacion canonica."
                      title="Sin historial externo"
                    />
                  ) : (
                    externalHistoryInvites.map((invite) => {
                      const presentation = contactTrackingPresentation(invite);
                      return (
                        <SurfaceCard key={invite.id} padding="lg">
                          <View style={styles.header}>
                            <View style={styles.textWrap}>
                              <Text style={styles.cardTitle}>{invite.inviteeName}</Text>
                              <Text style={styles.helper}>
                                {invite.phoneE164} | {formatInviteDate(invite.createdAt)}
                              </Text>
                              {invite.matchedDisplayName ? (
                                <Text style={styles.helper}>
                                  Enlazada con {invite.matchedDisplayName}.
                                </Text>
                              ) : null}
                            </View>
                            <StatusChip label={presentation.label} tone={presentation.tone} />
                          </View>
                        </SurfaceCard>
                      );
                    })
                  )}
                </SectionBlock>
              </View>
            )}
          </SectionBlock>
        </>
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => setContactPhonePicker(null)}
        transparent
        visible={contactPhonePicker !== null}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            onPress={() => setContactPhonePicker(null)}
            style={styles.modalDismissZone}
          />
          <View style={styles.modalSheet}>
            <SurfaceCard padding="lg" style={styles.modalCard} variant="elevated">
              <Text style={styles.cardTitle}>Elegir numero</Text>
              <Text style={styles.helper}>
                {contactPhonePicker
                  ? `${contactPhonePicker.contactName} tiene varios numeros. Elige cual quieres usar para la invitacion.`
                  : ''}
              </Text>

              <ScrollView
                contentContainerStyle={styles.contactOptionList}
                showsVerticalScrollIndicator={false}
              >
                {contactPhonePicker?.options.map((phoneOption) => (
                  <Pressable
                    key={phoneOption.key}
                    onPress={() => applySelectedContact(contactPhonePicker.contactName, phoneOption)}
                    style={({ pressed }) => [
                      styles.contactOption,
                      pressed ? styles.contactOptionPressed : null,
                    ]}
                  >
                    <Text style={styles.contactOptionTitle}>{phoneOption.label}</Text>
                    <Text style={styles.contactOptionSubtitle}>
                      {phoneOption.callingCode} | {phoneOption.countryIso}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <PrimaryAction
                label="Cancelar"
                onPress={() => setContactPhonePicker(null)}
                variant="ghost"
              />
            </SurfaceCard>
          </View>
        </View>
      </Modal>

      {snapshotQuery.isLoading ? (
        <SurfaceCard>
          <Text style={styles.helper}>Cargando invitaciones y relaciones...</Text>
        </SurfaceCard>
      ) : null}

      {snapshotQuery.error ? (
        <SurfaceCard>
          <Text style={styles.cardTitle}>No pudimos cargar invitaciones.</Text>
          <Text style={styles.helper}>{snapshotQuery.error.message}</Text>
        </SurfaceCard>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
  },
  modalBackdrop: {
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'flex-end',
    padding: theme.spacing.md,
  },
  modalDismissZone: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    justifyContent: 'flex-end',
  },
  modalCard: {
    gap: theme.spacing.md,
    maxHeight: '70%',
    ...theme.shadow.floating,
  },
  contactOptionList: {
    gap: theme.spacing.sm,
  },
  contactOption: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    gap: theme.spacing.xxs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  contactOptionPressed: {
    opacity: 0.9,
  },
  contactOptionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  contactOptionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  stack: {
    gap: theme.spacing.md,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  linkPreview: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  qrBlock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  qrCanvas: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.large,
    padding: theme.spacing.md,
  },
  qrActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  qrActionSlot: {
    flex: 1,
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
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionSlot: {
    flex: 1,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  phoneRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  callingCodeBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: theme.spacing.md,
  },
  callingCodeText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
  },
});
