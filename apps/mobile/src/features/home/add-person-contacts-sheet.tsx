import { useCallback, useMemo, useRef } from 'react';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  SectionList,
  Platform,
  Pressable,
  View,
  type ViewToken,
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
import {
  AddPersonManualInviteCard,
  resolveManualInviteAlias,
} from './add-person-manual-invite-card';
import { AppText } from '@/components/app-text';
import { buildManualPhoneE164 } from '@/features/invites/people-outreach-utils';

const CONTACT_CAN_RECEIVE_INVITE_LABEL = 'Puede recibir invitación';
const AnimatedContactList = Animated.createAnimatedComponent(SectionList<EnrichedContact>);

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
    handleViewableContactsChanged,
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

  const contactPressRef = useRef(handleContactPress);
  contactPressRef.current = handleContactPress;
  const onContactPress = useCallback((contact: EnrichedContact['contact']) => {
    void contactPressRef.current(contact);
  }, []);
  const contactSections = useMemo(
    () =>
      [
        { title: 'En Happy Circles', data: inAppContacts },
        { title: 'Agregar a Happy Circles', data: unresolvedContacts },
        { title: 'Invitar a Happy Circles', data: inviteContacts },
      ].filter((section) => section.data.length > 0),
    [inAppContacts, unresolvedContacts, inviteContacts],
  );
  const viewableContactsRef = useRef(handleViewableContactsChanged);
  viewableContactsRef.current = handleViewableContactsChanged;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 20,
    minimumViewTime: 100,
  }).current;
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<EnrichedContact>[] }) => {
      viewableContactsRef.current(
        viewableItems
          .filter((token) => token.isViewable && token.item?.contact)
          .map((token) => token.item.contact),
      );
    },
    [],
  );
  const renderContact = useCallback(
    ({ item }: { item: EnrichedContact }) => (
      <ContactRow
        busy={item.contact.phoneOptions.some((phone) => busyKey === phone.phoneE164)}
        contact={item.contact}
        onPress={onContactPress}
        resolution={item.resolution}
      />
    ),
    [busyKey, onContactPress],
  );

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

  const manualInviteCard = (
    <AddPersonManualInviteCard
      phoneE164={manualInvitePhoneE164}
      busy={manualInviteBusy}
      disabled={Boolean(busyKey)}
      onPress={handleManualInvitePress}
    />
  );

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

            <AddPersonSearchControls
              busyKey={busyKey}
              onOpenScanner={() => void handleOpenScanner()}
              onShowMyQr={() => void handleShowMyQr()}
              searchValue={searchValue}
              compactActionsStyle={compactActionsRevealStyle}
              setSearchValue={setSearchValue}
            />

            <AnimatedContactList
              style={{ flex: 1 }}
              contentContainerStyle={styles.sheetContent}
              sections={canReadContacts ? contactSections : []}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              keyExtractor={(item) => item.contact.contactId}
              renderItem={renderContact}
              renderSectionHeader={({ section }) => (
                <AppText style={styles.sectionLabel}>{section.title}</AppText>
              )}
              extraData={busyKey}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              onEndReached={hasMoreContactsToDisplay ? requestMoreContacts : undefined}
              onEndReachedThreshold={0.5}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: compactActionsRevealY } } }],
                { useNativeDriver: true },
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={styles.contactSection}>
                  {' '}
                  <AddPersonInPersonQrBlock
                    busyKey={busyKey}
                    onOpenScanner={() => void handleOpenScanner()}
                    onShowMyQr={() => void handleShowMyQr()}
                  />
                  {transactionContext ? (
                    <AddPersonTransactionContextBlock transactionContext={transactionContext} />
                  ) : null}
                  {message ? <MessageBanner message={message} tone="neutral" /> : null}
                  {canReadContacts ? (
                    <>
                      {contactsPermissionStatus === 'limited' ? (
                        <PrimaryAction
                          compact
                          disabled={Boolean(busyKey)}
                          label={
                            busyKey === 'expand-contacts'
                              ? 'Abriendo agenda...'
                              : 'Ver más contactos'
                          }
                          onPress={
                            busyKey ? undefined : () => void handleExpandLimitedContactsAccess()
                          }
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
                        <AppText style={styles.helperText}>
                          Terminando de revisar la agenda...
                        </AppText>
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
                            busyKey === 'request-contacts'
                              ? 'Abriendo permiso...'
                              : 'Usar mi agenda'
                          }
                          onPress={busyKey ? undefined : () => void requestContactsAccess()}
                          variant="secondary"
                        />
                      ) : null}
                      {manualInviteCard}
                    </View>
                  )}
                </View>
              }
              ListFooterComponent={
                canReadContacts ? (
                  <View style={styles.contactSection}>
                    {' '}
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
                        {manualInviteCard}
                      </View>
                    ) : null}
                  </View>
                ) : null
              }
            />
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
