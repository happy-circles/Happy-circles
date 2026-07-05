import { useMemo, useRef } from 'react';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  View,
} from 'react-native';

import { addPersonContactsSheetStyles as styles } from '@/features/home/add-person-contacts-sheet.styles';
import { AppAvatar } from '@/components/app-avatar';
import { ContactActionFeedbackOverlay } from '@/components/contact-action-feedback-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import {
  formatQrExpiry,
  type AddPersonTransactionContext,
  type EnrichedContact,
} from '@/features/home/contacts-sheet-helpers';
import { AddPersonContactOptionsModal } from '@/features/home/add-person-contact-options-modal';
import {
  AddPersonInPersonQrBlock,
  AddPersonSearchControls,
  AddPersonTransactionContextBlock,
} from '@/features/home/add-person-in-person-controls';
import { ContactRow } from '@/features/home/add-person-contact-row';
import { useAppTheme } from '@/providers/theme-provider';
import { useAddPersonContactsSheetController } from '@/features/home/add-person-contacts-sheet-controller';
import { AppText } from '@/components/app-text';
import { buildManualPhoneE164, formatPhonePreview } from '@/features/invites/people-outreach-utils';

const CONTACT_CAN_RECEIVE_INVITE_LABEL = 'Puede recibir invitación';
const CONTACT_SCROLL_LOAD_MORE_THRESHOLD = 520;

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
  const activeTheme = useAppTheme();
  const {
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
  } = useAddPersonContactsSheetController({
    initialSearchValue,
    onClose,
    transactionContext,
    visible,
  });
  const stickySearchIndex = transactionContext ? 2 : 1;
  const manualInvitePhoneE164 = buildManualPhoneE164(searchValue);
  const manualInviteAlias = manualInvitePhoneE164
    ? resolveManualInviteAlias(searchValue, manualInvitePhoneE164)
    : null;
  const manualInviteBusy = Boolean(manualInvitePhoneE164 && busyKey === manualInvitePhoneE164);
  const isSearchingContacts = searchValue.trim().length > 0;
  const displayedContactsCount =
    inAppContacts.length + unresolvedContacts.length + inviteContacts.length;
  const searchStillIndexing =
    isSearchingContacts && contactsLoading && displayedContactsCount === 0;
  const compactActionsRevealY = useRef(new Animated.Value(0)).current;
  const compactActionsRevealStyle = useMemo(
    () => ({
      opacity: compactActionsRevealY.interpolate({
        inputRange: [0, 72, 120],
        outputRange: [0, 0, 1],
        extrapolate: 'clamp',
      }),
    }),
    [compactActionsRevealY],
  );

  function handleSheetScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!hasMoreContactsToDisplay) {
      return;
    }

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (distanceFromBottom <= CONTACT_SCROLL_LOAD_MORE_THRESHOLD) {
      requestMoreContacts();
    }
  }

  function renderContactSection(title: string, items: readonly EnrichedContact[]) {
    if (items.length === 0) {
      return null;
    }

    return (
      <View style={styles.contactSection}>
        <AppText style={styles.sectionLabel}>{title}</AppText>
        <View style={styles.contactList}>
          {items.map(({ contact, resolution }) => (
            <ContactRow
              busy={contact.phoneOptions.some((phoneOption) => busyKey === phoneOption.phoneE164)}
              contact={contact}
              key={`${contact.contactId}:${contact.primaryPhone.id}`}
              onPress={() =>
                !resolution ? void handleReviewContact(contact) : void handleContactPress(contact)
              }
              resolution={resolution}
            />
          ))}
        </View>
      </View>
    );
  }

  function handleManualInvitePress() {
    if (!manualInvitePhoneE164 || !manualInviteAlias || busyKey) {
      return;
    }

    void handleCreateOutreach({
      alias: manualInviteAlias,
      phoneE164: manualInvitePhoneE164,
      phoneLabel: 'Manual',
      sourceContext: 'home_add_contact_manual',
    });
  }

  function renderManualInviteCard() {
    if (!manualInvitePhoneE164) {
      return null;
    }

    return (
      <View
        style={[
          styles.manualInviteCard,
          {
            backgroundColor: activeTheme.colors.surfaceMuted,
            borderColor: activeTheme.colors.border,
          },
        ]}
      >
        <View style={styles.manualInviteCopy}>
          <AppText style={styles.manualInviteTitle}>Invitación directa</AppText>
          <AppText style={styles.emptyText}>{formatPhonePreview(manualInvitePhoneE164)}</AppText>
        </View>
        <PrimaryAction
          compact
          disabled={Boolean(busyKey)}
          icon="paper-plane-outline"
          label={manualInviteBusy ? 'Preparando...' : 'Consultar y continuar'}
          loading={manualInviteBusy}
          onPress={handleManualInvitePress}
        />
      </View>
    );
  }

  return (
    <>
      <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.sheetScrim, { backgroundColor: activeTheme.colors.overlay }]}
        >
          <Pressable onPress={onClose} style={styles.sheetBackdrop} />
          <View style={[styles.sheet, { backgroundColor: activeTheme.colors.surface }]}>
            <View style={styles.sheetHeader}>
              <AppText style={styles.sheetTitle}>Agregar personas</AppText>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons color={activeTheme.colors.text} name="close" size={22} />
              </Pressable>
            </View>

            <Animated.ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: compactActionsRevealY } } }],
                { listener: handleSheetScroll, useNativeDriver: true },
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              stickyHeaderIndices={[stickySearchIndex]}
            >
              <AddPersonInPersonQrBlock
                busyKey={busyKey}
                onOpenScanner={() => void handleOpenScanner()}
                onShowMyQr={() => void handleShowMyQr()}
              />

              {transactionContext ? (
                <AddPersonTransactionContextBlock transactionContext={transactionContext} />
              ) : null}

              <AddPersonSearchControls
                busyKey={busyKey}
                onOpenScanner={() => void handleOpenScanner()}
                onShowMyQr={() => void handleShowMyQr()}
                searchValue={searchValue}
                compactActionsStyle={compactActionsRevealStyle}
                setSearchValue={setSearchValue}
              />

              {message ? <MessageBanner message={message} tone="neutral" /> : null}

              {canReadContacts ? (
                <>
                  {contactsPermissionStatus === 'limited' ? (
                    <PrimaryAction
                      compact
                      disabled={Boolean(busyKey)}
                      label={
                        busyKey === 'expand-contacts' ? 'Abriendo agenda...' : 'Ver más contactos'
                      }
                      onPress={busyKey ? undefined : () => void handleExpandLimitedContactsAccess()}
                      variant="secondary"
                    />
                  ) : null}

                  <PrimaryAction
                    compact
                    disabled={Boolean(busyKey)}
                    icon="refresh-outline"
                    label={
                      busyKey === 'refresh-contacts'
                        ? 'Actualizando agenda...'
                        : 'Actualizar agenda'
                    }
                    loading={busyKey === 'refresh-contacts'}
                    onPress={busyKey ? undefined : () => void handleRefreshContacts()}
                    variant="ghost"
                  />

                  {contactsLoading ? (
                    <AppText style={styles.helperText}>
                      {contactsLoadedCount > 0
                        ? `Cargando agenda en segundo plano (${contactsLoadedCount} contactos).`
                        : 'Leyendo tu agenda...'}
                    </AppText>
                  ) : contactsLoadedCount > 0 && !contactsScanComplete ? (
                    <AppText style={styles.helperText}>Terminando de revisar la agenda...</AppText>
                  ) : null}

                  {renderContactSection('En Happy Circles', inAppContacts)}
                  {renderContactSection('Consultar en Happy Circles', unresolvedContacts)}
                  {renderContactSection('Invitar a Happy Circles', inviteContacts)}

                  {hasMoreContactsToDisplay ? (
                    <PrimaryAction
                      compact
                      label="Cargar más contactos"
                      onPress={requestMoreContacts}
                      variant="secondary"
                    />
                  ) : null}

                  {displayedContactsCount === 0 && (!contactsLoading || searchStillIndexing) ? (
                    <View style={styles.emptyState}>
                      <AppText style={styles.emptyTitle}>
                        {searchStillIndexing
                          ? 'Buscando en tu agenda...'
                          : isSearchingContacts
                            ? 'Sin resultados'
                            : 'Sin contactos utiles'}
                      </AppText>
                      <AppText style={styles.emptyText}>
                        {searchStillIndexing
                          ? 'Seguimos cargando contactos guardados en este telefono.'
                          : manualInvitePhoneE164
                            ? 'No esta en tus contactos, pero puedes enviarle un acceso privado.'
                            : isSearchingContacts
                              ? 'Prueba con otro nombre o celular.'
                              : 'No encontramos contactos con numero en la agenda disponible.'}
                      </AppText>
                      {renderManualInviteCard()}
                    </View>
                  ) : null}
                </>
              ) : (
                <View
                  style={[
                    styles.permissionBox,
                    { backgroundColor: activeTheme.colors.surfaceMuted },
                  ]}
                >
                  <AppText style={styles.emptyTitle}>Conecta tu agenda</AppText>
                  <AppText style={styles.emptyText}>
                    Así vemos quién ya está en Happy Circles y quién necesita invitación.
                  </AppText>
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
                  {manualInvitePhoneE164 ? renderManualInviteCard() : null}
                </View>
              )}
            </Animated.ScrollView>
          </View>

          {scannerOpen ? (
            <View style={[styles.floatingOverlay, { backgroundColor: activeTheme.colors.overlay }]}>
              <Pressable onPress={() => setScannerOpen(false)} style={styles.sheetBackdrop} />
              <View style={[styles.scannerCard, { backgroundColor: activeTheme.colors.surface }]}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <AppText style={styles.optionTitle}>Escanear QR</AppText>
                    <AppText style={styles.emptyText}>
                      Centra el QR de Happy Circles en la cámara.
                    </AppText>
                  </View>
                  <Pressable onPress={() => setScannerOpen(false)} style={styles.closeButton}>
                    <Ionicons color={activeTheme.colors.text} name="close" size={22} />
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
            <View style={[styles.floatingOverlay, { backgroundColor: activeTheme.colors.overlay }]}>
              <Pressable onPress={() => setMyQrVisible(false)} style={styles.sheetBackdrop} />
              <View style={[styles.myQrCard, { backgroundColor: activeTheme.colors.surface }]}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <AppText style={styles.optionTitle}>Mi QR</AppText>
                    <AppText style={styles.emptyText}>Para conectar en persona.</AppText>
                  </View>
                  <Pressable onPress={() => setMyQrVisible(false)} style={styles.closeButton}>
                    <Ionicons color={activeTheme.colors.text} name="close" size={22} />
                  </Pressable>
                </View>

                <View style={styles.qrProfile}>
                  <AppAvatar
                    fallbackBackgroundColor={activeTheme.colors.primary}
                    fallbackTextColor={activeTheme.colors.onPrimary}
                    imageUrl={currentUserAvatarUrl ?? null}
                    label={currentUserLabel}
                    size={52}
                  />
                  <View style={styles.contactCopy}>
                    <AppText numberOfLines={1} style={styles.contactName}>
                      {currentUserLabel}
                    </AppText>
                    <AppText style={styles.contactPhone}>
                      {myQrDelivery ? formatQrExpiry(myQrDelivery.expiresAt) : 'Generando QR...'}
                    </AppText>
                  </View>
                </View>

                {myQrMessage ? <MessageBanner message={myQrMessage} tone="neutral" /> : null}

                <View
                  style={[
                    styles.qrCodeShell,
                    {
                      backgroundColor: activeTheme.colors.white,
                      borderColor: activeTheme.colors.border,
                    },
                  ]}
                >
                  {myQrLink ? (
                    <QRCode
                      backgroundColor={activeTheme.colors.white}
                      color={activeTheme.colors.black}
                      size={210}
                      value={myQrLink}
                    />
                  ) : (
                    <View style={styles.qrLoading}>
                      <Ionicons color={activeTheme.colors.muted} name="sync-outline" size={28} />
                      <AppText style={[styles.helperText, { color: activeTheme.colors.muted }]}>
                        {busyKey === 'my-qr' ? 'Creando QR temporal...' : 'Toca renovar QR.'}
                      </AppText>
                    </View>
                  )}
                </View>

                <View style={styles.qrModalActions}>
                  <PrimaryAction
                    compact
                    disabled={!myQrLink}
                    label="Compartir enlace"
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

          <AddPersonContactOptionsModal
            busyKey={busyKey}
            inviteAvailableLabel={CONTACT_CAN_RECEIVE_INVITE_LABEL}
            onCancel={() => setPendingContactSelection(null)}
            onCreateOutreach={handleCreateOutreach}
            onReviewPhone={handleReviewPhone}
            pendingContactOptions={pendingContactOptions}
            pendingContactSelection={pendingContactSelection}
            presentation="inline"
          />

          <ContactActionFeedbackOverlay
            alias={contactActionFeedback?.alias}
            message={contactActionFeedback?.message}
            mode={contactActionFeedback?.mode}
            presentation="inline"
            title={contactActionFeedback?.title}
            variant={contactActionFeedback?.variant}
            visible={Boolean(contactActionFeedback)}
          />
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function resolveManualInviteAlias(searchValue: string, phoneE164: string): string {
  const namePart = searchValue
    .replace(/[+\d().\-\s]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

  return namePart.length > 0 ? namePart : formatPhonePreview(phoneE164);
}
