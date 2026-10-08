import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { attachEmailPasswordSchema } from '@happy-circles/shared';

import { AvatarOptionsSheet } from '@/components/avatar-options-sheet';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AccountActionFeedbackOverlay } from '@/components/account-action-feedback-overlay';
import { AppHeaderBackButton } from '@/components/app-header-back-button';
import { AppText } from '@/components/app-text';
import type { AppTextInputRef } from '@/components/app-text-input';
import { MessageBanner } from '@/components/message-banner';
import { PasswordTextInput } from '@/components/password-text-input';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { prepareAvatarImageForUpload } from '@/lib/avatar-image';
import { presentLimitedContactsAccessPicker } from '@/lib/contacts-permissions';
import {
  triggerAppActionHaptic as triggerImpactHaptic,
  triggerAppSelectionHaptic as triggerSelectionHaptic,
  triggerAppSuccessHaptic as triggerSuccessHaptic,
  triggerAppWarningHaptic as triggerWarningHaptic,
} from '@/lib/app-haptics';
import { useActionFeedbackOverlay } from '@/lib/action-feedback';
import { isIdentityConfirmationCancelled } from '@/lib/live-data/mutations/sensitive-action-check';
import {
  notificationViewedKeysWithLocalCache,
  useAppSnapshot,
  useRequestAccountDeletionMutation,
  useUpdateProfileAvatarMutation,
} from '@/lib/live-data';
import { backOrReturnTo, pushRoute } from '@/lib/navigation';
import { showBlockedActionAlert } from '@/lib/action-feedback';
import { buildNotificationSummary } from '@/lib/notification-summary';
import { buildSetupAccountHref, isLowQualityDisplayName } from '@/lib/setup-account';
import { buildPendingSetupReminderItems } from '@/lib/setup-reminder';
import { theme } from '@/lib/theme';
import {
  resolveTrustedDeviceAuthMethods,
  resolveTrustMethodLabel,
} from '@/lib/trusted-device-auth';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useIdentityConfirmation } from '@/providers/identity-confirmation-provider';
import { formatValidationMessage } from '@/providers/session/auth-errors';
import { useSession } from '@/providers/session-provider';
import { useAppTheme } from '@/providers/theme-provider';
import type { TrustedDeviceAuthMethod } from '@/providers/session/types';
import {
  formatContactsPermissionStateLabel,
  formatContactsPermissionSubtitle,
  formatDeviceStateLabel,
  formatDeviceTitle,
  resolveContactsPermissionActionLabel,
  resolveContactsPermissionTone,
} from './profile-helpers';
import { ProfileAccountHeader } from './profile-account-header';
import { useProfileDeviceRevokeController } from './profile-device-revoke-controller';
import { ProfileDeviceRevokeModal } from './profile-device-revoke-modal';
import { useProfileFocusController } from './profile-focus-controller';
import { ProfileLegalDangerSection } from './profile-legal-danger-section';
import { ProfileStatusRow } from './profile-status-row';

import { ProfileSetupReminderSection } from './profile-setup-reminder-section';
import { ThemePreferenceSection } from './theme-preference-section';
import { styles } from './profile-screen-runtime.styles';

