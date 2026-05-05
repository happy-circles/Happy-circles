import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AppTextInput } from '@/components/app-text-input';
import { IDENTITY_FLOW_CONTENT_MAX_WIDTH, IdentityFlowIdentity } from '@/components/identity-flow';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import {
  triggerIdentityImpactHaptic,
  triggerIdentitySelectionHaptic,
  triggerIdentitySuccessHaptic,
  triggerIdentityWarningHaptic,
} from '@/lib/identity-flow-haptics';
import {
  useAppSnapshot,
  useRequestAccountDeletionMutation,
  useUpdateProfileAvatarMutation,
} from '@/lib/live-data';
import { cancelScheduledReminders, scheduleDailyPendingReminder } from '@/lib/notifications';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';

type RowTone = 'danger' | 'muted' | 'primary' | 'success';
type IoniconName = keyof typeof Ionicons.glyphMap;

const PRIVACY_POLICY_URL = 'https://app.happy-circles.com/privacy';
const TERMS_URL = 'https://app.happy-circles.com/terms';
const SUPPORT_URL = 'https://app.happy-circles.com/support';

function formatDeviceTitle(deviceId: string, currentDeviceId: string | null, platform: string) {
  const base = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : 'Web';
  return deviceId === currentDeviceId ? `${base} actual` : base;
}

function formatDeviceStateLabel(trustState: string) {
  if (trustState === 'trusted') {
    return 'Confiable';
  }

  if (trustState === 'revoked') {
    return 'Revocado';
  }

  return 'Pendiente';
}

function triggerSelectionHaptic() {
  triggerIdentitySelectionHaptic();
}

function triggerImpactHaptic() {
  triggerIdentityImpactHaptic();
}

function triggerSuccessHaptic() {
  triggerIdentitySuccessHaptic();
}

function triggerWarningHaptic() {
  triggerIdentityWarningHaptic();
}

