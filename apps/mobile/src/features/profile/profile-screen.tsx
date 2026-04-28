import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { AppTextInput } from '@/components/app-text-input';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { useAppSnapshot, useUpdateProfileAvatarMutation } from '@/lib/live-data';
import { cancelScheduledReminders, scheduleDailyPendingReminder } from '@/lib/notifications';
import { buildSetupAccountHref } from '@/lib/setup-account';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';

type RowTone = 'danger' | 'muted' | 'primary' | 'success';
type IoniconName = keyof typeof Ionicons.glyphMap;

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
  void Haptics.selectionAsync().catch(() => undefined);
}

function triggerImpactHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

function triggerSuccessHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
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

  const [message, setMessage] = useState<string | null>(null);
  const [attachPassword, setAttachPassword] = useState('');
  const [attachPasswordConfirm, setAttachPasswordConfirm] = useState('');
  const [trustPassword, setTrustPassword] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const methodsOffsetRef = useRef(0);
  const deviceOffsetRef = useRef(0);
  const methodsMeasuredRef = useRef(false);
  const deviceMeasuredRef = useRef(false);
  const trustPasswordInputRef = useRef<TextInput | null>(null);
  const attachPasswordInputRef = useRef<TextInput | null>(null);
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightTarget, setHighlightTarget] = useState<'methods' | 'device' | null>(null);

  const accountLabel =
    currentUserProfile?.displayName ??
    session.profile?.display_name ??
    session.email ??
    'Sin sesion';
  const accountEmail =
    currentUserProfile?.email ?? session.profile?.email ?? session.email ?? 'Sin correo';
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
    } finally {
      setBusyAction(null);
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
      const result = await session.requestNotificationsPermission();
      if (result !== 'Recordatorios activados.') {
        setMessage(result);
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

  async function uploadPickedAvatar(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets[0]) {
      return;
    }

    try {
      await avatarMutation.mutateAsync({
        uri: result.assets[0].uri,
        contentType: result.assets[0].mimeType,
      });
      triggerSuccessHaptic();
      setMessage('Foto de perfil actualizada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar la foto.');
    }
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('Necesitas permitir acceso a tus fotos para cambiar la imagen.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.7,
    });

    await uploadPickedAvatar(result);
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

    Alert.alert('Foto de perfil', undefined, [
      ...(currentUserProfile?.avatarUrl
        ? [{ text: 'Ver foto', onPress: () => setAvatarViewerVisible(true) }]
        : []),
      { text: 'Tomar foto', onPress: () => void handleTakeAvatarPhoto() },
      { text: 'Elegir foto', onPress: () => void handlePickAvatar() },
      { style: 'cancel', text: 'Cancelar' },
    ]);
  }

  return (
    <ScreenShell
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      scrollViewRef={scrollViewRef}
      title="Perfil"
    >
      <View style={styles.accountHeader}>
        <Pressable
          disabled={avatarMutation.isPending}
          onPress={openAvatarOptions}
          style={({ pressed }) => [styles.avatarButton, pressed ? styles.rowPressed : null]}
        >
          <AppAvatar
            imageUrl={currentUserProfile?.avatarUrl ?? null}
            label={accountLabel}
            size={84}
          />
          <View style={styles.avatarEditBadge}>
            <Ionicons color={theme.colors.white} name="pencil" size={15} />
          </View>
        </Pressable>
        <Text style={styles.accountValue}>{accountLabel}</Text>
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

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
        </View>

        <View style={styles.sectionList}>
          <ProfileStatusRow icon="mail" subtitle={accountEmail} title="Correo" tone="primary" />

          <View style={styles.separator} />

          <ProfileStatusRow
            icon="finger-print"
            subtitle={session.biometricAvailable ? session.biometricLabel : 'No disponible'}
            title="Biometria"
            tone={session.biometricsEnabled ? 'success' : 'muted'}
            trailing={
              <Switch
                disabled={!session.biometricAvailable}
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
        <Pressable
          onPress={() => void session.signOut()}
          style={({ pressed }) => [styles.signOutRow, pressed ? styles.rowPressed : null]}
        >
          <View style={[styles.statusIcon, styles.signOutIcon]}>
            <Ionicons color={theme.colors.danger} name="log-out-outline" size={20} />
          </View>
          <Text style={styles.signOutLabel}>Cerrar sesion</Text>
        </Pressable>
      </View>
      <AvatarViewerModal
        imageUrl={currentUserProfile?.avatarUrl ?? null}
        label={accountLabel}
        onClose={() => setAvatarViewerVisible(false)}
        visible={avatarViewerVisible}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  accountHeader: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  avatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
    position: 'relative',
  },
  avatarEditBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 3,
    bottom: -1,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    width: 32,
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
    fontSize: theme.typography.title3,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  accountMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
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
  signOutLabel: {
    color: theme.colors.danger,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  signOutRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 56,
  },
  signOutIcon: {
    backgroundColor: theme.colors.dangerSoft,
  },
});
