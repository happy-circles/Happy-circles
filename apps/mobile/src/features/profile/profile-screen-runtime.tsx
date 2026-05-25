import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarOptionsSheet } from '@/components/avatar-options-sheet';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AccountActionFeedbackOverlay } from '@/components/account-action-feedback-overlay';
import { AppText } from '@/components/app-text';
import { AppTextInput, type AppTextInputRef } from '@/components/app-text-input';
import { HappyFacesCounter } from '@/components/happy-faces-counter';
import { IDENTITY_FLOW_CONTENT_MAX_WIDTH, IdentityFlowIdentity } from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { PasswordTextInput } from '@/components/password-text-input';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { prepareAvatarImageForUpload } from '@/lib/avatar-image';
import { presentLimitedContactsAccessPicker } from '@/lib/contacts-permissions';
import {
  triggerAppActionHaptic,
  triggerAppSelectionHaptic,
  triggerAppSuccessHaptic,
  triggerAppWarningHaptic,
} from '@/lib/app-haptics';
import { useActionFeedbackOverlay } from '@/lib/action-feedback';
import {
  notificationViewedKeysWithLocalCache,
  useAppSnapshot,
  useRequestAccountDeletionMutation,
  useUpdateProfileAvatarMutation,
} from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { buildNotificationSummary } from '@/lib/notification-summary';
import { buildSetupAccountHref, isLowQualityDisplayName } from '@/lib/setup-account';
import { buildPendingSetupReminderItems } from '@/lib/setup-reminder';
import { theme } from '@/lib/theme';
import {
  resolveTrustedDeviceAuthMethods,
  resolveTrustMethodLabel,
} from '@/lib/trusted-device-auth';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import { useAppTheme } from '@/providers/theme-provider';
import type { TrustedDeviceAuthMethod } from '@/providers/session/types';
import {
  formatContactsPermissionStateLabel,
  formatContactsPermissionSubtitle,
  formatDeviceStateLabel,
  formatDeviceTitle,
  formatStepUpFailure,
  resolveContactsPermissionActionLabel,
  resolveContactsPermissionTone,
} from './profile-helpers';
import { useProfileFocusController } from './profile-focus-controller';
import { ProfileStatusRow } from './profile-status-row';
import { ThemePreferenceSection } from './theme-preference-section';

const PRIVACY_POLICY_URL = 'https://app.happy-circles.com/privacy';
const TERMS_URL = 'https://app.happy-circles.com/terms';
const SUPPORT_URL = 'https://app.happy-circles.com/support';
type SocialStepUpTarget = 'apple' | 'google';

function triggerSelectionHaptic() {
  triggerAppSelectionHaptic();
}
function triggerImpactHaptic() {
  triggerAppActionHaptic();
}
function triggerSuccessHaptic() {
  triggerAppSuccessHaptic();
}
function triggerWarningHaptic() {
  triggerAppWarningHaptic();
}

