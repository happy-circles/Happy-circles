import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Contacts from 'expo-contacts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SegmentedControl } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { appConfig } from '@/lib/config';
import { formatCop } from '@/lib/data';
import { useCreateExternalFriendshipInviteMutation } from '@/lib/live-data';
import { buildPhoneE164, COUNTRY_OPTIONS, DEFAULT_COUNTRY, normalizePhoneDigits } from '@/lib/phone';
import { theme } from '@/lib/theme';

function buildInviteLink(deliveryToken: string): string {
  return `${appConfig.appWebOrigin.replace(/\/$/, '')}/invite/${deliveryToken}`;
}

function formatExpiryLabel(expiresAt: string): string {
  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) {
    return 'vence pronto';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function maskPhoneValue(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (digits.length < 4) {
    return value;
  }

  return `***${digits.slice(-4)}`;
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
    (left, right) => normalizePhoneDigits(right.callingCode).length - normalizePhoneDigits(left.callingCode).length,
  );

  for (const option of sortedOptions) {
    if (digits.startsWith(normalizePhoneDigits(option.callingCode))) {
      return option;
    }
  }

  return DEFAULT_COUNTRY;
}

type ContactPhoneOption = {
  readonly id: string;
  readonly label: string | null;
  readonly phoneE164: string;
  readonly maskedPhone: string;
};

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

type ContactReference = {
  readonly contactId: string;
  readonly alias: string;
  readonly phoneE164: string;
  readonly phoneLabel: string | null;
  readonly maskedPhone: string;
  readonly referenceKey: string;
};

function buildContactReference(input: {
  readonly contactId: string;
  readonly alias: string;
  readonly phoneOption: ContactPhoneOption;
}): ContactReference {
  const alias = input.alias.trim() || 'Contacto';
  return {
    contactId: input.contactId,
    alias,
    phoneE164: input.phoneOption.phoneE164,
    phoneLabel: input.phoneOption.label,
    maskedPhone: input.phoneOption.maskedPhone,
    referenceKey: `${input.contactId}:${alias}:${input.phoneOption.phoneE164}`,
  };
}

