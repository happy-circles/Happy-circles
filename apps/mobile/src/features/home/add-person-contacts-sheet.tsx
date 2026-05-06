import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { addPersonContactsSheetStyles as styles } from '@/features/home/add-person-contacts-sheet.styles';
import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import {
  actionMetaForResolution,
  contactAvatarColor,
  contactMeta,
  formatQrExpiry,
  shouldShowInApp,
  type AddPersonTransactionContext,
  type EnrichedContact,
} from '@/features/home/contacts-sheet-helpers';
import { formatCop } from '@/lib/data';
import {
  type FriendshipInviteDeliveryResult,
  type PeopleTargetResolution,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useAddPersonContactsSheetController } from '@/features/home/add-person-contacts-sheet-controller';
import {
  type ContactCandidate,
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
  const {
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
  } = useAddPersonContactsSheetController({
    initialSearchValue,
    onClose,
    transactionContext,
    visible,
  });

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