function formatStepUpFailure(error: string | null, biometricLabel: string) {
  if (error === 'device_untrusted') {
    return 'Valida este dispositivo antes de eliminar tu cuenta.';
  }

  if (error === 'not_available' || error === 'not_enrolled' || error === 'passcode_not_set') {
    return `Este dispositivo no puede usar ${biometricLabel} para eliminar la cuenta.`;
  }

  if (error === 'lockout') {
    return `${biometricLabel} esta bloqueado temporalmente. Desbloquea el dispositivo y vuelve a intentar.`;
  }

  if (error === 'user_cancel') {
    return `Cancelaste ${biometricLabel}.`;
  }

  if (error === 'authentication_failed') {
    return `No se pudo validar ${biometricLabel} para eliminar la cuenta.`;
  }

  return 'No se pudo validar tu identidad para eliminar la cuenta.';
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
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ??
        (status ? (
          <Text style={[styles.statusText, { color: visual.color }]}>{status}</Text>
        ) : null)}
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const accountOffsetRef = useRef(0);
  const methodsOffsetRef = useRef(0);
  const deviceOffsetRef = useRef(0);
  const accountMeasuredRef = useRef(false);
  const methodsMeasuredRef = useRef(false);
  const deviceMeasuredRef = useRef(false);
  const trustPasswordInputRef = useRef<TextInput | null>(null);
  const attachPasswordInputRef = useRef<TextInput | null>(null);
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
  const accountEmailValue =
    currentUserProfile?.email ?? session.profile?.email ?? session.email ?? '';
  const accountEmail = accountEmailValue || 'Sin correo';
  const reminderSummary = snapshotQuery.isLoading
    ? 'Calculando...'
    : pendingCount > 0
      ? `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''} hoy`
      : 'Sin pendientes';
  const phoneLabel = session.profile?.phone_e164 ?? 'Falta completar';
  const primaryReauthLabel = useMemo(() => {
    if (session.linkedMethods.hasEmailPassword) {
      return 'Validar con clave';
    }

    if (session.linkedMethods.hasGoogle) {
      return 'Validar con Google';
    }

    if (session.linkedMethods.hasApple) {
      return 'Validar con Apple';
    }

    return 'Validar dispositivo';
  }, [
    session.linkedMethods.hasApple,
    session.linkedMethods.hasEmailPassword,
    session.linkedMethods.hasGoogle,
  ]);
  const setupEntryStep = session.setupState.pendingRequiredSteps[0] ?? 'security';
  const completeProfileHref = buildSetupAccountHref(setupEntryStep);
  const qaInviteEntryHref = {
    pathname: '/join',
    params: { preview: 'true' },
  } as unknown as Href;
  const qaTokenCreateHref = {
    pathname: '/join/[token]/create-account',
    params: { preview: 'true', token: 'preview-invite-token' },
  } as unknown as Href;

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
      const resolvedFocusTarget =
        focusTarget === 'trust-password' &&
        (!session.linkedMethods.hasEmailPassword || session.isTrustedDevice)
          ? 'device-help'
          : focusTarget === 'attach-password' && session.linkedMethods.hasEmailPassword
            ? 'methods'
            : focusTarget;

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

      if (resolvedFocusTarget === 'attach-password') {
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

      if (resolvedFocusTarget === 'trust-password') {
        if (!deviceMeasuredRef.current || !trustPasswordInputRef.current) {
          return false;
        }

        scrollToDevice();
        delayedFocusTimeoutRef.current = setTimeout(() => {
          trustPasswordInputRef.current?.focus();
          delayedFocusTimeoutRef.current = null;
        }, 220);
        return true;
      }

      if (
        resolvedFocusTarget === 'trust-device' ||
        resolvedFocusTarget === 'device-help' ||
        sectionTarget === 'device'
      ) {
        if (!deviceMeasuredRef.current) {
          return false;
        }

        scrollToDevice();
        return true;
      }

      if (
        resolvedFocusTarget === 'notifications' ||
        sectionTarget === 'notifications' ||
        sectionTarget === 'account'
      ) {
        if (!accountMeasuredRef.current) {
          return false;
        }

        scrollToAccount();
        return true;
      }

      if (resolvedFocusTarget === 'methods' || sectionTarget === 'methods') {
        if (!methodsMeasuredRef.current) {
          return false;
        }

        scrollToMethods();
        return true;
      }

      return false;
    },
    [queueHighlightReset, session.isTrustedDevice, session.linkedMethods.hasEmailPassword],
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

    try {
      const nextAvatarPath = await avatarMutation.mutateAsync({
        uri: result.assets[0].uri,
        contentType: result.assets[0].mimeType,
      });
      setLocalAvatarPath(nextAvatarPath);
      triggerSuccessHaptic();
      setMessage('Foto de perfil actualizada.');
    } catch (error) {
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

  function openAvatarOptions() {
    if (avatarMutation.isPending) {
      return;
    }

    triggerSelectionHaptic();

    if (Platform.OS === 'ios') {
      const options = currentUserProfile?.avatarUrl
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

    Alert.alert('Foto de perfil', undefined, [
      ...(currentUserProfile?.avatarUrl
        ? [{ text: 'Ver foto', onPress: () => setAvatarViewerVisible(true) }]
        : []),
      { text: 'Tomar foto', onPress: () => void handleTakeAvatarPhoto() },
      { text: 'Elegir foto', onPress: () => void handlePickAvatar() },
      { style: 'cancel', text: 'Cancelar' },
    ]);
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
          avatarUrl={localAvatarPath ?? currentUserProfile?.avatarUrl ?? null}
          disabled={avatarMutation.isPending}
          editable
          onPress={openAvatarOptions}
          variant="avatar"
        />
        <View style={styles.accountCopy}>
          <Text style={styles.accountValue}>{accountLabel}</Text>
          <Text style={styles.accountMeta}>{accountEmail}</Text>
        </View>
      </View>

      {message ? <MessageBanner message={message} /> : null}

      {!session.setupState.requiredComplete ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Setup pendiente</Text>
          </View>
          <Link href={completeProfileHref} asChild>
            <Pressable
              style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
            >
              <Text style={styles.inlineButtonText}>Abrir setup</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}

      {__DEV__ ? (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>QA temporal</Text>
          </View>
          <View style={styles.qaButtonRow}>
            <Link href={buildSetupAccountHref('profile', { preview: 'true' })} asChild>
              <Pressable
                style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
              >
                <Text style={styles.inlineButtonText}>Onboarding</Text>
              </Pressable>
            </Link>
            <Link href={qaInviteEntryHref} asChild>
              <Pressable
                style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
              >
                <Text style={styles.inlineButtonText}>Invitacion</Text>
              </Pressable>
            </Link>
            <Link href={qaTokenCreateHref} asChild>
              <Pressable
                style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
              >
                <Text style={styles.inlineButtonText}>Crear con token</Text>
              </Pressable>
            </Link>
          </View>
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
          <Text style={styles.sectionTitle}>Cuenta</Text>
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
                  <Text style={styles.inlineButtonText}>
                    {busyAction === 'resend-email-confirmation' ? 'Enviando...' : 'Reenviar'}
                  </Text>
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
          <Text style={styles.sectionTitle}>Metodos de acceso</Text>
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
                  <Text style={styles.inlineButtonText}>
                    {busyAction === 'link-google' ? 'Abriendo...' : 'Vincular'}
                  </Text>
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
                      <Text style={styles.inlineButtonText}>
                        {busyAction === 'link-apple' ? 'Abriendo...' : 'Vincular'}
                      </Text>
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
                  <Text style={styles.inlineButtonText}>
                    {session.profile?.phone_e164 ? 'Editar' : 'Completar'}
                  </Text>
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
          <Text style={styles.sectionTitle}>Dispositivos</Text>
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
              {session.linkedMethods.hasEmailPassword ? (
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
              ) : null}
              <View style={styles.inlineActionRow}>
                <PrimaryAction
                  compact
                  fullWidth={false}
                  label={busyAction === 'trust-device' ? 'Validando...' : primaryReauthLabel}
                  onPress={
                    busyAction
                      ? undefined
                      : () =>
                          void runAction('trust-device', async () =>
                            session.trustCurrentDevice({
                              password: trustPassword,
                            }),
                          )
                  }
                />
              </View>
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
                      <Text style={styles.inlineButtonDangerText}>
                        {busyAction === `revoke-${device.device_id}` ? 'Revocando...' : 'Revocar'}
                      </Text>
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
          <Text style={styles.sectionTitle}>Legal y soporte</Text>
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
          <Text style={styles.sectionTitle}>Eliminar cuenta</Text>
        </View>

        <View style={styles.accountDeletionRow}>
          <Text style={[styles.sectionBody, styles.accountDeletionBody]}>
            Esta accion es irreversible.
          </Text>

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
            <Text style={styles.inlineButtonDangerText}>
              {busyAction === 'request-account-deletion' ? 'Eliminando...' : 'Eliminar cuenta'}
            </Text>
          </Pressable>
        </View>
      </View>

      <AvatarViewerModal
        imageUrl={localAvatarPath ?? currentUserProfile?.avatarUrl ?? null}
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
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  focusPanel: {
    borderTopColor: theme.colors.primary,
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
    alignItems: 'flex-end',
  },
  qaButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
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