export function ProfileScreen() {
  const params = useLocalSearchParams<{ focus?: string; section?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
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
  const socialStepUpInputRef = useRef<AppTextInputRef | null>(null);
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
  const [socialStepUpPassword, setSocialStepUpPassword] = useState('');
  const [socialStepUpError, setSocialStepUpError] = useState<string | null>(null);
  const [socialStepUpTarget, setSocialStepUpTarget] = useState<SocialStepUpTarget | null>(null);
  const [trustMethodPickerOpen, setTrustMethodPickerOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busyActionRef = useRef<string | null>(null);
  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);

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
    hasApple: session.linkedMethods.hasApple,
    hasEmailPassword: session.linkedMethods.hasEmailPassword,
    hasGoogle: session.linkedMethods.hasGoogle,
  });
  const socialTrustMethods = trustMethods.filter((method) => method !== 'password');
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
    !session.canTrustCurrentDeviceWithoutPassword &&
    (trustPasswordFallbackOpen || socialTrustMethods.length === 0);

  useEffect(() => {
    if (trustPasswordFallbackOpen) {
      setTrustMethodPickerOpen(true);
    }
  }, [trustPasswordFallbackOpen]);

  useEffect(() => {
    if (
      (socialStepUpTarget === 'google' && session.linkedMethods.hasGoogle) ||
      (socialStepUpTarget === 'apple' && session.linkedMethods.hasApple)
    ) {
      setSocialStepUpPassword('');
      setSocialStepUpError(null);
      setSocialStepUpTarget(null);
    }
  }, [session.linkedMethods.hasApple, session.linkedMethods.hasGoogle, socialStepUpTarget]);

  useEffect(() => {
    if (!socialStepUpTarget) {
      return;
    }

    const focusTimer = setTimeout(() => {
      socialStepUpInputRef.current?.focus();
    }, 180);

    return () => clearTimeout(focusTimer);
  }, [socialStepUpTarget]);

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
          : method === 'password' && !session.canTrustCurrentDeviceWithoutPassword
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

    if (result.startsWith('Escribe tu contrase')) {
      triggerWarningHaptic();
      setTrustMethodPickerOpen(true);
      setTrustPasswordFallbackOpen(true);
    }
  }

  function shouldOfferSocialPasswordStepUp(result: string): boolean {
    return (
      session.linkedMethods.hasEmailPassword &&
      result.startsWith('Este dispositivo no puede usar ')
    );
  }

  function closeSocialStepUpPrompt() {
    triggerSelectionHaptic();
    setSocialStepUpPassword('');
    setSocialStepUpError(null);
    setSocialStepUpTarget(null);
  }

  function handleSocialStepUpPasswordChange(nextPassword: string) {
    setSocialStepUpPassword(nextPassword);
    if (socialStepUpError) {
      setSocialStepUpError(null);
    }
  }

  async function handleLinkSocial(target: SocialStepUpTarget, password?: string) {
    const providerLabel = target === 'google' ? 'Google' : 'Apple';
    const actionKey = password === undefined ? `link-${target}` : `link-${target}-password`;

    if (password !== undefined && !password.trim()) {
      triggerWarningHaptic();
      setSocialStepUpError(`Escribe tu contraseña para añadir ${providerLabel} Auth.`);
      return;
    }

    setSocialStepUpError(null);
    const result = await runAction(
      actionKey,
      () =>
        target === 'google'
          ? session.linkGoogle(password === undefined ? undefined : { password })
          : session.linkApple(password === undefined ? undefined : { password }),
      { showMessage: false },
    );

    if (result === `${providerLabel} vinculado.`) {
      triggerSuccessHaptic();
      setSocialStepUpPassword('');
      setSocialStepUpError(null);
      setSocialStepUpTarget(null);
      showActionMessage(result);
      return;
    }

    if (shouldOfferSocialPasswordStepUp(result)) {
      triggerWarningHaptic();
      setSocialStepUpPassword('');
      setSocialStepUpError(null);
      setSocialStepUpTarget(target);
      return;
    }

    triggerWarningHaptic();
    if (password === undefined) {
      showActionMessage(result);
      return;
    }

    setSocialStepUpError(result);
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
    const result = await session.setBiometricsEnabled(nextValue);
    setMessage(result.message);
  }

  async function handleNotifications(nextValue: boolean) {
    triggerSelectionHaptic();
    if (nextValue) {
      if (session.setupState.notificationsPermissionStatus === 'denied') {
        openAppSettings(
          'Notificaciones bloqueadas',
          'Abre Ajustes y permite notificaciones para activar recordatorios.',
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

  function openAppSettings(title: string, message: string) {
    Alert.alert(title, message, [
      { style: 'cancel', text: 'Ahora no' },
      { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
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
      await actionFeedback.runBlockingAction('requestAccountDeletion', async () => {
        if (!session.isTrustedDevice) {
          throw new Error('Confía este teléfono antes de eliminar tu cuenta.');
        }

        const authResult = await session.stepUpAuth(true);
        if (!authResult.success) {
          throw new Error(formatStepUpFailure(authResult.error, session.biometricLabel));
        }

        await accountDeletionMutation.mutateAsync();
        triggerSuccessHaptic();
        await session.signOut();
      });
    } catch (error) {
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

  const socialStepUpProviderLabel = socialStepUpTarget === 'google' ? 'Google' : 'Apple';
  const socialStepUpBusyAction =
    socialStepUpTarget === null ? null : `link-${socialStepUpTarget}-password`;

  return (
    <ScreenShell
      contentContainerStyle={profileContentContainerStyle}
      contentWidthStyle={styles.contentWidth}
      headerLeading={<View style={styles.headerActionPlaceholder} />}
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
      <View style={styles.accountHeader}>
        <View style={styles.profileScoreRow}>
          <HappyFacesCounter
            compact
            closedCircleCount={happyCircleClosedCount}
            onPress={openHappyFaces}
            totalFaces={happyCircleFaces}
            variant="reward"
          />
        </View>
        <IdentityFlowIdentity
          avatarLabel={accountLabel}
          avatarUrl={profileAvatarUrl}
          disabled={avatarMutation.isPending}
          editable
          onPress={openAvatarOptions}
          variant="avatar"
        />
        <View style={styles.accountCopy}>
          {displayNameEditing ? (
            <View style={styles.accountNameEditor}>
              <AppTextInput
                accessibilityLabel="Nombre"
                autoCapitalize="words"
                density="compact"
                editable={busyAction !== 'display-name'}
                onChangeText={setDisplayNameDraft}
                onSubmitEditing={() => void saveDisplayName()}
                placeholder="Nombre y apellido"
                ref={displayNameInputRef}
                returnKeyType="done"
                selectTextOnFocus
                style={styles.accountNameInput}
                value={displayNameDraft}
              />
              <View style={styles.accountNameActions}>
                <Pressable
                  accessibilityLabel="Guardar nombre"
                  accessibilityRole="button"
                  disabled={busyAction !== null}
                  hitSlop={8}
                  onPress={() => void saveDisplayName()}
                  style={({ pressed }) => [
                    styles.accountNameIconButton,
                    accountNameIconButtonThemeStyle,
                    pressed && busyAction === null ? styles.rowPressed : null,
                    busyAction !== null ? styles.disabledButton : null,
                  ]}
                >
                  <Ionicons color={activeTheme.colors.primary} name="checkmark" size={18} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Cancelar edicion de nombre"
                  accessibilityRole="button"
                  disabled={busyAction === 'display-name'}
                  hitSlop={8}
                  onPress={cancelDisplayNameEdit}
                  style={({ pressed }) => [
                    styles.accountNameIconButton,
                    accountNameIconButtonThemeStyle,
                    pressed && busyAction !== 'display-name' ? styles.rowPressed : null,
                    busyAction === 'display-name' ? styles.disabledButton : null,
                  ]}
                >
                  <Ionicons color={activeTheme.colors.textMuted} name="close" size={18} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.accountNameRow}>
              <AppText numberOfLines={2} style={styles.accountValue}>
                {accountLabel}
              </AppText>
              <Pressable
                accessibilityLabel="Editar nombre"
                accessibilityRole="button"
                hitSlop={8}
                onPress={startDisplayNameEdit}
                style={({ pressed }) => [
                  styles.accountNameIconButton,
                  accountNameIconButtonThemeStyle,
                  pressed ? styles.rowPressed : null,
                ]}
              >
                <Ionicons color={activeTheme.colors.textMuted} name="pencil" size={16} />
              </Pressable>
            </View>
          )}
          <AppText style={styles.accountMeta}>{accountEmail}</AppText>
        </View>
      </View>

      {message ? <MessageBanner message={message} /> : null}

      {!session.setupState.requiredComplete ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitle}>Setup pendiente</AppText>
          </View>
          <Link href={completeProfileHref} asChild>
            <Pressable
              style={({ pressed }) => [
                styles.inlineButton,
                inlineButtonThemeStyle,
                pressed ? styles.rowPressed : null,
              ]}
            >
              <AppText style={[styles.inlineButtonText, inlineButtonTextThemeStyle]}>
                Completar configuración
              </AppText>
            </Pressable>
          </Link>
        </View>
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
                  : 'No disponible'
            }
            title="Biometría"
            tone={session.biometricsEnabled ? 'success' : 'muted'}
            trailing={
              <Switch
                disabled={!session.setupState.biometricsEligible && !session.biometricsEnabled}
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
                  onPress={
                    busyAction
                      ? undefined
                      : () =>
                          void runAction('attach-password', async () =>
                            session.attachEmailPassword({
                              password: attachPassword,
                              confirmPassword: attachPasswordConfirm,
                            }),
                          )
                  }
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
                  onPress={
                    busyAction
                      ? undefined
                      : () => void handleLinkSocial('google')
                  }
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
                      onPress={
                        busyAction
                          ? undefined
                          : () => void handleLinkSocial('apple')
                      }
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
                    {hasPasswordTrustMethod && session.canTrustCurrentDeviceWithoutPassword ? (
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
                        onPress={busyAction ? undefined : () => void handleTrustDevice('password')}
                      />
                    ) : null}
                  </View>
                  {hasPasswordTrustMethod && !session.canTrustCurrentDeviceWithoutPassword ? (
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
                      onPress={() =>
                        void runAction(`revoke-${device.device_id}`, async () =>
                          session.revokeTrustedDevice(device.device_id),
                        )
                      }
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

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>Legal y soporte</AppText>
        </View>

        <View style={styles.sectionList}>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              void openExternalUrl(
                PRIVACY_POLICY_URL,
                'No pudimos abrir la política de privacidad.',
              )
            }
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="shield-checkmark"
              subtitle="Uso de datos, retención y derechos"
              title="Privacidad"
              tone="primary"
              trailing={
                <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
              }
            />
          </Pressable>

          <View style={styles.separator} />

          <Pressable
            accessibilityRole="link"
            onPress={() =>
              void openExternalUrl(TERMS_URL, 'No pudimos abrir los términos de servicio.')
            }
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="document-text"
              subtitle="Reglas de uso y responsabilidades"
              title="Términos"
              tone="muted"
              trailing={
                <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
              }
            />
          </Pressable>

          <View style={styles.separator} />

          <Pressable
            accessibilityRole="link"
            onPress={() => void openExternalUrl(SUPPORT_URL, 'No pudimos abrir soporte.')}
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="help-circle"
              subtitle="soporte@happy-circles.com"
              title="Soporte"
              tone="muted"
              trailing={
                <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={18} />
              }
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>Eliminar cuenta</AppText>
        </View>

        <View style={styles.accountDeletionRow}>
          <AppText style={[styles.sectionBody, styles.accountDeletionBody]}>
            Esta acción es irreversible.
          </AppText>

          <Pressable
            accessibilityRole="button"
            disabled={busyAction === 'request-account-deletion'}
            onPress={confirmAccountDeletion}
            style={({ pressed }) => [
              styles.inlineButtonDanger,
              inlineDangerButtonThemeStyle,
              pressed ? styles.rowPressed : null,
              busyAction === 'request-account-deletion' ? styles.disabledButton : null,
            ]}
          >
            <AppText style={[styles.inlineButtonDangerText, inlineDangerButtonTextThemeStyle]}>
              {busyAction === 'request-account-deletion' ? 'Eliminando...' : 'Eliminar cuenta'}
            </AppText>
          </Pressable>
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={closeSocialStepUpPrompt}
        statusBarTranslucent
        transparent
        visible={socialStepUpTarget !== null}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.stepUpModalRoot}
        >
          <Pressable
            accessibilityLabel="Descartar validación"
            onPress={closeSocialStepUpPrompt}
            style={styles.stepUpModalBackdrop}
          />
          <View
            accessibilityRole="alert"
            accessibilityViewIsModal
            style={[styles.stepUpDialog, { backgroundColor: activeTheme.colors.surface }]}
          >
            <View style={styles.stepUpDialogHeader}>
              <View
                style={[
                  styles.stepUpDialogIcon,
                  { backgroundColor: activeTheme.colors.primarySoft },
                ]}
              >
                <Ionicons color={activeTheme.colors.primary} name="lock-closed" size={22} />
              </View>
              <View style={styles.stepUpDialogCopy}>
                <AppText style={[styles.stepUpDialogTitle, { color: activeTheme.colors.text }]}>
                  Confirmar con contraseña
                </AppText>
                <AppText style={[styles.stepUpDialogBody, { color: activeTheme.colors.textMuted }]}>
                  Este dispositivo no puede usar {session.biometricLabel}. Valida tu identidad para
                  añadir {socialStepUpProviderLabel} Auth.
                </AppText>
              </View>
            </View>

            <PasswordTextInput
              autoCapitalize="none"
              onChangeText={handleSocialStepUpPasswordChange}
              onSubmitEditing={() =>
                socialStepUpTarget
                  ? void handleLinkSocial(socialStepUpTarget, socialStepUpPassword)
                  : undefined
              }
              placeholder="Contraseña"
              placeholderTextColor={theme.colors.muted}
              ref={socialStepUpInputRef}
              returnKeyType="done"
              style={styles.input}
              value={socialStepUpPassword}
            />

            {socialStepUpError ? (
              <AppText style={[styles.stepUpDialogError, { color: activeTheme.colors.danger }]}>
                {socialStepUpError}
              </AppText>
            ) : null}

            <View style={styles.stepUpDialogActions}>
              <Pressable
                accessibilityRole="button"
                disabled={busyAction !== null}
                onPress={closeSocialStepUpPrompt}
                style={({ pressed }) => [
                  styles.stepUpDismissButton,
                  { borderColor: activeTheme.colors.border },
                  pressed && busyAction === null ? styles.rowPressed : null,
                  busyAction !== null ? styles.disabledButton : null,
                ]}
              >
                <AppText
                  style={[styles.stepUpDismissButtonText, { color: activeTheme.colors.text }]}
                >
                  Descartar
                </AppText>
              </Pressable>
              <PrimaryAction
                compact
                disabled={busyAction !== null || socialStepUpTarget === null}
                fullWidth={false}
                label={
                  busyAction === socialStepUpBusyAction
                    ? 'Validando...'
                    : `Añadir ${socialStepUpProviderLabel} Auth`
                }
                onPress={() =>
                  socialStepUpTarget
                    ? void handleLinkSocial(socialStepUpTarget, socialStepUpPassword)
                    : undefined
                }
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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

const styles = StyleSheet.create({
  centeredContent: {},
  contentWidth: {
    gap: theme.spacing.sm,
    maxWidth: IDENTITY_FLOW_CONTENT_MAX_WIDTH,
  },
  headerActionPlaceholder: {
    width: 40,
  },
  headerSignOutButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  accountHeader: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    position: 'relative',
    width: '100%',
  },
  profileScoreRow: {
    alignItems: 'flex-start',
    left: theme.spacing.xs,
    position: 'absolute',
    top: theme.spacing.xs,
    width: '100%',
    zIndex: 2,
  },
  accountCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    maxWidth: 340,
    width: '100%',
  },
  accountNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  accountNameEditor: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    maxWidth: '100%',
    width: '100%',
  },
  accountNameInput: {
    flex: 1,
    fontWeight: '700',
    minWidth: 0,
    textAlign: 'center',
  },
  accountNameActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  accountNameIconButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  accountValue: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  accountMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  sectionBlock: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
  },
  focusPanel: {
    backgroundColor: theme.colors.primaryGhost,
    borderRadius: theme.radius.small,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '800',
  },
  sectionList: {
    gap: theme.spacing.sm,
  },
  sectionBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 19,
  },
  accountDeletionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  accountDeletionBody: {
    flex: 1,
  },
  rowPressed: {
    opacity: 0.72,
  },
  separator: {
    backgroundColor: theme.colors.hairline,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  actionCluster: {
    gap: theme.spacing.sm,
    paddingLeft: 52,
  },
  stepUpModalRoot: {
    alignItems: 'center',
    backgroundColor: theme.colors.overlay,
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  stepUpModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  stepUpDialog: {
    borderRadius: theme.radius.medium,
    gap: theme.spacing.md,
    maxWidth: 420,
    padding: theme.spacing.lg,
    width: '100%',
    ...theme.shadow.floating,
  },
  stepUpDialogHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  stepUpDialogIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepUpDialogCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  stepUpDialogTitle: {
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 22,
  },
  stepUpDialogBody: {
    fontSize: theme.typography.footnote,
    lineHeight: 19,
  },
  stepUpDialogError: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 19,
  },
  stepUpDialogActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
  stepUpDismissButton: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  stepUpDismissButtonText: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  inlineActionRow: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  input: {
    minHeight: 48,
  },
  inlineButton: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  inlineButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlineButtonDanger: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.dangerSoft,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
  },
  inlineButtonDangerText: {
    color: theme.colors.danger,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.62,
  },
});
