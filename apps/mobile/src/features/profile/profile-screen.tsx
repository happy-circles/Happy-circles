import { useMemo, useState } from 'react';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
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
  const {
    appleSignInAvailable,
    attachEmailPassword,
    biometricAvailable,
    biometricLabel,
    biometricsEnabled,
    currentDeviceId,
    deviceTrustState,
    email,
    isTrustedDevice,
    linkedMethods,
    notificationsEnabled,
    profile,
    profileCompletionState,
    revokeTrustedDevice,
    setBiometricsEnabled,
    setNotificationsEnabled,
    signOut,
    linkApple,
    linkGoogle,
    trustCurrentDevice,
    trustedDevices,
  } = useSession();
  const snapshotQuery = useAppSnapshot();
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const avatarMutation = useUpdateProfileAvatarMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [attachPassword, setAttachPassword] = useState('');
  const [attachPasswordConfirm, setAttachPasswordConfirm] = useState('');
  const [trustPassword, setTrustPassword] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const accountLabel = currentUserProfile?.displayName ?? profile?.display_name ?? email ?? 'Sin sesion';
  const accountEmail = currentUserProfile?.email ?? profile?.email ?? email ?? 'Sin correo';
  const reminderSummary = snapshotQuery.isLoading
    ? 'Calculando...'
    : pendingCount > 0
      ? `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''} hoy`
      : 'Sin pendientes';
  const phoneLabel = profile?.phone_e164 ?? 'Falta completar';
  const primaryReauthLabel = useMemo(() => {
    if (linkedMethods.hasEmailPassword) {
      return 'Validar con clave';
    }

    if (linkedMethods.hasGoogle) {
      return 'Validar con Google';
    }

    if (linkedMethods.hasApple) {
      return 'Validar con Apple';
    }

    return 'Validar dispositivo';
  }, [linkedMethods.hasApple, linkedMethods.hasEmailPassword, linkedMethods.hasGoogle]);

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
    const result = await setBiometricsEnabled(nextValue);
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

      await setNotificationsEnabled(true);
      await cancelScheduledReminders();
      if (pendingCount > 0) {
        await scheduleDailyPendingReminder();
      }

      setMessage('Recordatorios diarios activados.');
      return;
    }

    await setNotificationsEnabled(false);
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
    <ScreenShell headerVariant="plain" largeTitle={false} title="Perfil">
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

      {profileCompletionState === 'incomplete' ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Perfil minimo pendiente</Text>
          <Text style={styles.panelBody}>
            Antes de mover dinero necesitamos nombre usable y celular unico.
          </Text>
          <Link href={'/complete-profile' as Href} asChild>
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
            <Text style={styles.rowSubtitle}>{biometricAvailable ? biometricLabel : 'No disponible'}</Text>
          </View>
          <Switch
            disabled={!biometricAvailable}
            onValueChange={(nextValue) => void handleBiometrics(nextValue)}
            trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
            value={biometricsEnabled}
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
            value={notificationsEnabled}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Metodos de acceso</Text>

        <View style={styles.methodRow}>
          <View style={styles.textWrap}>
            <Text style={styles.rowTitle}>Correo y clave</Text>
            <Text style={styles.rowSubtitle}>
              {linkedMethods.hasEmailPassword ? 'Listo para entrar en cualquier dispositivo.' : 'Aun no agregas una clave.'}
            </Text>
          </View>
        </View>
        {!linkedMethods.hasEmailPassword ? (
          <View style={styles.stack}>
            <TextInput
              autoCapitalize="none"
              onChangeText={setAttachPassword}
              placeholder="Nueva clave"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              style={styles.input}
              value={attachPassword}
            />
            <TextInput
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
                        attachEmailPassword({
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
              {linkedMethods.hasGoogle ? 'Vinculado' : 'Disponible para acceso rapido'}
            </Text>
          </View>
          {!linkedMethods.hasGoogle ? (
            <Pressable
              onPress={() => void runAction('link-google', linkGoogle)}
              style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}
            >
              <Text style={styles.inlineButtonText}>
                {busyAction === 'link-google' ? 'Abriendo...' : 'Vincular'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {appleSignInAvailable ? (
          <>
            <View style={styles.separator} />
            <View style={styles.methodRow}>
              <View style={styles.textWrap}>
                <Text style={styles.rowTitle}>Apple</Text>
                <Text style={styles.rowSubtitle}>
                  {linkedMethods.hasApple ? 'Vinculado' : 'Disponible en iPhone'}
                </Text>
              </View>
              {!linkedMethods.hasApple ? (
                <Pressable
                  onPress={() => void runAction('link-apple', linkApple)}
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
          <Link href={'/complete-profile' as Href} asChild>
            <Pressable style={({ pressed }) => [styles.inlineButton, pressed ? styles.rowPressed : null]}>
              <Text style={styles.inlineButtonText}>{profile?.phone_e164 ? 'Editar' : 'Completar'}</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Dispositivos</Text>
        <Text style={styles.panelBody}>
          Estado actual: {isTrustedDevice ? 'confiable' : formatDeviceStateLabel(deviceTrustState)}.
        </Text>

        {!isTrustedDevice ? (
          <View style={styles.stack}>
            {linkedMethods.hasEmailPassword ? (
              <TextInput
                autoCapitalize="none"
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
                        trustCurrentDevice({
                          password: trustPassword,
                        }),
                      )
              }
            />
          </View>
        ) : null}

        <View style={styles.stack}>
          {trustedDevices.map((device) => (
            <View key={device.id} style={styles.deviceRow}>
              <View style={styles.textWrap}>
                <Text style={styles.rowTitle}>
                  {formatDeviceTitle(device.device_id, currentDeviceId, device.platform)}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {formatDeviceStateLabel(device.trust_state)}
                  {device.app_version ? ` | v${device.app_version}` : ''}
                </Text>
              </View>
              {device.trust_state !== 'revoked' ? (
                <Pressable
                  onPress={() => void runAction(`revoke-${device.device_id}`, async () => revokeTrustedDevice(device.device_id))}
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
          onPress={() => void signOut()}
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
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
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
