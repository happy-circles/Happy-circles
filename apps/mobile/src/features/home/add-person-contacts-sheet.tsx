import { useMemo, useRef } from 'react';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';

import { addPersonContactsSheetStyles as styles } from '@/features/home/add-person-contacts-sheet.styles';
import { AppAvatar } from '@/components/app-avatar';
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
import {
  AddPersonInPersonQrBlock,
  AddPersonSearchControls,
  AddPersonTransactionContextBlock,
} from '@/features/home/add-person-in-person-controls';
import { type PeopleTargetResolution } from '@/lib/live-data';
import { useAppTheme } from '@/providers/theme-provider';
import { useAddPersonContactsSheetController } from '@/features/home/add-person-contacts-sheet-controller';
import { type ContactCandidate } from '@/features/invites/people-outreach-utils';
import { AppText } from '@/components/app-text';

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
  const activeTheme = useAppTheme();
  const hasMultiplePhones = contact.phoneOptions.length > 1;
  const action = actionMetaForResolution(resolution, hasMultiplePhones);
  const disabled = action.disabled || busy;
  const actionBackgroundColor =
    action.tone === 'invite'
      ? activeTheme.colors.warning
      : action.tone === 'muted'
        ? activeTheme.colors.muted
        : activeTheme.colors.primary;

  return (
    <View
      style={[
        styles.contactRow,
        { backgroundColor: activeTheme.colors.surfaceMuted },
        shouldShowInApp(resolution)
          ? {
              backgroundColor: activeTheme.colors.successSoft,
              borderColor: activeTheme.colors.successSoft,
              borderWidth: 1,
            }
          : null,
      ]}
    >
      <AppAvatar
        fallbackBackgroundColor={contactAvatarColor(contact, activeTheme)}
        fallbackTextColor={activeTheme.colors.white}
        label={contact.alias}
        size={44}
      />
      <View style={styles.contactCopy}>
        <AppText numberOfLines={1} style={styles.contactName}>
          {contact.alias}
        </AppText>
        <AppText numberOfLines={2} style={styles.contactPhone}>
          {contactMeta(contact.primaryPhone)}
        </AppText>
      </View>
      <Pressable
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
        style={({ pressed }) => [
          styles.contactActionButton,
          { backgroundColor: actionBackgroundColor },
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Ionicons
          color={activeTheme.colors.white}
          name={busy ? 'sync-outline' : action.icon}
          size={14}
        />
        <AppText numberOfLines={1} style={styles.contactActionText}>
          {busy ? '...' : action.label}
        </AppText>
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
  const activeTheme = useAppTheme();
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
  const stickySearchIndex = transactionContext ? 2 : 1;
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
                { useNativeDriver: true },
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
                        busyKey === 'expand-contacts' ? 'Abriendo agenda...' : 'Ver mas contactos'
                      }
                      onPress={busyKey ? undefined : () => void handleExpandLimitedContactsAccess()}
                      variant="secondary"
                    />
                  ) : null}

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
                  {renderContactSection('Invitar a Happy Circles', inviteContacts)}

                  {displayedContactsCount === 0 && !contactsLoading ? (
                    <View style={styles.emptyState}>
                      <AppText style={styles.emptyTitle}>
                        {searchValue.trim().length > 0 ? 'Sin resultados' : 'Sin contactos utiles'}
                      </AppText>
                      <AppText style={styles.emptyText}>
                        {searchValue.trim().length > 0
                          ? 'Prueba con otro nombre o celular.'
                          : 'No encontramos contactos con numero en la agenda disponible.'}
                      </AppText>
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
                    Asi vemos quien ya esta en Happy Circles y quien necesita invitacion.
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
                      Centra el QR de Happy Circles en la camara.
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
        <View style={[styles.optionScrim, { backgroundColor: activeTheme.colors.overlay }]}>
          <Pressable
            onPress={() => setPendingContactSelection(null)}
            style={styles.sheetBackdrop}
          />
          <View style={[styles.optionCard, { backgroundColor: activeTheme.colors.surface }]}>
            <AppText style={styles.optionTitle}>Elige el numero</AppText>
            <AppText style={styles.emptyText}>
              {pendingContactSelection
                ? `${pendingContactSelection.alias} tiene varios numeros.`
                : ''}
            </AppText>
            <View style={styles.optionList}>
              {pendingContactOptions.map(({ contact, resolution }) => {
                const phoneOption = contact.primaryPhone;
                const action = actionMetaForResolution(resolution, false);
                const disabled = action.disabled || busyKey === phoneOption.phoneE164;

                return (
                  <View
                    key={phoneOption.id}
                    style={[styles.optionRow, { backgroundColor: activeTheme.colors.surfaceMuted }]}
                  >
                    <View style={styles.contactCopy}>
                      <AppText style={styles.contactName}>{contactMeta(phoneOption)}</AppText>
                      <AppText style={styles.contactPhone}>
                        {resolution?.status === 'active_user'
                          ? 'Ya esta en Happy Circles'
                          : resolution?.status === 'already_related'
                            ? 'Agregado'
                            : resolution?.status === 'pending_friendship'
                              ? 'Pendiente'
                              : 'Puede recibir invitacion'}
                      </AppText>
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
                        {
                          backgroundColor:
                            action.tone === 'invite'
                              ? activeTheme.colors.warning
                              : action.tone === 'muted'
                                ? activeTheme.colors.muted
                                : activeTheme.colors.primary,
                        },
                        pressed && !disabled ? styles.pressed : null,
                        disabled ? styles.disabled : null,
                      ]}
                    >
                      <Ionicons color={activeTheme.colors.white} name={action.icon} size={14} />
                      <AppText style={styles.contactActionText}>{action.label}</AppText>
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