export function ProfileScreen() {
  const params = useLocalSearchParams<{ focus?: string; section?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const { confirmIdentity } = useIdentityConfirmation();
  const activeTheme = useAppTheme();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const topInset = Math.max(0, insets.top);
  const profileContentContainerStyle = useMemo(
    () => [styles.centeredContent, { paddingTop: topInset + theme.spacing.xs }],
    [topInset],
  );
  const pendingSection = snapshotQuery.data?.activitySections.find(
    (section) => section.key === 'pending',
  );
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;
  const setupReminderItems = useMemo(() => buildPendingSetupReminderItems(session), [session]);
  const notificationViewedKeys = useMemo(
    () =>
      notificationViewedKeysWithLocalCache(
        session.userId,
        snapshotQuery.data?.notificationViewedKeys ?? [],
      ),
    [session.userId, snapshotQuery.data?.notificationViewedKeys],
  );
  const notificationSummary = useMemo(
    () =>
      buildNotificationSummary(
        [...setupReminderItems, ...(pendingSection?.items ?? [])],
        notificationViewedKeys,
      ),
    [notificationViewedKeys, pendingSection?.items, setupReminderItems],
  );
  const totalPendingCount = pendingCount + setupReminderItems.length;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const avatarMutation = useUpdateProfileAvatarMutation();
  const accountDeletionMutation = useRequestAccountDeletionMutation();
  const actionFeedback = useActionFeedbackOverlay();
  const displayNameInputRef = useRef<AppTextInputRef | null>(null);
  const headerSignOutButtonThemeStyle = useMemo(
    () => ({
      backgroundColor: activeTheme.colors.dangerSoft,
      borderColor: activeTheme.colors.danger,
    }),
    [activeTheme],
  );
  const inlineButtonThemeStyle = useMemo(
    () => ({
      backgroundColor: activeTheme.colors.surfaceSoft,
      borderColor: activeTheme.colors.border,
    }),
    [activeTheme],
  );
  const inlineButtonTextThemeStyle = useMemo(
    () => ({
      color: activeTheme.colors.text,
    }),
    [activeTheme],
  );
  const inlineDangerButtonThemeStyle = useMemo(
    () => ({
      backgroundColor: activeTheme.colors.dangerSoft,
      borderColor: activeTheme.colors.danger,
    }),
    [activeTheme],
  );
  const inlineDangerButtonTextThemeStyle = useMemo(
    () => ({
      color: activeTheme.colors.danger,
    }),
    [activeTheme],
  );
  const accountNameIconButtonThemeStyle = useMemo(
    () => ({
      backgroundColor: activeTheme.colors.surfaceSoft,
      borderColor: activeTheme.colors.border,
    }),
    [activeTheme],
  );

  const [message, setMessage] = useState<string | null>(null);
  const [localAvatarPath, setLocalAvatarPath] = useState<string | null>(null);
  const [localDisplayName, setLocalDisplayName] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [displayNameEditing, setDisplayNameEditing] = useState(false);
  const [attachPassword, setAttachPassword] = useState('');
  const [attachPasswordConfirm, setAttachPasswordConfirm] = useState('');
  const [trustPassword, setTrustPassword] = useState('');
  const [trustMethodPickerOpen, setTrustMethodPickerOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busyActionRef = useRef<string | null>(null);
  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const {
    close: closeRevokeDevice,
    confirm: confirmRevokeDevice,
    deviceId: revokeDeviceId,
    error: revokeError,
    handlePasswordChange: handleRevokePasswordChange,
    open: openRevokeDevice,
    password: revokePassword,
    passwordInputRef: revokePasswordInputRef,
  } = useProfileDeviceRevokeController({
    busy: busyAction?.startsWith('revoke-') ?? false,
    revokeTrustedDevice: (deviceId, input) => session.revokeTrustedDevice(deviceId, input),
    runAction,
    showActionMessage,
  });

  const baseAccountLabel =
    session.profile?.display_name ??
    currentUserProfile?.displayName ??
    session.email ??
    'Sin sesión';
  const accountLabel = localDisplayName ?? baseAccountLabel;
  const profileAvatarUrl = localAvatarPath ?? currentUserProfile?.avatarUrl ?? null;
  const canViewProfileAvatar = Boolean(profileAvatarUrl);
  const accountEmailValue =
    currentUserProfile?.email ?? session.profile?.email ?? session.email ?? '';
  const accountEmail = accountEmailValue || 'Sin correo';
  const happyCircleScore = snapshotQuery.data?.happyCircleScore ?? null;
  const happyCircleFaces = happyCircleScore?.totalFaces ?? 0;
  const happyCircleClosedCount = happyCircleScore?.closedCircleCount ?? 0;
  const reminderSummary = snapshotQuery.isLoading
    ? 'Calculando...'
    : notificationSummary.unreadCount > 0
      ? `${notificationSummary.unreadCount} sin ver`
      : totalPendingCount > 0
        ? 'Todo lo pendiente ya fue visto'
        : 'Sin pendientes';
  const contactsPermissionStatus = session.setupState.contactsPermissionStatus;
  const contactsActionLabel = resolveContactsPermissionActionLabel(contactsPermissionStatus);
  const phoneLabel = session.profile?.phone_e164 ?? 'Falta completar';
  const trustMethods = resolveTrustedDeviceAuthMethods({
    canTrustCurrentDeviceWithoutPassword: session.canTrustCurrentDeviceWithoutPassword,
    hasApple: session.linkedMethods.hasApple && session.appleSignInAvailable,
    hasEmailPassword: session.linkedMethods.hasEmailPassword,
    hasGoogle: session.linkedMethods.hasGoogle,
  });
  const socialTrustMethods = trustMethods.filter(
    (method) => method === 'google' || method === 'apple',
  );
  const hasRecentTrustMethod = trustMethods.includes('recent_auth');
  const hasPasswordTrustMethod = trustMethods.includes('password');
  const setupEntryStep = session.setupState.pendingRequiredSteps[0] ?? 'security';
  const completeProfileHref = buildSetupAccountHref(setupEntryStep);
  const {
    accountMeasuredRef,
    accountOffsetRef,
    attachPasswordInputRef,
    deviceMeasuredRef,
    deviceOffsetRef,
    highlightTarget,
    methodsMeasuredRef,
    methodsOffsetRef,
    scrollViewRef,
    setTrustPasswordFallbackOpen,
    trustPasswordFallbackOpen,
    trustPasswordInputRef,
  } = useProfileFocusController({
    canTrustCurrentDeviceWithoutPassword: session.canTrustCurrentDeviceWithoutPassword,
    focusTarget: typeof params.focus === 'string' ? params.focus : null,
    hasEmailPassword: session.linkedMethods.hasEmailPassword,
    isTrustedDevice: session.isTrustedDevice,
    sectionTarget: typeof params.section === 'string' ? params.section : null,
  });
  const showTrustPasswordFallback =
    trustMethodPickerOpen &&
    hasPasswordTrustMethod &&
    (trustPasswordFallbackOpen || socialTrustMethods.length === 0);

  useEffect(() => {
    void session.refreshBiometricSupport();
  }, [session.refreshBiometricSupport]);

  useEffect(() => {
    if (trustPasswordFallbackOpen) {
      setTrustMethodPickerOpen(true);
    }
  }, [trustPasswordFallbackOpen]);

  useEffect(() => {
    if (!displayNameEditing) {
      return;
    }

    const focusTimer = setTimeout(() => {
      displayNameInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(focusTimer);
  }, [displayNameEditing]);

  function showActionMessage(nextMessage: string) {
    setMessage(nextMessage);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }

  async function runAction(
    actionKey: string,
    action: () => Promise<string>,
    options?: { readonly showMessage?: boolean },
  ) {
    if (busyActionRef.current) {
      const inProgressMessage = 'Ya hay una accion en curso.';
      showActionMessage(inProgressMessage);
      return inProgressMessage;
    }

    busyActionRef.current = actionKey;
    triggerImpactHaptic();
    setBusyAction(actionKey);
    setMessage(null);

    try {
      const result = await action();
      if (options?.showMessage !== false) {
        showActionMessage(result);
      }
      return result;
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : 'No se pudo completar esta acción.';
      if (options?.showMessage !== false) {
        showActionMessage(failureMessage);
      }
      return failureMessage;
    } finally {
      busyActionRef.current = null;
      setBusyAction(null);
    }
  }

  function startDisplayNameEdit() {
    if (busyActionRef.current) {
      showActionMessage('Ya hay una accion en curso.');
      return;
    }

    triggerSelectionHaptic();
    setMessage(null);
    setDisplayNameDraft(accountLabel);
    setDisplayNameEditing(true);
  }

  function cancelDisplayNameEdit() {
    if (busyAction === 'display-name') {
      return;
    }

    triggerSelectionHaptic();
    setDisplayNameDraft(accountLabel);
    setDisplayNameEditing(false);
  }

  async function saveDisplayName() {
    if (busyAction === 'display-name') {
      return;
    }

    const normalizedDisplayName = displayNameDraft.trim();

    if (isLowQualityDisplayName(normalizedDisplayName)) {
      triggerWarningHaptic();
      showActionMessage('Escribe tu nombre, no el correo.');
      displayNameInputRef.current?.focus();
      return;
    }

    if (normalizedDisplayName === accountLabel.trim()) {
      setDisplayNameDraft(accountLabel);
      setDisplayNameEditing(false);
      return;
    }

    const profile = session.profile;
    if (
      !profile?.phone_country_iso2 ||
      !profile.phone_country_calling_code ||
      !profile.phone_national_number
    ) {
      triggerWarningHaptic();
      showActionMessage('Completa tu celular antes de editar el nombre.');
      return;
    }

    const phoneCountryIso2 = profile.phone_country_iso2;
    const phoneCountryCallingCode = profile.phone_country_calling_code;
    const phoneNationalNumber = profile.phone_national_number;

    await runAction('display-name', async () => {
      const result = await session.completeProfile({
        fullName: normalizedDisplayName,
        phoneCountryIso2,
        phoneCountryCallingCode,
        phoneNationalNumber,
      });

      if (result !== 'Perfil actualizado.') {
        return result;
      }

      setLocalDisplayName(normalizedDisplayName);
      setDisplayNameDraft(normalizedDisplayName);
      setDisplayNameEditing(false);
      void snapshotQuery.refetch().catch(() => undefined);
      triggerSuccessHaptic();
      return 'Nombre actualizado.';
    });
  }

  async function handleTrustDevice(method?: TrustedDeviceAuthMethod) {
    const actionMethod = method ?? 'auto';
    const result = await runAction(`trust-device-${actionMethod}`, async () =>
      session.trustCurrentDevice(
        method === undefined
          ? undefined
          : method === 'password'
            ? { method, password: trustPassword }
            : { method },
      ),
    );

    if (result === 'Este teléfono ahora es confiable.') {
      triggerSuccessHaptic();
      setTrustPassword('');
      setTrustMethodPickerOpen(false);
      setTrustPasswordFallbackOpen(false);
    }

    if (result.startsWith('Escribe tu contrase') || result.startsWith('Confirma tu cuenta')) {
      triggerWarningHaptic();
      setTrustMethodPickerOpen(true);
      setTrustPasswordFallbackOpen(result.startsWith('Escribe tu contrase'));
    }
  }

  async function handleLinkSocial(target: 'google' | 'apple') {
    if (busyActionRef.current) return;
    const providerLabel = target === 'google' ? 'Google' : 'Apple';
    const confirmed = await confirmIdentity({
      actionLabel: `añadir ${providerLabel}`,
      purpose: 'sensitive',
      force: true,
    });
    if (!confirmed) return;
    const result = await runAction(`link-${target}`, () =>
      target === 'google' ? session.linkGoogle() : session.linkApple(),
    );
    if (result === `${providerLabel} vinculado.`) triggerSuccessHaptic();
  }

  async function handleAttachPassword() {
    if (busyActionRef.current) return;
    const input = { password: attachPassword, confirmPassword: attachPasswordConfirm };
    const validation = attachEmailPasswordSchema.safeParse(input);
    if (!validation.success) {
      showActionMessage(formatValidationMessage(validation.error));
      return;
    }
    const confirmed = await confirmIdentity({
      actionLabel: 'agregar una contraseña',
      purpose: 'sensitive',
      force: true,
    });
    if (!confirmed) return;
    await runAction('attach-password', () => session.attachEmailPassword(validation.data));
  }

  function handleTrustEntryPress() {
    triggerSelectionHaptic();

    Alert.alert('Confiar este celular', '', [
      {
        onPress: triggerWarningHaptic,
        style: 'cancel',
        text: 'Rechazar',
      },
      {
        onPress: () => {
          triggerImpactHaptic();
          void handleTrustDevice();
        },
        text: 'Confiar',
      },
    ]);
    return;
  }

  async function openExternalUrl(url: string, failureMessage: string) {
    triggerSelectionHaptic();

    try {
      await Linking.openURL(url);
    } catch {
      setMessage(failureMessage);
    }
  }

  function openHappyFaces() {
    triggerSelectionHaptic();
    pushRoute(router, '/circles' as Href);
  }

  async function handleBiometrics(nextValue: boolean) {
    triggerSelectionHaptic();
    await runAction('biometrics', async () => {
      const result = await session.setBiometricsEnabled(nextValue);
      if (!result.ok && !nextValue) {
        showBlockedActionAlert(result.message, { push: (href) => pushRoute(router, href) });
      }
      return result.message;
    });
  }

  async function handleNotifications(nextValue: boolean) {
    triggerSelectionHaptic();
    if (nextValue) {
      if (session.setupState.notificationsPermissionStatus === 'denied') {
        openAppSettings(
          'Notificaciones bloqueadas',
          'Abre Ajustes y permite notificaciones para activar recordatorios.',
          () => session.beginNotificationEnableFromSettings(),
        );
        return;
      }

      const result = await session.requestNotificationsPermission();
      if (result !== 'Recordatorios activados.') {
        setMessage(result);
        if (result.includes('Ajustes')) {
          openAppSettings(
            'Notificaciones bloqueadas',
            'Abre Ajustes y permite notificaciones para activar recordatorios.',
            () => session.beginNotificationEnableFromSettings(),
          );
        }
        return;
      }

      setMessage('Recordatorios activados.');
      return;
    }

    await session.setNotificationsEnabled(false);
    setMessage('Recordatorios desactivados.');
  }

  async function handleContactsPermission() {
    if (busyAction) {
      return;
    }

    triggerSelectionHaptic();

    if (contactsPermissionStatus === 'denied') {
      triggerWarningHaptic();
      openAppSettings(
        'Permiso de contactos bloqueado',
        'Abre Ajustes y permite contactos para encontrar personas desde tu agenda.',
      );
      return;
    }

    setBusyAction('contacts');
    setMessage(null);

    try {
      if (contactsPermissionStatus === 'limited') {
        await presentLimitedContactsAccessPicker();
      }

      const result = await session.requestContactsPermission();
      const resultMessage =
        contactsPermissionStatus === 'limited' && result.includes('compartio')
          ? 'Contactos actualizados. El acceso sigue limitado.'
          : result;
      setMessage(resultMessage);

      if (result === 'Contactos activados.' || result.includes('compartio')) {
        triggerSuccessHaptic();
      } else {
        triggerWarningHaptic();
      }

      if (result.includes('Ajustes')) {
        openAppSettings(
          'Permiso de contactos bloqueado',
          'Abre Ajustes y permite contactos para encontrar personas desde tu agenda.',
        );
      }
    } catch (error) {
      triggerWarningHaptic();
      setMessage(
        error instanceof Error ? error.message : 'No se pudo abrir el permiso de contactos.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResendEmailConfirmation() {
    if (!accountEmailValue) {
      triggerWarningHaptic();
      setMessage('Esta cuenta no tiene un correo disponible para reenviar.');
      return;
    }

    const result = await runAction('resend-email-confirmation', () =>
      session.resendEmailConfirmation(accountEmailValue),
    );

    if (result.includes('Enviamos') || result.includes('ya está confirmado')) {
      triggerSuccessHaptic();
    } else {
      triggerWarningHaptic();
    }
  }

  function openAppSettings(title: string, message: string, beforeOpen?: () => void) {
    Alert.alert(title, message, [
      { style: 'cancel', text: 'Ahora no' },
      {
        text: 'Abrir ajustes',
        onPress: () => {
          beforeOpen?.();
          void Linking.openSettings();
        },
      },
    ]);
  }

  async function uploadPickedAvatar(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    const previousLocalAvatarPath = localAvatarPath;
    setLocalAvatarPath(asset.uri);

    try {
      const preparedAvatar = await prepareAvatarImageForUpload(asset);
      const nextAvatarPath = await avatarMutation.mutateAsync(preparedAvatar);
      setLocalAvatarPath(nextAvatarPath);
      triggerSuccessHaptic();
      setMessage('Foto de perfil actualizada.');
    } catch (error) {
      setLocalAvatarPath(previousLocalAvatarPath);
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la foto.');
    }
  }

  async function handlePickAvatar() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ['images'],
        quality: 0.7,
      });

      await uploadPickedAvatar(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo abrir tus fotos.');
    }
  }

  async function handleTakeAvatarPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage('Necesitas permitir acceso a la cámara para tomar la foto.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      cameraType: ImagePicker.CameraType.front,
      mediaTypes: ['images'],
      quality: 0.7,
    });

    await uploadPickedAvatar(result);
  }

  function closeAvatarOptionsAndRun(action: () => void) {
    setAvatarOptionsVisible(false);
    requestAnimationFrame(action);
  }

  function openAvatarOptions() {
    if (avatarMutation.isPending) {
      return;
    }

    triggerSelectionHaptic();

    if (Platform.OS === 'ios') {
      const options = canViewProfileAvatar
        ? ['Ver foto', 'Tomar foto', 'Elegir foto', 'Cancelar']
        : ['Tomar foto', 'Elegir foto', 'Cancelar'];
      const cancelButtonIndex = options.length - 1;

      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex,
          options,
          title: 'Foto de perfil',
        },
        (selectedIndex) => {
          const selectedOption = options[selectedIndex];

          if (selectedOption === 'Ver foto') {
            setAvatarViewerVisible(true);
            return;
          }

          if (selectedOption === 'Tomar foto') {
            void handleTakeAvatarPhoto();
            return;
          }

          if (selectedOption === 'Elegir foto') {
            void handlePickAvatar();
          }
        },
      );
      return;
    }

    setAvatarOptionsVisible(true);
  }

  async function handleRequestAccountDeletion() {
    triggerImpactHaptic();
    setBusyAction('request-account-deletion');
    setMessage(null);
    actionFeedback.clear();

    try {
      if (
        !(await confirmIdentity({
          actionLabel: 'eliminar tu cuenta',
          purpose: 'sensitive',
          force: true,
        }))
      )
        return;
      await actionFeedback.runBlockingAction('requestAccountDeletion', async () => {
        await accountDeletionMutation.mutateAsync();
        triggerSuccessHaptic();
        await session.signOut();
      });
    } catch (error) {
      if (isIdentityConfirmationCancelled(error)) return;
      const failureMessage =
        error instanceof Error ? error.message : 'No se pudo eliminar tu cuenta.';
      setMessage(failureMessage);
      await actionFeedback.showResult({
        message: 'Intenta nuevamente',
        title: 'No se pudo',
        variant: 'danger',
      });
    } finally {
      setBusyAction(null);
    }
  }

  function confirmAccountDeletion() {
    triggerSelectionHaptic();
    Alert.alert(
      'Eliminar cuenta',
      'Anonimizaremos tu perfil, borraremos foto y datos de contacto, revocaremos tus dispositivos y cerraremos tu sesión. Conservamos el historial financiero mínimo para que los saldos sigan siendo consistentes.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          style: 'destructive',
          text: 'Eliminar cuenta',
          onPress: () => void handleRequestAccountDeletion(),
        },
      ],
    );
  }

  function confirmSignOut() {
    triggerSelectionHaptic();
    Alert.alert(
      'Cerrar sesión',
      'Al cerrar sesión, la biometría dejará de abrir esta cuenta hasta que vuelvas a entrar con tu contraseña. Después, si la biometría sigue activa, podrás desbloquear la app como siempre.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          style: 'destructive',
          text: 'Cerrar sesión',
          onPress: () => void session.signOut(),
        },
      ],
    );
  }

  return (
    <ScreenShell
      contentContainerStyle={profileContentContainerStyle}
      contentWidthStyle={styles.contentWidth}
      headerLeading={<AppHeaderBackButton onPress={() => backOrReturnTo(router, '/home')} />}
      headerSlot={
        <Pressable
          accessibilityLabel="Cerrar sesión"
          accessibilityRole="button"
          hitSlop={8}
          onPress={confirmSignOut}
          style={({ pressed }) => [
            styles.headerSignOutButton,
            headerSignOutButtonThemeStyle,
            pressed ? styles.rowPressed : null,
          ]}
        >
          <Ionicons color={activeTheme.colors.danger} name="log-out-outline" size={20} />
        </Pressable>
      }
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      safeAreaEdges={['left', 'right']}
      scrollViewRef={scrollViewRef}
      title="Happy Circles"
      titleAlign="center"
    >
      <ProfileAccountHeader
        accountEmail={accountEmail}
        accountLabel={accountLabel}
        accountNameIconButtonThemeStyle={accountNameIconButtonThemeStyle}
        activeTheme={activeTheme}
        avatarBusy={avatarMutation.isPending}
        busyAction={busyAction}
        displayNameDraft={displayNameDraft}
        displayNameEditing={displayNameEditing}
        displayNameInputRef={displayNameInputRef}
        happyCircleClosedCount={happyCircleClosedCount}
        happyCircleFaces={happyCircleFaces}
        onAvatarPress={openAvatarOptions}
        onCancelDisplayNameEdit={cancelDisplayNameEdit}
        onChangeDisplayNameDraft={setDisplayNameDraft}
        onOpenHappyFaces={openHappyFaces}
        onSaveDisplayName={() => void saveDisplayName()}
        onStartDisplayNameEdit={startDisplayNameEdit}
        profileAvatarUrl={profileAvatarUrl}
      />

      {message ? <MessageBanner message={message} /> : null}

      {!session.setupState.requiredComplete ? (
        <ProfileSetupReminderSection
          completeProfileHref={completeProfileHref}
          inlineButtonTextThemeStyle={inlineButtonTextThemeStyle}
          inlineButtonThemeStyle={inlineButtonThemeStyle}
        />
      ) : null}

      <View
        onLayout={(event) => {
          accountMeasuredRef.current = true;
          accountOffsetRef.current = event.nativeEvent.layout.y;
        }}
        style={[styles.sectionBlock, highlightTarget === 'account' ? styles.focusPanel : null]}
      >
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>Cuenta</AppText>
        </View>

        <View style={styles.sectionList}>
          <ProfileStatusRow
            icon="mail"
            status={session.isEmailConfirmed ? 'Listo' : 'Pendiente'}
            subtitle={
              session.isEmailConfirmed
                ? accountEmail
                : 'Confirma tu correo para activar invitaciones'
            }
            title="Correo"
            tone={session.isEmailConfirmed ? 'success' : 'danger'}
            trailing={
              session.isEmailConfirmed ? undefined : (
                <Pressable
                  disabled={busyAction !== null}
                  onPress={() => void handleResendEmailConfirmation()}
                  style={({ pressed }) => [
                    styles.inlineButton,
                    inlineButtonThemeStyle,
                    pressed && busyAction === null ? styles.rowPressed : null,
                    busyAction !== null ? styles.disabledButton : null,
                  ]}
                >
                  <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
                    {busyAction === 'resend-email-confirmation' ? 'Enviando...' : 'Reenviar'}
                  </AppText>
                </Pressable>
              )
            }
          />

          <View style={styles.separator} />

          <ProfileStatusRow
            icon="finger-print"
            subtitle={
              session.setupState.biometricsEligible
                ? session.biometricLabel
                : session.biometricAvailable
                  ? 'Primero confía este teléfono'
                  : 'Comprueba la huella o rostro del teléfono'
            }
            title="Biometría"
            tone={session.biometricsEnabled ? 'success' : 'muted'}
            trailing={
              <Switch
                disabled={
                  busyAction !== null || (!session.isTrustedDevice && !session.biometricsEnabled)
                }
                onValueChange={(nextValue) => void handleBiometrics(nextValue)}
                trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
                value={session.biometricsEnabled}
              />
            }
          />

          <View style={styles.separator} />

          <ProfileStatusRow
            icon="notifications"
            subtitle={reminderSummary}
            title="Recordatorios"
            tone={session.notificationsEnabled ? 'success' : 'muted'}
            trailing={
              <Switch
                onValueChange={(nextValue) => void handleNotifications(nextValue)}
                trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
                value={session.notificationsEnabled}
              />
            }
          />

          <View style={styles.separator} />

          <ProfileStatusRow
            icon="people"
            status={
              contactsActionLabel
                ? undefined
                : formatContactsPermissionStateLabel(contactsPermissionStatus)
            }
            subtitle={formatContactsPermissionSubtitle(contactsPermissionStatus)}
            title="Contactos"
            tone={resolveContactsPermissionTone(contactsPermissionStatus)}
            trailing={
              contactsActionLabel ? (
                <Pressable
                  disabled={busyAction !== null}
                  onPress={() => void handleContactsPermission()}
                  style={({ pressed }) => [
                    styles.inlineButton,
                    inlineButtonThemeStyle,
                    pressed && busyAction === null ? styles.rowPressed : null,
                    busyAction !== null ? styles.disabledButton : null,
                  ]}
                >
                  <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
                    {busyAction === 'contacts' ? 'Abriendo...' : contactsActionLabel}
                  </AppText>
                </Pressable>
              ) : undefined
            }
          />
        </View>
      </View>

      <View
        onLayout={(event) => {
          methodsMeasuredRef.current = true;
          methodsOffsetRef.current = event.nativeEvent.layout.y;
        }}
        style={[styles.sectionBlock, highlightTarget === 'methods' ? styles.focusPanel : null]}
      >
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>Metodos de acceso</AppText>
        </View>

        <View style={styles.sectionList}>
          <ProfileStatusRow
            icon="key"
            status={session.linkedMethods.hasEmailPassword ? 'Listo' : 'Pendiente'}
            subtitle="Correo y contraseña"
            title="Contraseña"
            tone={session.linkedMethods.hasEmailPassword ? 'success' : 'danger'}
          />
          {!session.linkedMethods.hasEmailPassword ? (
            <View style={styles.actionCluster}>
              <PasswordTextInput
                autoCapitalize="none"
                onChangeText={setAttachPassword}
                placeholder="Nueva contraseña"
                placeholderTextColor={theme.colors.muted}
                ref={attachPasswordInputRef}
                style={styles.input}
                value={attachPassword}
              />
              <PasswordTextInput
                autoCapitalize="none"
                onChangeText={setAttachPasswordConfirm}
                placeholder="Confirmar contraseña"
                placeholderTextColor={theme.colors.muted}
                style={styles.input}
                value={attachPasswordConfirm}
              />
              <View style={styles.inlineActionRow}>
                <PrimaryAction
                  compact
                  fullWidth={false}
                  label={busyAction === 'attach-password' ? 'Guardando...' : 'Agregar contraseña'}
                  onPress={busyAction ? undefined : () => void handleAttachPassword()}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.separator} />

          <ProfileStatusRow
            icon="logo-google"
            status={session.linkedMethods.hasGoogle ? 'Vinculado' : 'Disponible'}
            title="Google"
            tone={session.linkedMethods.hasGoogle ? 'success' : 'muted'}
            trailing={
              !session.linkedMethods.hasGoogle ? (
                <Pressable
                  disabled={busyAction !== null}
                  onPress={busyAction ? undefined : () => void handleLinkSocial('google')}
                  style={({ pressed }) => [
                    styles.inlineButton,
                    inlineButtonThemeStyle,
                    pressed && busyAction === null ? styles.rowPressed : null,
                    busyAction !== null ? styles.disabledButton : null,
                  ]}
                >
                  <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
                    {busyAction === 'link-google' ? 'Abriendo...' : 'Vincular'}
                  </AppText>
                </Pressable>
              ) : undefined
            }
          />

          {session.appleSignInAvailable ? (
            <>
              <View style={styles.separator} />
              <ProfileStatusRow
                icon="logo-apple"
                status={session.linkedMethods.hasApple ? 'Vinculado' : 'Disponible'}
                title="Apple"
                tone={session.linkedMethods.hasApple ? 'success' : 'muted'}
                trailing={
                  !session.linkedMethods.hasApple ? (
                    <Pressable
                      disabled={busyAction !== null}
                      onPress={busyAction ? undefined : () => void handleLinkSocial('apple')}
                      style={({ pressed }) => [
                        styles.inlineButton,
                        inlineButtonThemeStyle,
                        pressed && busyAction === null ? styles.rowPressed : null,
                        busyAction !== null ? styles.disabledButton : null,
                      ]}
                    >
                      <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
                        {busyAction === 'link-apple' ? 'Abriendo...' : 'Vincular'}
                      </AppText>
                    </Pressable>
                  ) : undefined
                }
              />
            </>
          ) : null}

          <View style={styles.separator} />

          <ProfileStatusRow
            icon="call"
            status={session.profile?.phone_e164 ? 'Listo' : 'Pendiente'}
            subtitle={phoneLabel}
            title="Celular"
            tone={session.profile?.phone_e164 ? 'success' : 'danger'}
            trailing={
              <Link
                href={buildSetupAccountHref('profile', {
                  editPhone: session.profile?.phone_e164 ? 'true' : undefined,
                  returnTo: session.profile?.phone_e164 ? 'profile' : undefined,
                })}
                asChild
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.inlineButton,
                    inlineButtonThemeStyle,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
                    {session.profile?.phone_e164 ? 'Editar' : 'Completar'}
                  </AppText>
                </Pressable>
              </Link>
            }
          />
        </View>
      </View>

      <View
        onLayout={(event) => {
          deviceMeasuredRef.current = true;
          deviceOffsetRef.current = event.nativeEvent.layout.y;
        }}
        style={[styles.sectionBlock, highlightTarget === 'device' ? styles.focusPanel : null]}
      >
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>Celular confiable</AppText>
        </View>

        <View style={styles.sectionList}>
          <ProfileStatusRow
            icon="phone-portrait"
            status={session.isTrustedDevice ? 'Confiable' : 'Pendiente'}
            subtitle={formatDeviceStateLabel(session.deviceTrustState)}
            title="Este teléfono"
            tone={session.isTrustedDevice ? 'success' : 'danger'}
          />

          {!session.isTrustedDevice ? (
            <View style={styles.actionCluster}>
              {!trustMethodPickerOpen ? (
                <View style={styles.inlineActionRow}>
                  <PrimaryAction
                    compact
                    disabled={busyAction !== null}
                    fullWidth={false}
                    label={
                      busyAction?.startsWith('trust-device-')
                        ? 'Confirmando...'
                        : 'Confiar este celular'
                    }
                    onPress={busyAction ? undefined : handleTrustEntryPress}
                  />
                </View>
              ) : (
                <>
                  <AppText style={styles.sectionBody}>
                    Elige cómo confirmar tu identidad para confiar este teléfono.
                  </AppText>
                  <View style={styles.inlineActionRow}>
                    {socialTrustMethods.map((method) => (
                      <PrimaryAction
                        compact
                        disabled={busyAction !== null}
                        fullWidth={false}
                        key={method}
                        label={
                          busyAction === `trust-device-${method}`
                            ? 'Confirmando...'
                            : resolveTrustMethodLabel({
                                canTrustCurrentDeviceWithoutPassword:
                                  session.canTrustCurrentDeviceWithoutPassword,
                                method,
                              })
                        }
                        onPress={busyAction ? undefined : () => void handleTrustDevice(method)}
                      />
                    ))}
                    {hasRecentTrustMethod ? (
                      <PrimaryAction
                        compact
                        disabled={busyAction !== null}
                        fullWidth={false}
                        label={
                          busyAction === 'trust-device-recent_auth'
                            ? 'Confirmando...'
                            : resolveTrustMethodLabel({
                                canTrustCurrentDeviceWithoutPassword:
                                  session.canTrustCurrentDeviceWithoutPassword,
                                method: 'recent_auth',
                              })
                        }
                        onPress={
                          busyAction ? undefined : () => void handleTrustDevice('recent_auth')
                        }
                      />
                    ) : null}
                  </View>
                  {hasPasswordTrustMethod ? (
                    <Pressable
                      disabled={busyAction !== null}
                      onPress={() => {
                        triggerSelectionHaptic();
                        setTrustPasswordFallbackOpen((open) => !open);
                      }}
                      style={({ pressed }) => [
                        styles.inlineButton,
                        inlineButtonThemeStyle,
                        pressed && busyAction === null ? styles.rowPressed : null,
                        busyAction !== null ? styles.disabledButton : null,
                      ]}
                    >
                      <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
                        {showTrustPasswordFallback ? 'Ocultar contraseña' : 'Usar contraseña'}
                      </AppText>
                    </Pressable>
                  ) : null}
                  {showTrustPasswordFallback ? (
                    <>
                      <PasswordTextInput
                        autoCapitalize="none"
                        onChangeText={setTrustPassword}
                        placeholder="Tu contraseña actual"
                        placeholderTextColor={theme.colors.muted}
                        ref={trustPasswordInputRef}
                        style={styles.input}
                        value={trustPassword}
                      />
                      <View style={styles.inlineActionRow}>
                        <PrimaryAction
                          compact
                          disabled={busyAction !== null}
                          fullWidth={false}
                          label={
                            busyAction === 'trust-device-password'
                              ? 'Confirmando...'
                              : resolveTrustMethodLabel({
                                  canTrustCurrentDeviceWithoutPassword:
                                    session.canTrustCurrentDeviceWithoutPassword,
                                  method: 'password',
                                })
                          }
                          onPress={
                            busyAction ? undefined : () => void handleTrustDevice('password')
                          }
                        />
                      </View>
                    </>
                  ) : null}
                </>
              )}
              {trustMethodPickerOpen && trustMethods.length === 0 ? (
                <AppText style={styles.sectionBody}>
                  Agrega Google, Apple o una contraseña para poder confiar este teléfono.
                </AppText>
              ) : null}
            </View>
          ) : null}

          {session.trustedDevices.length > 0 ? <View style={styles.separator} /> : null}

          {session.trustedDevices.map((device, index) => (
            <View key={device.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <ProfileStatusRow
                icon="phone-portrait-outline"
                status={formatDeviceStateLabel(device.trust_state)}
                subtitle={device.app_version ? `v${device.app_version}` : undefined}
                title={formatDeviceTitle(
                  device.device_id,
                  session.currentDeviceId,
                  device.platform,
                )}
                tone={device.trust_state === 'trusted' ? 'success' : 'muted'}
                trailing={
                  device.trust_state !== 'revoked' ? (
                    <Pressable
                      onPress={() => openRevokeDevice(device.device_id)}
                      style={({ pressed }) => [
                        styles.inlineButtonDanger,
                        inlineDangerButtonThemeStyle,
                        pressed ? styles.rowPressed : null,
                      ]}
                    >
                      <AppText
                        style={[styles.inlineButtonDangerText, inlineDangerButtonTextThemeStyle]}
                      >
                        {busyAction === `revoke-${device.device_id}` ? 'Revocando...' : 'Revocar'}
                      </AppText>
                    </Pressable>
                  ) : undefined
                }
              />
            </View>
          ))}
        </View>
      </View>

      <ThemePreferenceSection />

      <ProfileLegalDangerSection
        busyAction={busyAction}
        inlineDangerButtonTextThemeStyle={inlineDangerButtonTextThemeStyle}
        inlineDangerButtonThemeStyle={inlineDangerButtonThemeStyle}
        onConfirmAccountDeletion={confirmAccountDeletion}
        onOpenExternalUrl={(url, failureMessage) => void openExternalUrl(url, failureMessage)}
      />

      <ProfileDeviceRevokeModal
        activeTheme={activeTheme}
        busy={busyAction?.startsWith('revoke-') ?? false}
        deviceId={revokeDeviceId}
        error={revokeError}
        hasApple={session.linkedMethods.hasApple && session.appleSignInAvailable}
        hasGoogle={session.linkedMethods.hasGoogle}
        hasPassword={session.linkedMethods.hasEmailPassword}
        inputRef={revokePasswordInputRef}
        onClose={closeRevokeDevice}
        onPasswordChange={handleRevokePasswordChange}
        onSubmit={(method) => void confirmRevokeDevice(method)}
        password={revokePassword}
      />

      <AvatarOptionsSheet
        canViewPhoto={canViewProfileAvatar}
        onChoosePhoto={() => closeAvatarOptionsAndRun(() => void handlePickAvatar())}
        onClose={() => setAvatarOptionsVisible(false)}
        onTakePhoto={() => closeAvatarOptionsAndRun(() => void handleTakeAvatarPhoto())}
        onViewPhoto={() => closeAvatarOptionsAndRun(() => setAvatarViewerVisible(true))}
        visible={avatarOptionsVisible}
      />

      <AvatarViewerModal
        imageUrl={profileAvatarUrl}
        label={accountLabel}
        onClose={() => setAvatarViewerVisible(false)}
        visible={avatarViewerVisible}
      />
      <AccountActionFeedbackOverlay {...actionFeedback.overlayProps} />
    </ScreenShell>
  );
}
