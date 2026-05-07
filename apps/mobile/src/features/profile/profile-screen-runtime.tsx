import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import type { ScrollView } from 'react-native';

import { AvatarOptionsSheet } from '@/components/avatar-options-sheet';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AppTextInput, type AppTextInputRef } from '@/components/app-text-input';
import { IDENTITY_FLOW_CONTENT_MAX_WIDTH, IdentityFlowIdentity } from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { prepareAvatarImageForUpload } from '@/lib/avatar-image';
import { presentLimitedContactsAccessPicker } from '@/lib/contacts-permissions';
import {
  triggerAppActionHaptic,
  triggerAppSelectionHaptic,
  triggerAppSuccessHaptic,
  triggerAppWarningHaptic,
} from '@/lib/app-haptics';
import {
  useAppSnapshot,
  useRequestAccountDeletionMutation,
  useUpdateProfileAvatarMutation,
} from '@/lib/live-data';
import { cancelScheduledReminders, scheduleDailyPendingReminder } from '@/lib/notifications';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import {
  resolveTrustedDeviceAuthMethods,
  resolveTrustMethodLabel,
} from '@/lib/trusted-device-auth';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import type { TrustedDeviceAuthMethod } from '@/providers/session/types';
import {
  formatContactsPermissionStateLabel,
  formatContactsPermissionSubtitle,
  formatDeviceStateLabel,
  formatDeviceTitle,
  formatStepUpFailure,
  resolveContactsPermissionActionLabel,
  resolveContactsPermissionTone,
  resolveProfileFocusRequest,
  type RowTone,
} from './profile-helpers';
import { AppText } from '@/components/app-text';

type IoniconName = keyof typeof Ionicons.glyphMap;

const PRIVACY_POLICY_URL = 'https://app.happy-circles.com/privacy';
const TERMS_URL = 'https://app.happy-circles.com/terms';
const SUPPORT_URL = 'https://app.happy-circles.com/support';

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

function resolveRowTone(tone: RowTone) {
  if (tone === 'success') {
    return {
      backgroundColor: theme.colors.successSoft,
      color: theme.colors.success,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
    };
  }

  if (tone === 'primary') {
    return {
      backgroundColor: theme.colors.primarySoft,
      color: theme.colors.primary,
    };
  }

  return {
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.textMuted,
  };
}

function rowStatusTone(tone: RowTone): StatusChipProps['tone'] {
  if (tone === 'success') {
    return 'success';
  }

  if (tone === 'danger') {
    return 'danger';
  }

  if (tone === 'primary') {
    return 'primary';
  }

  return 'neutral';
}

function ProfileStatusRow({
  icon,
  status,
  subtitle,
  title,
  tone = 'muted',
  trailing,
}: {
  readonly icon: IoniconName;
  readonly status?: string;
  readonly subtitle?: string;
  readonly title: string;
  readonly tone?: RowTone;
  readonly trailing?: ReactNode;
}) {
  const visual = resolveRowTone(tone);

  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusIcon, { backgroundColor: visual.backgroundColor }]}>
        <Ionicons color={visual.color} name={icon} size={20} />
      </View>
      <View style={styles.textWrap}>
        <AppText style={styles.rowTitle}>{title}</AppText>
        {subtitle ? <AppText style={styles.rowSubtitle}>{subtitle}</AppText> : null}
      </View>
      {trailing ??
        (status ? <StatusChip compact label={status} tone={rowStatusTone(tone)} /> : null)}
    </View>
  );
}

