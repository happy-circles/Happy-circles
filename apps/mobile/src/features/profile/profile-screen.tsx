import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { AppTextInput } from '@/components/app-text-input';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { useAppSnapshot, useUpdateProfileAvatarMutation } from '@/lib/live-data';
import {
  cancelScheduledReminders,
  getNotificationSupport,
  requestLocalNotificationPermission,
  scheduleDailyPendingReminder,
} from '@/lib/notifications';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

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

export function ProfileScreen() {
  const params = useLocalSearchParams<{ focus?: string; section?: string }>();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const avatarMutation = useUpdateProfileAvatarMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [attachPassword, setAttachPassword] = useState('');
  const [attachPasswordConfirm, setAttachPasswordConfirm] = useState('');
  const [trustPassword, setTrustPassword] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
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
    currentUserProfile?.displayName ?? session.profile?.display_name ?? session.email ?? 'Sin sesion';
  const accountEmail = currentUserProfile?.email ?? session.profile?.email ?? session.email ?? 'Sin correo';
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
  const nextCompleteProfileFocus = !session.profile?.avatar_path
    ? 'avatar'
    : !session.profile?.phone_e164
      ? 'phone'
      : 'fullName';
  const completeProfileHref = {
    pathname: '/complete-profile',
    params: {
      focus: nextCompleteProfileFocus,
    },
  } as Href;

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
        focusTarget === 'trust-password' && (!session.linkedMethods.hasEmailPassword || session.isTrustedDevice)
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
    const result = await session.setBiometricsEnabled(nextValue);
    setMessage(result.message);
  }

  async function handleNotifications(nextValue: boolean) {
    if (nextValue) {
      const support = getNotificationSupport();
      if (!support.supported) {
        setMessage(support.reason ?? 'Notificaciones no disponibles en este entorno.');
        return;
      }

      const granted = await requestLocalNotificationPermission();
      if (!granted) {
        setMessage('Notificaciones no disponibles. Revisa permisos del sistema.');
        return;
      }

      await session.setNotificationsEnabled(true);
      await cancelScheduledReminders();
      if (pendingCount > 0) {
        await scheduleDailyPendingReminder();
      }

      setMessage('Recordatorios diarios activados.');
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

  return (
    <ScreenShell
      headerVariant="plain"
      largeTitle={false}
      scrollViewRef={scrollViewRef}
      title="Perfil"
    >
      <View style={styles.accountHeader}>
        <Pressable
          disabled={avatarMutation.isPending}
          onPress={() => void handlePickAvatar()}
          style={({ pressed }) => [styles.avatarButton, pressed ? styles.rowPressed : null]}
        >
          <AppAvatar imageUrl={currentUserProfile?.avatarUrl ?? null} label={accountLabel} size={84} />
        </Pressable>
        <View style={styles.avatarActions}>
          <Pressable
            disabled={avatarMutation.isPending}
            onPress={() => void handleTakeAvatarPhoto()}
            style={({ pressed }) => [styles.avatarActionChip, pressed ? styles.rowPressed : null]}
          >
            <Text style={styles.changePhotoLabel}>
              {avatarMutation.isPending ? 'Subiendo...' : 'Tomar foto'}
            </Text>
          </Pressable>
          <Pressable
            disabled={avatarMutation.isPending}
            onPress={() => void handlePickAvatar()}
            style={({ pressed }) => [styles.avatarActionChip, pressed ? styles.rowPressed : null]}
          >
            <Text style={styles.changePhotoLabel}>Elegir foto</Text>
          </Pressable>
        </View>
        <Text style={styles.accountEyebrow}>Cuenta</Text>
        <Text style={styles.accountValue}>{accountLabel}</Text>
        {accountEmail !== accountLabel ? <Text style={styles.accountMeta}>{accountEmail}</Text> : null}
        <Text style={styles.accountMeta}>Celular: {phoneLabel}</Text>
      </View>

      {message ? <MessageBanner message={message} /> : null}

      {session.profileCompletionState === 'incomplete' ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Perfil minimo pendiente</Text>
          <Text style={styles.panelBody}>
            Antes de mover dinero necesitamos nombre usable y celular unico.
          </Text>
          <Link href={completeProfileHref} asChild>
            <Pressable style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}>
              <Text style={styles.inlineButtonText}>Completar ahora</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}

      <View style={styles.list}>
        <View style={styles.listRow}>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>Correo</Text>
            <Text style={styles.rowSubtitle}>{accountEmail}</Text>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.listRow}>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>Biometria</Text>
            <Text style={styles.rowSubtitle}>
              {session.biometricAvailable ? session.biometricLabel : 'No disponible'}
            </Text>
          </View>
          <Switch
            disabled={!session.biometricAvailable}
            onValueChange={(nextValue) => void handleBiometrics(nextValue)}
            trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
            value={session.biometricsEnabled}
          />
        </View>

        <View style={styles.separator} />

        <View style={styles.listRow}>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>Recordatorios</Text>
            <Text style={styles.rowSubtitle}>{reminderSummary}</Text>
          </View>
          <Switch
            onValueChange={(nextValue) => void handleNotifications(nextValue)}
            trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
            value={session.notificationsEnabled}
          />
        </View>
      </View>

      <View
        onLayout={(event) => {
          methodsMeasuredRef.current = true;
          methodsOffsetRef.current = event.nativeEvent.layout.y;
        }}
        style={[styles.panel, highlightTarget === 'methods' ? styles.focusPanel : null]}
      >
        <Text style={styles.panelTitle}>Metodos de acceso</Text>

        <View style={styles.methodRow}>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>Correo y clave</Text>
            <Text style={styles.rowSubtitle}>
              {session.linkedMethods.hasEmailPassword
                ? 'Listo para entrar en cualquier dispositivo.'
                : 'Aun no agregas una clave.'}
            </Text>
          </View>
        </View>
        {!session.linkedMethods.hasEmailPassword ? (
          <View style={styles.stack}>
            <AppTextInput
              autoCapitalize="none"
              ref={attachPasswordInputRef}
              onChangeText={setAttachPassword}
              placeholder="Nueva clave"
              placeholderTextColor={theme.colors.muted}
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
            <PrimaryAction
              compact
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
        ) : null}

        <View style={styles.separator} />

        <View style={styles.methodRow}>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>Google</Text>
            <Text style={styles.rowSubtitle}>
              {session.linkedMethods.hasGoogle ? 'Vinculado' : 'Disponible para acceso rapido'}
            </Text>
          </View>
          {!session.linkedMethods.hasGoogle ? (
            <Pressable
              onPress={() => void runAction('link-google', async () => session.linkGoogle())}
              style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
            >
              <Text style={styles.inlineButtonText}>
                {busyAction === 'link-google' ? 'Abriendo...' : 'Vincular'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {session.appleSignInAvailable ? (
          <>
            <View style={styles.separator} />
            <View style={styles.methodRow}>
              <View style={styles.textWrap}>
                <Text style={styles.rowTitle}>Apple</Text>
                <Text style={styles.rowSubtitle}>
                  {session.linkedMethods.hasApple ? 'Vinculado' : 'Disponible en iPhone'}
                </Text>
              </View>
              {!session.linkedMethods.hasApple ? (
                <Pressable
                  onPress={() => void runAction('link-apple', async () => session.linkApple())}
                  style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
                >
                  <Text style={styles.inlineButtonText}>
                    {busyAction === 'link-apple' ? 'Abriendo...' : 'Vincular'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

        <View style={styles.separator} />

        <View style={styles.methodRow}>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>Celular</Text>
            <Text style={styles.rowSubtitle}>{phoneLabel}</Text>
          </View>
          <Link href={{ pathname: '/complete-profile', params: { focus: 'phone' } } as Href} asChild>
            <Pressable style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}>
              <Text style={styles.inlineButtonText}>{session.profile?.phone_e164 ? 'Editar' : 'Completar'}</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View
        onLayout={(event) => {
          deviceMeasuredRef.current = true;
          deviceOffsetRef.current = event.nativeEvent.layout.y;
        }}
        style={[styles.panel, highlightTarget === 'device' ? styles.focusPanel : null]}
      >
        <Text style={styles.panelTitle}>Dispositivos</Text>
        <Text style={styles.panelBody}>
          Estado actual: {session.isTrustedDevice ? 'confiable' : formatDeviceStateLabel(session.deviceTrustState)}.
        </Text>

        {!session.isTrustedDevice ? (
          <View style={styles.stack}>
            {session.linkedMethods.hasEmailPassword ? (
              <AppTextInput
                autoCapitalize="none"
                ref={trustPasswordInputRef}
                onChangeText={setTrustPassword}
                placeholder="Tu clave actual"
                placeholderTextColor={theme.colors.muted}
                secureTextEntry
                style={styles.input}
                value={trustPassword}
              />
            ) : null}
            <PrimaryAction
              compact
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
        ) : null}

        <View style={styles.stack}>
          {session.trustedDevices.map((device) => (
            <View key={device.id} style={styles.deviceRow}>
              <View style={styles.textWrap}>
                <Text style={styles.rowTitle}>
                  {formatDeviceTitle(device.device_id, session.currentDeviceId, device.platform)}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {formatDeviceStateLabel(device.trust_state)}
                  {device.app_version ? ` | v${device.app_version}` : ''}
                </Text>
              </View>
              {device.trust_state !== 'revoked' ? (
                <Pressable
                  onPress={() =>
                    void runAction(`revoke-${device.device_id}`, async () =>
                      session.revokeTrustedDevice(device.device_id),
                    )
                  }
                  style={({ pressed }) => [styles.inlineButtonDanger, pressed ? styles.rowPressed : null]}
                >
                  <Text style={styles.inlineButtonDangerText}>
                    {busyAction === `revoke-${device.device_id}` ? 'Revocando...' : 'Revocar'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.list}>
        <View style={styles.separator} />
        <Pressable
          onPress={() => void session.signOut()}
          style={({ pressed }) => [styles.listRow, pressed ? styles.rowPressed : null]}
        >
          <Text style={styles.signOutLabel}>Cerrar sesion</Text>
        </Pressable>
      </View>
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
  },
  avatarActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  avatarActionChip: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  changePhotoLabel: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
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
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  focusPanel: {
    borderColor: theme.colors.primary,
  },
  panelTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
  },
  panelBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  list: {
    backgroundColor: 'transparent',
  },
  listRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: 68,
    paddingVertical: theme.spacing.sm,
  },
  methodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  deviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
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
  stack: {
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
});