function buildShareInviteMessage(input: {
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

    return `${prefix} te comparti una invitacion de Happy Circles para registrar ${movementText}${descriptionText}. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
  }

  return `${prefix} te comparti una invitacion de Happy Circles para conectar conmigo de forma privada. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
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

function isExpired(expiresAt: string): boolean {
  const timestamp = Date.parse(expiresAt);
  return Number.isNaN(timestamp) || timestamp <= Date.now();
}

type ActiveRemoteInvite = {
  readonly deliveryToken: string;
  readonly inviteLink: string;
  readonly expiresAt: string;
  readonly referenceKey: string;
};

type ActiveQrInvite = {
  readonly deliveryToken: string;
  readonly inviteLink: string;
  readonly expiresAt: string;
  readonly referenceKey: string;
};

type PendingContactSelection = {
  readonly contactId: string;
  readonly alias: string;
  readonly phoneOptions: readonly ContactPhoneOption[];
};

function contactReferenceLabel(contactReference: ContactReference | null): string {
  if (!contactReference) {
    return 'Sin contacto asociado';
  }

  return [contactReference.alias, contactReference.maskedPhone].join(' | ');
}

export function InvitePersonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    inviteeName?: string;
    amountMinor?: string;
    direction?: string;
    description?: string;
  }>();
  const createExternalInvite = useCreateExternalFriendshipInviteMutation();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const transactionAmountMinor =
    typeof params.amountMinor === 'string' ? Number.parseInt(params.amountMinor, 10) : Number.NaN;
  const transactionDirection =
    params.direction === 'i_owe' || params.direction === 'owes_me' ? params.direction : null;
  const transactionDescription = typeof params.description === 'string' ? params.description : null;

  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [contactReference, setContactReference] = useState<ContactReference | null>(null);
  const [pendingContactSelection, setPendingContactSelection] = useState<PendingContactSelection | null>(null);
  const [remoteInvite, setRemoteInvite] = useState<ActiveRemoteInvite | null>(null);
  const [qrInvite, setQrInvite] = useState<ActiveQrInvite | null>(null);
  const [manualInviteInput, setManualInviteInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);

  function clearInvitesForReference(nextReferenceKey: string | null) {
    if (remoteInvite && remoteInvite.referenceKey !== (nextReferenceKey ?? 'none')) {
      setRemoteInvite(null);
    }

    if (qrInvite && qrInvite.referenceKey !== (nextReferenceKey ?? 'none')) {
      setQrInvite(null);
    }
  }

  function applyContactReference(nextReference: ContactReference) {
    clearInvitesForReference(nextReference.referenceKey);
    setContactReference(nextReference);
    setPendingContactSelection(null);
    setMessage(`Usaremos ${nextReference.alias} ${nextReference.maskedPhone} como referencia para esta invitacion.`);
  }

  async function ensureRemoteInvite(): Promise<ActiveRemoteInvite> {
    if (!contactReference) {
      throw new Error('Elige un contacto con numero antes de compartir la invitacion remota.');
    }

    if (
      remoteInvite &&
      remoteInvite.referenceKey === contactReference.referenceKey &&
      !isExpired(remoteInvite.expiresAt)
    ) {
      return remoteInvite;
    }

    const response = await createExternalInvite.mutateAsync({
      channel: 'remote',
      sourceContext: 'invite_screen_remote',
      intendedRecipientAlias: contactReference.alias,
      intendedRecipientPhoneE164: contactReference.phoneE164,
      intendedRecipientPhoneLabel: contactReference.phoneLabel ?? undefined,
    });

    const nextInvite: ActiveRemoteInvite = {
      deliveryToken: response.deliveryToken,
      inviteLink: buildInviteLink(response.deliveryToken),
      expiresAt: response.expiresAt,
      referenceKey: contactReference.referenceKey,
    };
    setRemoteInvite(nextInvite);
    return nextInvite;
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
      if (permission.status !== Contacts.PermissionStatus.GRANTED) {
        setMessage('Necesitamos permiso de contactos para asociar esta invitacion remota a alguien de tu agenda.');
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
      const alias = resolveContactName(contact);
      const phoneOptions = buildContactPhoneOptions(contact);

      if (phoneOptions.length === 0) {
        setMessage('Ese contacto no tiene un numero valido para asociar la invitacion remota.');
        return;
      }

      if (phoneOptions.length === 1) {
        applyContactReference(
          buildContactReference({
            contactId: contact.id,
            alias,
            phoneOption: phoneOptions[0],
          }),
        );
        return;
      }

      setPendingContactSelection({
        contactId: contact.id,
        alias,
        phoneOptions,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir tu agenda.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleShareInvite() {
    if (busyKey) {
      return;
    }

    setBusyKey('share');
    setMessage(null);

    try {
      const activeInvite = await ensureRemoteInvite();
      const shareMessage = buildShareInviteMessage({
        inviteeAlias: contactReference?.alias ?? '',
        amountMinor:
          Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 ? transactionAmountMinor : null,
        direction: transactionDirection,
        description: transactionDescription,
        inviteLink: activeInvite.inviteLink,
      });

      await Share.share({
        title: 'Invitacion de Happy Circles',
        message: shareMessage,
      });

      setMessage(
        'Abrimos las opciones para compartir el mismo link remoto.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir el menu para compartir.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCopyInviteLink() {
    if (busyKey) {
      return;
    }

    setBusyKey('copy-link');
    setMessage(null);

    try {
      const activeInvite = await ensureRemoteInvite();
      await Clipboard.setStringAsync(activeInvite.inviteLink);
      setMessage('Copiamos el link remoto.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo copiar el link.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCreateQrInvite() {
    if (busyKey) {
      return;
    }

    setBusyKey('create-qr');
    setMessage(null);

    try {
      const response = await createExternalInvite.mutateAsync({
        channel: 'qr',
        sourceContext: 'invite_screen_qr',
        intendedRecipientAlias: contactReference?.alias,
        intendedRecipientPhoneE164: contactReference?.phoneE164,
        intendedRecipientPhoneLabel: contactReference?.phoneLabel ?? undefined,
      });
      setQrInvite({
        deliveryToken: response.deliveryToken,
        inviteLink: buildInviteLink(response.deliveryToken),
        expiresAt: response.expiresAt,
        referenceKey: contactReference?.referenceKey ?? 'none',
      });
      setMessage('Generamos un QR temporal nuevo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el QR.');
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
      title="Personas"
      titleSize="title1"
    >
      {message ? <MessageBanner message={message} /> : null}

      <View style={styles.form}>
        <SegmentedControl
          onChange={setMode}
          options={[
            { label: 'Enviar', value: 'send' },
            { label: 'Recibir', value: 'receive' },
          ]}
          value={mode}
        />

        {mode === 'send' ? (
          <View style={styles.section}>
            {Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 && transactionDirection ? (
              <Text style={styles.helperCompact}>
                {transactionDirection === 'i_owe' ? 'Salida' : 'Entrada'} de {formatCop(transactionAmountMinor)}
                {transactionDescription && transactionDescription.trim().length > 0
                  ? ` por ${transactionDescription.trim()}`
                  : ''}
              </Text>
            ) : null}

            <PrimaryAction
              label={busyKey === 'pick-contact' ? 'Abriendo contactos...' : contactReference ? 'Cambiar contacto' : 'Elegir contacto'}
              onPress={busyKey ? undefined : () => void handlePickContact()}
              variant="secondary"
            />

            <SurfaceCard padding="md" variant={contactReference ? 'elevated' : 'default'}>
              <Text style={styles.referenceLine}>
                {contactReference ? contactReference.alias : 'Sin contacto'}
              </Text>
              <Text style={styles.referenceMeta}>
                {contactReference
                  ? [contactReference.phoneLabel, contactReference.maskedPhone].filter(Boolean).join(' | ')
                  : 'Elige un contacto para compartir o copiar el link'}
              </Text>
            </SurfaceCard>

            <PrimaryAction
              label={busyKey === 'share' ? 'Abriendo opciones...' : 'Compartir'}
              onPress={busyKey ? undefined : () => void handleShareInvite()}
            />
            <PrimaryAction
              label={busyKey === 'copy-link' ? 'Copiando...' : 'Copiar link'}
              onPress={busyKey ? undefined : () => void handleCopyInviteLink()}
              variant="ghost"
            />

            <View style={styles.sectionDivider} />

            {qrInvite ? (
              <View style={styles.qrBlock}>
                <View style={styles.qrCanvas}>
                  <QRCode value={qrInvite.inviteLink} size={176} />
                </View>
                <Text style={styles.helperCompact}>Vence {formatExpiryLabel(qrInvite.expiresAt)}</Text>
              </View>
            ) : null}

            <PrimaryAction
              label={busyKey === 'create-qr' ? 'Generando...' : qrInvite ? 'Generar otro QR' : 'Generar QR temporal'}
              onPress={busyKey ? undefined : () => void handleCreateQrInvite()}
              variant="secondary"
            />
            {qrInvite ? (
              <PrimaryAction
                label="Copiar link del QR"
                onPress={() => {
                  void Clipboard.setStringAsync(qrInvite.inviteLink);
                  setMessage('Copiamos el link del QR actual.');
                }}
                variant="ghost"
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.section}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setManualInviteInput}
              placeholder="Pega el link o codigo"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              value={manualInviteInput}
            />

            <PrimaryAction
              label={busyKey === 'paste-manual' ? 'Pegando...' : 'Pegar desde portapapeles'}
              onPress={busyKey ? undefined : () => void handlePasteManualInvite()}
              variant="secondary"
            />
            <PrimaryAction
              label="Continuar"
              onPress={busyKey ? undefined : handleSubmitManualInvite}
            />
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
        )}
      </View>

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
              {pendingContactSelection ? `${pendingContactSelection.alias} tiene varios numeros. Elige el correcto.` : ''}
            </Text>
            <View style={styles.modalActions}>
              {pendingContactSelection?.phoneOptions.map((phoneOption) => (
                <PrimaryAction
                  key={phoneOption.id}
                  label={phoneOption.label ? `${phoneOption.label} | ${phoneOption.maskedPhone}` : phoneOption.maskedPhone}
                  onPress={() => {
                    if (!pendingContactSelection) {
                      return;
                    }

                    applyContactReference(
                      buildContactReference({
                        contactId: pendingContactSelection.contactId,
                        alias: pendingContactSelection.alias,
                        phoneOption,
                      }),
                    );
                  }}
                  variant="secondary"
                />
              ))}
              <PrimaryAction
                label="Cancelar"
                onPress={() => setPendingContactSelection(null)}
                variant="ghost"
              />
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
  form: {
    gap: theme.spacing.md,
  },
  section: {
    gap: theme.spacing.md,
  },
  sectionDivider: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: theme.spacing.lg,
  },
  helperCompact: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
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
  referenceLine: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '700',
    lineHeight: 22,
  },
  referenceMeta: {
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
});
