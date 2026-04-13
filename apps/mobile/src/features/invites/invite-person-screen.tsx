import { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceChip } from '@/components/choice-chip';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SurfaceCard } from '@/components/surface-card';
import { appConfig } from '@/lib/config';
import { formatCop } from '@/lib/data';
import { useCreateExternalFriendshipInviteMutation } from '@/lib/live-data';
import {
  buildPhoneE164,
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY,
  formatPhoneForWhatsApp,
  normalizePhoneDigits,
  type CountryOption,
} from '@/lib/phone';
import { theme } from '@/lib/theme';

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

type ActiveQrInvite = {
  readonly deliveryToken: string;
  readonly inviteLink: string;
  readonly expiresAt: string;
};

const COUNTRY_OPTIONS_BY_CALLING_CODE = [...COUNTRY_OPTIONS].sort(
  (left, right) =>
    normalizePhoneDigits(right.callingCode).length - normalizePhoneDigits(left.callingCode).length,
);

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

function buildWhatsAppInviteMessage(input: {
  readonly inviteeName: string;
  readonly amountMinor: number | null;
  readonly direction: 'i_owe' | 'owes_me' | null;
  readonly description: string | null;
  readonly inviteLink: string;
}): string {
  const inviteeName = input.inviteeName.trim();
  const prefix = inviteeName.length > 0 ? `Hola ${inviteeName},` : 'Hola,';

  if (input.amountMinor && input.amountMinor > 0 && input.direction) {
    const movementText =
      input.direction === 'i_owe'
        ? `una salida de ${formatCop(input.amountMinor)}`
        : `una entrada de ${formatCop(input.amountMinor)}`;
    const descriptionText =
      input.description && input.description.trim().length > 0
        ? ` por ${input.description.trim()}`
        : '';

    return `${prefix} te envie una invitacion de Happy Circles para registrar ${movementText}${descriptionText}. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
  }

  return `${prefix} te envie una invitacion de Happy Circles para conectar conmigo de forma privada. Abre este link para entrar o crear tu cuenta: ${input.inviteLink}`;
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
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [qrInvite, setQrInvite] = useState<ActiveQrInvite | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [contactPhonePicker, setContactPhonePicker] = useState<ContactPhonePickerState | null>(null);

  const selectedCountry = useMemo(
    () => COUNTRY_OPTIONS.find((country) => country.iso2 === countryIso) ?? DEFAULT_COUNTRY,
    [countryIso],
  );

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

  async function handleCreateInviteByWhatsApp() {
    if (busyKey) {
      return;
    }

    const phoneE164 = buildPhoneE164(selectedCountry.callingCode, phoneNationalNumber);
    if (!inviteeName.trim()) {
      setMessage('Escribe al menos un nombre para saber a quien le enviaste la invitacion.');
      return;
    }

    if (normalizePhoneDigits(phoneNationalNumber).length < 6) {
      setMessage('Escribe un numero valido antes de abrir WhatsApp.');
      return;
    }

    setBusyKey('create-whatsapp');
    setMessage(null);

    try {
      const response = await createExternalInvite.mutateAsync({
        channel: 'whatsapp',
        sourceContext: 'invite_screen_whatsapp',
        intendedRecipientAlias: inviteeName.trim(),
        deliveryPhoneE164: phoneE164,
      });
      const inviteLink = buildInviteLink(response.deliveryToken);
      const whatsappText = buildWhatsAppInviteMessage({
        inviteeName,
        amountMinor:
          Number.isFinite(transactionAmountMinor) && transactionAmountMinor > 0 ? transactionAmountMinor : null,
        direction: transactionDirection,
        description: transactionDescription,
        inviteLink,
      });
      const whatsappUrl = `https://wa.me/${formatPhoneForWhatsApp(phoneE164)}?text=${encodeURIComponent(whatsappText)}`;

      await Linking.openURL(whatsappUrl);
      setShareLink(inviteLink);
      setPhoneNationalNumber('');
      setInviteeName('');
      setMessage('Abrimos WhatsApp con un link unico. La amistad solo se crea cuando la otra cuenta lo reclama y tu la confirmas.');
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
      const response = await createExternalInvite.mutateAsync({
        channel: 'link',
        sourceContext: 'invite_screen_link',
        intendedRecipientAlias: inviteeName.trim() || undefined,
      });
      const inviteLink = buildInviteLink(response.deliveryToken);
      await Clipboard.setStringAsync(inviteLink);
      setShareLink(inviteLink);
      setMessage('Copiamos un link nuevo al portapapeles. Quien lo abra debe reclamarlo y luego tu confirmas la identidad.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el link.');
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
        intendedRecipientAlias: inviteeName.trim() || undefined,
      });
      setQrInvite({
        deliveryToken: response.deliveryToken,
        inviteLink: buildInviteLink(response.deliveryToken),
        expiresAt: response.expiresAt,
      });
      setMessage('Generamos un QR temporal nuevo. Si se usa o vence, el siguiente QR sera otro.');
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
      eyebrow="Red"
      footer={
        <View style={styles.footer}>
          <PrimaryAction label="Cerrar" onPress={() => router.dismiss()} variant="ghost" />
        </View>
      }
      largeTitle={false}
      subtitle="WhatsApp, link y QR desembocan en el mismo flujo privado de confirmacion."
      title="Invitar persona"
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.cardTitle}>Una invitacion, varios canales</Text>
        <Text style={styles.helper}>
          El numero, el link y el QR solo entregan el acceso. La amistad se crea cuando la otra persona reclama el token y tu confirmas que si es ella.
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
            . Ese contexto se incluye en el mensaje de WhatsApp, pero la identidad final siempre se valida por cuenta.
          </Text>
        </SurfaceCard>
      ) : null}

      <SectionBlock
        title="Enviar por WhatsApp"
        subtitle="WhatsApp solo reparte el link. El numero queda guardado como trazabilidad del envio."
      >
        <SurfaceCard padding="lg" variant="elevated">
          <PrimaryAction
            label={busyKey === 'pick-contact' ? 'Abriendo contactos...' : 'Elegir de contactos'}
            onPress={busyKey ? undefined : () => void handlePickContact()}
            subtitle="Precarga nombre y numero desde tu agenda"
            variant="secondary"
          />

          <FieldBlock label="Nombre o alias">
            <TextInput
              autoCapitalize="words"
              onChangeText={setInviteeName}
              placeholder="Como identificas a esta persona"
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
            onPress={busyKey ? undefined : () => void handleCreateInviteByWhatsApp()}
            subtitle="Genera un token externo y abre WhatsApp con el link HTTPS"
          />
        </SurfaceCard>
      </SectionBlock>

      <SectionBlock
        title="Copiar link"
        subtitle="Genera un link unico de invitacion. Quien lo abra entra al mismo flujo de claim."
      >
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.cardTitle}>Link compartible</Text>
          <Text style={styles.helper}>
            Ideal para Telegram, email o SMS. Si despues lo reclama la cuenta equivocada, tu lado decide si confirmar o cerrarlo.
          </Text>
          {shareLink ? <Text style={styles.linkPreview}>{shareLink}</Text> : null}
          <PrimaryAction
            label={busyKey === 'create-link' ? 'Generando...' : 'Crear y copiar link'}
            onPress={busyKey ? undefined : () => void handleCreateShareLink()}
            subtitle="Copia la URL HTTPS al portapapeles"
          />
        </SurfaceCard>
      </SectionBlock>

      <SectionBlock
        title="Mostrar o escanear QR"
        subtitle="El QR ya no representa un perfil publico; representa una invitacion temporal de un solo uso."
      >
        <SurfaceCard padding="lg" variant="elevated">
          <Text style={styles.cardTitle}>Mi QR temporal</Text>
          <Text style={styles.helper}>
            Sirve para encuentros presenciales. Si se usa o vence, el siguiente QR mostrado debe ser otro.
          </Text>

          {qrInvite ? (
            <View style={styles.qrBlock}>
              <View style={styles.qrCanvas}>
                <QRCode value={qrInvite.inviteLink} size={176} />
              </View>
              <Text style={styles.helper}>Valido hasta {formatExpiryLabel(qrInvite.expiresAt)}</Text>
              <Text style={styles.linkPreview}>{qrInvite.inviteLink}</Text>
            </View>
          ) : (
            <Text style={styles.helper}>Todavia no generas un QR temporal para esta sesion.</Text>
          )}

          <View style={styles.qrActionRow}>
            <View style={styles.qrActionSlot}>
              <PrimaryAction
                label={busyKey === 'create-qr' ? 'Generando...' : qrInvite ? 'Generar otro QR' : 'Generar QR temporal'}
                onPress={busyKey ? undefined : () => void handleCreateQrInvite()}
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
                  ? `${contactPhonePicker.contactName} tiene varios numeros. Elige cual quieres usar como trazabilidad del envio por WhatsApp.`
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