export function ProfileScreen() {
  const params = useLocalSearchParams<{ focus?: string; section?: string }>();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const avatarMutation = useUpdateProfileAvatarMutation();
  const accountDeletionMutation = useRequestAccountDeletionMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [localAvatarPath, setLocalAvatarPath] = useState<string | null>(null);
  const [attachPassword, setAttachPassword] = useState('');
  const [attachPasswordConfirm, setAttachPasswordConfirm] = useState('');
  const [trustPassword, setTrustPassword] = useState('');
  const [trustPasswordFallbackOpen, setTrustPasswordFallbackOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const accountOffsetRef = useRef(0);
  const methodsOffsetRef = useRef(0);
  const deviceOffsetRef = useRef(0);
  const accountMeasuredRef = useRef(false);
  const methodsMeasuredRef = useRef(false);
  const deviceMeasuredRef = useRef(false);
  const trustPasswordInputRef = useRef<AppTextInputRef | null>(null);
  const attachPasswordInputRef = useRef<AppTextInputRef | null>(null);
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightTarget, setHighlightTarget] = useState<'account' | 'methods' | 'device' | null>(
    null,
  );

  const accountLabel =
    currentUserProfile?.displayName ??
    session.profile?.display_name ??
    session.email ??
    'Sin sesion';
  const profileAvatarUrl = localAvatarPath ?? currentUserProfile?.avatarUrl ?? null;
  const canViewProfileAvatar = Boolean(profileAvatarUrl);
  const accountEmailValue =
    currentUserProfile?.email ?? session.profile?.email ?? session.email ?? '';
  const accountEmail = accountEmailValue || 'Sin correo';
  const reminderSummary = snapshotQuery.isLoading
    ? 'Calculando...'
    : pendingCount > 0
      ? `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''} hoy`
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
  const showTrustPasswordFallback =
    hasPasswordTrustMethod &&
    !session.canTrustCurrentDeviceWithoutPassword &&
    (trustPasswordFallbackOpen || socialTrustMethods.length === 0);
  const setupEntryStep = session.setupState.pendingRequiredSteps[0] ?? 'security';
  const completeProfileHref = buildSetupAccountHref(setupEntryStep);

  const clearFocusTimers = useCallback(() => {
    if (pendingScrollTimeoutRef.current) {
      clearTimeout(pendingScrollTimeoutRef.current);
      pendingScrollTimeoutRef.current = null;
    }

    if (delayedFocusTimeoutRef.current) {
      clearTimeout(delayedFocusTimeoutRef.current);
      delayedFocusTimeoutRef.current = null;
    }

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  const queueHighlightReset = useCallback(() => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightTarget(null);
      highlightTimeoutRef.current = null;
    }, 2600);
  }, []);

  const focusProfileSection = useCallback(
    (focusTarget: string | null, sectionTarget: string | null) => {
      const focusRequest = resolveProfileFocusRequest({
        canTrustCurrentDeviceWithoutPassword: session.canTrustCurrentDeviceWithoutPassword,
        focusTarget,
        hasEmailPassword: session.linkedMethods.hasEmailPassword,
        isTrustedDevice: session.isTrustedDevice,
        sectionTarget,
      });
      if (!focusRequest) {
        return false;
      }

      const scrollToAccount = () => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, accountOffsetRef.current - 24),
          animated: true,
        });
        setHighlightTarget('account');
        queueHighlightReset();
      };

      const scrollToMethods = () => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, methodsOffsetRef.current - 24),
          animated: true,
        });
        setHighlightTarget('methods');
        queueHighlightReset();
      };

      const scrollToDevice = () => {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, deviceOffsetRef.current - 24),
          animated: true,
        });
        setHighlightTarget('device');
        queueHighlightReset();
      };

      if (focusRequest.inputTarget === 'attach-password') {
        if (!methodsMeasuredRef.current || !attachPasswordInputRef.current) {
          return false;
        }

        scrollToMethods();
        delayedFocusTimeoutRef.current = setTimeout(() => {
          attachPasswordInputRef.current?.focus();
          delayedFocusTimeoutRef.current = null;
        }, 220);
        return true;
      }

      if (focusRequest.inputTarget === 'trust-password') {
        if (!deviceMeasuredRef.current || !trustPasswordInputRef.current) {
          setTrustPasswordFallbackOpen(true);
          return false;
        }

        setTrustPasswordFallbackOpen(true);
        scrollToDevice();
        delayedFocusTimeoutRef.current = setTimeout(() => {
          trustPasswordInputRef.current?.focus();
          delayedFocusTimeoutRef.current = null;
        }, 220);
        return true;
      }

      if (focusRequest.highlightTarget === 'device') {
        if (!deviceMeasuredRef.current) {
          return false;
        }

        scrollToDevice();
        return true;
      }

      if (focusRequest.highlightTarget === 'account') {
        if (!accountMeasuredRef.current) {
          return false;
        }

        scrollToAccount();
        return true;
      }

      if (focusRequest.highlightTarget === 'methods') {
        if (!methodsMeasuredRef.current) {
          return false;
        }

        scrollToMethods();
        return true;
      }

      return false;
    },
    [
      queueHighlightReset,
      session.canTrustCurrentDeviceWithoutPassword,
      session.isTrustedDevice,
      session.linkedMethods.hasEmailPassword,
    ],
  );

  useEffect(() => {
    const focusTarget = typeof params.focus === 'string' ? params.focus : null;
    const sectionTarget = typeof params.section === 'string' ? params.section : null;
    if (!focusTarget && !sectionTarget) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const attemptFocus = () => {
      if (cancelled) {
        return;
      }

      if (focusProfileSection(focusTarget, sectionTarget)) {
        pendingScrollTimeoutRef.current = null;
        return;
      }

      attempts += 1;
      if (attempts >= 10) {
        pendingScrollTimeoutRef.current = null;
        return;
      }

      pendingScrollTimeoutRef.current = setTimeout(attemptFocus, 120);
    };

    pendingScrollTimeoutRef.current = setTimeout(attemptFocus, 60);

    return () => {
      cancelled = true;
      clearFocusTimers();
    };
  }, [clearFocusTimers, focusProfileSection, params.focus, params.section]);

  useEffect(() => () => clearFocusTimers(), [clearFocusTimers]);

  async function runAction(actionKey: string, action: () => Promise<string>) {
    triggerImpactHaptic();
    setBusyAction(actionKey);
    setMessage(null);

    try {
      const result = await action();
      setMessage(result);
      return result;
    } catch (error) {
      const failureMessage =
        error instanceof Error ? error.message : 'No se pudo completar esta accion.';
      setMessage(failureMessage);
      return failureMessage;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTrustDevice(method: TrustedDeviceAuthMethod) {
    const result = await runAction(`trust-device-${method}`, async () =>
      session.trustCurrentDevice(
        method === 'password' && !session.canTrustCurrentDeviceWithoutPassword
          ? { method, password: trustPassword }
          : { method },
      ),
    );

    if (result === 'Este dispositivo ahora es confiable.') {
      triggerSuccessHaptic();
      setTrustPassword('');
      setTrustPasswordFallbackOpen(false);
    }
  }

  async function openExternalUrl(url: string, failureMessage: string) {
    triggerSelectionHaptic();

    try {
      await Linking.openURL(url);
    } catch {
      setMessage(failureMessage);
    }
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

      await cancelScheduledReminders();
      if (pendingCount > 0) {
        await scheduleDailyPendingReminder();
      }

      setMessage('Recordatorios activados.');
      return;
    }

    await session.setNotificationsEnabled(false);
    await cancelScheduledReminders();
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

    if (result.includes('Enviamos') || result.includes('ya esta confirmado')) {
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
      setMessage('Necesitas permitir acceso a la camara para tomar la foto.');
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
    await runAction('request-account-deletion', async () => {
      if (!session.isTrustedDevice) {
        throw new Error('Valida este dispositivo antes de eliminar tu cuenta.');
      }

      const authResult = await session.stepUpAuth(true);
      if (!authResult.success) {
        throw new Error(formatStepUpFailure(authResult.error, session.biometricLabel));
      }

      await accountDeletionMutation.mutateAsync();
      await session.signOut();

      return 'Tu cuenta fue eliminada. Conservamos solo el ledger y auditoria minima para integridad financiera.';
    });
  }

  function confirmAccountDeletion() {
    triggerSelectionHaptic();
    Alert.alert(
      'Eliminar cuenta',
      'Anonimizaremos tu perfil, borraremos foto y datos de contacto, revocaremos tus dispositivos y cerraremos tu sesion. Conservamos el ledger y auditoria minima para que los saldos financieros sigan siendo consistentes.',
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
      'Cerrar sesion',
      'Al cerrar sesion, la biometria dejara de abrir esta cuenta hasta que vuelvas a entrar con tu contrasena. Despues, si la biometria sigue activa, podras desbloquear la app como siempre.',
      [
        { style: 'cancel', text: 'Cancelar' },
        {
          style: 'destructive',
          text: 'Cerrar sesion',
          onPress: () => void session.signOut(),
        },
      ],
    );
  }

  return (
    <ScreenShell
      contentContainerStyle={styles.centeredContent}
      contentWidthStyle={styles.contentWidth}
      headerLeading={<View style={styles.headerActionPlaceholder} />}
      headerSlot={
        <Pressable
          accessibilityLabel="Cerrar sesion"
          accessibilityRole="button"
          hitSlop={8}
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.headerSignOutButton, pressed ? styles.rowPressed : null]}
        >
          <Ionicons color={theme.colors.danger} name="log-out-outline" size={20} />
        </Pressable>
      }
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      scrollViewRef={scrollViewRef}
      title="Happy Circles"
      titleAlign="center"
    >
      <View style={styles.accountHeader}>
        <IdentityFlowIdentity
          avatarLabel={accountLabel}
          avatarUrl={profileAvatarUrl}
          disabled={avatarMutation.isPending}
          editable
          onPress={openAvatarOptions}
          variant="avatar"
        />
        <View style={styles.accountCopy}>
          <AppText style={styles.accountValue}>{accountLabel}</AppText>
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
              style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
            >
              <AppText style={styles.inlineButtonText}>Abrir setup</AppText>
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
                    pressed && busyAction === null ? styles.rowPressed : null,
                    busyAction !== null ? styles.disabledButton : null,
                  ]}
                >
                  <AppText style={styles.inlineButtonText}>
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
                  ? 'Primero valida este dispositivo'
                  : 'No disponible'
            }
            title="Biometria"
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
                    pressed && busyAction === null ? styles.rowPressed : null,
                    busyAction !== null ? styles.disabledButton : null,
                  ]}
                >
                  <AppText style={styles.inlineButtonText}>
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
            subtitle="Correo y clave"
            title="Clave"
            tone={session.linkedMethods.hasEmailPassword ? 'success' : 'danger'}
          />
          {!session.linkedMethods.hasEmailPassword ? (
            <View style={styles.actionCluster}>
              <AppTextInput
                autoCapitalize="none"
                onChangeText={setAttachPassword}
                placeholder="Nueva clave"
                placeholderTextColor={theme.colors.muted}
                ref={attachPasswordInputRef}
                secureTextEntry
                style={styles.input}
                value={attachPassword}
              />
              <AppTextInput
                autoCapitalize="none"
                onChangeText={setAttachPasswordConfirm}
                placeholder="Confirmar clave"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry
                style={styles.input}
                value={attachPasswordConfirm}
              />
              <View style={styles.inlineActionRow}>
                <PrimaryAction
                  compact
                  fullWidth={false}
                  label={busyAction === 'attach-password' ? 'Guardando...' : 'Agregar clave'}
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
                  onPress={() => void runAction('link-google', async () => session.linkGoogle())}
                  style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
                >
                  <AppText style={styles.inlineButtonText}>
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
                      onPress={() => void runAction('link-apple', async () => session.linkApple())}
                      style={({ pressed }) => [
                        styles.inlineButton,
                        pressed ? styles.rowPressed : null,
                      ]}
                    >
                      <AppText style={styles.inlineButtonText}>
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
                  style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
                >
                  <AppText style={styles.inlineButtonText}>
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
          <AppText style={styles.sectionTitle}>Dispositivos</AppText>
        </View>

        <View style={styles.sectionList}>
          <ProfileStatusRow
            icon="phone-portrait"
            status={session.isTrustedDevice ? 'Confiable' : 'Pendiente'}
            subtitle={formatDeviceStateLabel(session.deviceTrustState)}
            title="Dispositivo actual"
            tone={session.isTrustedDevice ? 'success' : 'danger'}
          />

          {!session.isTrustedDevice ? (
            <View style={styles.actionCluster}>
              {session.canTrustCurrentDeviceWithoutPassword ? (
                <AppText style={styles.sectionBody}>
                  Confirmaste tu clave hace poco. Puedes confiar este telefono sin escribirla otra
                  vez.
                </AppText>
              ) : null}
              <View style={styles.inlineActionRow}>
                {socialTrustMethods.map((method) => (
                  <PrimaryAction
                    compact
                    disabled={busyAction !== null}
                    fullWidth={false}
                    key={method}
                    label={
                      busyAction === `trust-device-${method}`
                        ? 'Validando...'
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
                        ? 'Validando...'
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
                    pressed && busyAction === null ? styles.rowPressed : null,
                    busyAction !== null ? styles.disabledButton : null,
                  ]}
                >
                  <AppText style={styles.inlineButtonText}>
                    {showTrustPasswordFallback ? 'Ocultar clave' : 'Usar clave'}
                  </AppText>
                </Pressable>
              ) : null}
              {showTrustPasswordFallback ? (
                <>
                  <AppTextInput
                    autoCapitalize="none"
                    onChangeText={setTrustPassword}
                    placeholder="Tu clave actual"
                    placeholderTextColor={theme.colors.muted}
                    ref={trustPasswordInputRef}
                    secureTextEntry
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
                          ? 'Validando...'
                          : resolveTrustMethodLabel({
                              canTrustCurrentDeviceWithoutPassword:
                                session.canTrustCurrentDeviceWithoutPassword,
                              method: 'password',
                            })
                      }
                      onPress={busyAction ? undefined : () => void handleTrustDevice('password')}
                    />
                  </View>
                </>
              ) : null}
              {trustMethods.length === 0 ? (
                <AppText style={styles.sectionBody}>
                  Esta cuenta no tiene un metodo disponible para revalidar el dispositivo.
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
                        pressed ? styles.rowPressed : null,
                      ]}
                    >
                      <AppText style={styles.inlineButtonDangerText}>
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
                'No pudimos abrir la politica de privacidad.',
              )
            }
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="shield-checkmark"
              subtitle="Uso de datos, retencion y derechos"
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
              void openExternalUrl(TERMS_URL, 'No pudimos abrir los terminos de servicio.')
            }
            style={({ pressed }) => [pressed ? styles.rowPressed : null]}
          >
            <ProfileStatusRow
              icon="document-text"
              subtitle="Reglas de uso y responsabilidades"
              title="Terminos"
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
            Esta accion es irreversible.
          </AppText>

          <Pressable
            accessibilityRole="button"
            disabled={busyAction === 'request-account-deletion'}
            onPress={confirmAccountDeletion}
            style={({ pressed }) => [
              styles.inlineButtonDanger,
              pressed ? styles.rowPressed : null,
              busyAction === 'request-account-deletion' ? styles.disabledButton : null,
            ]}
          >
            <AppText style={styles.inlineButtonDangerText}>
              {busyAction === 'request-account-deletion' ? 'Eliminando...' : 'Eliminar cuenta'}
            </AppText>
          </Pressable>
        </View>
      </View>

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
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centeredContent: {},
  contentWidth: {
    maxWidth: IDENTITY_FLOW_CONTENT_MAX_WIDTH,
  },
  headerActionPlaceholder: {
    width: 40,
  },
  headerSignOutButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  accountHeader: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  accountCopy: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    maxWidth: 340,
    width: '100%',
  },
  accountEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  accountValue: {
    color: theme.colors.text,
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  focusPanel: {
    borderColor: theme.colors.primary,
    ...theme.shadow.card,
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
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: 56,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  statusText: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  rowPressed: {
    opacity: 0.72,
  },
  separator: {
    backgroundColor: theme.colors.hairline,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  actionCluster: {
    gap: theme.spacing.sm,
    paddingLeft: 52,
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
