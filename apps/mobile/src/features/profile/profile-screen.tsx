import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { MessageBanner } from '@/components/message-banner';
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

export function ProfileScreen() {
  const {
    biometricAvailable,
    biometricLabel,
    biometricsEnabled,
    email,
    notificationsEnabled,
    setBiometricsEnabled,
    setNotificationsEnabled,
    signOut,
  } = useSession();
  const snapshotQuery = useAppSnapshot();
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const avatarMutation = useUpdateProfileAvatarMutation();

  const [message, setMessage] = useState<string | null>(null);
  const accountLabel = currentUserProfile?.displayName ?? email ?? 'Sin sesion';
  const accountEmail = currentUserProfile?.email ?? email ?? 'Sin correo';
  const reminderSummary = snapshotQuery.isLoading
    ? 'Calculando...'
    : pendingCount > 0
      ? `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''} hoy`
      : 'Sin pendientes';

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
            <Text style={styles.changePhotoLabel}>{avatarMutation.isPending ? 'Subiendo...' : 'Tomar foto'}</Text>
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
      </View>
      {message ? <MessageBanner message={message} /> : null}

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

        <View style={styles.separator} />

        <Pressable onPress={() => void signOut()} style={({ pressed }) => [styles.listRow, pressed ? styles.rowPressed : null]}>
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
  signOutLabel: {
    color: theme.colors.danger,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
});
