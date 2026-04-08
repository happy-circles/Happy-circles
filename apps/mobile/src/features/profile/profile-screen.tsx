import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { useAppSnapshot } from '@/lib/live-data';
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
    authMode,
    biometricAvailable,
    biometricLabel,
    biometricsEnabled,
    email,
    lock,
    notificationsEnabled,
    setBiometricsEnabled,
    setNotificationsEnabled,
    signOut,
  } = useSession();
  const snapshotQuery = useAppSnapshot();
  const pendingCount = snapshotQuery.data?.pendingCount ?? 0;

  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <ScreenShell title="Perfil" subtitle="Cuenta, seguridad y ajustes simples para el MVP.">
      {message ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{message}</Text>
        </View>
      ) : null}

      <SectionBlock title="Cuenta" subtitle="Identidad y estado actual.">
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.textWrap}>
              <Text style={styles.rowTitle}>{email ?? 'Sin sesion'}</Text>
              <Text style={styles.rowSubtitle}>
                {authMode === 'demo' ? 'Modo demo local' : 'Sesion real con magic link'}
              </Text>
            </View>
            <StatusChip label={authMode === 'demo' ? 'Demo' : 'Activa'} tone="primary" />
          </View>
          <PrimaryAction label="Cerrar sesion" onPress={() => void signOut()} variant="secondary" />
        </View>
      </SectionBlock>

      <SectionBlock title="Seguridad" subtitle="Bloqueo al reingresar y cierre manual.">
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.textWrap}>
              <Text style={styles.rowTitle}>Desbloqueo con {biometricLabel}</Text>
              <Text style={styles.rowSubtitle}>
                {biometricAvailable
                  ? 'Se bloquea al volver a abrir la app o tras 5 minutos en segundo plano.'
                  : 'No disponible en este dispositivo.'}
              </Text>
            </View>
            <Switch
              disabled={!biometricAvailable}
              onValueChange={(nextValue) => void handleBiometrics(nextValue)}
              value={biometricsEnabled}
            />
          </View>
          {biometricsEnabled ? <PrimaryAction label="Bloquear ahora" onPress={lock} variant="ghost" /> : null}
        </View>
      </SectionBlock>

      <SectionBlock title="Notificaciones" subtitle="Solo recordatorios locales por ahora.">
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.textWrap}>
              <Text style={styles.rowTitle}>Recordatorio diario</Text>
              <Text style={styles.rowSubtitle}>
                {snapshotQuery.isLoading
                  ? 'Calculando pendientes...'
                  : pendingCount > 0
                    ? `Tienes ${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}.`
                    : 'No hay pendientes activos ahora mismo.'}
              </Text>
            </View>
            <Switch
              onValueChange={(nextValue) => void handleNotifications(nextValue)}
              value={notificationsEnabled}
            />
          </View>
        </View>
      </SectionBlock>

      <SectionBlock title="Ayuda y avanzado" subtitle="Soporte del MVP y trazabilidad tecnica.">
        <View style={styles.card}>
          <PrimaryAction href="/advanced/audit" label="Abrir auditoria" variant="secondary" />
          <PrimaryAction href="/activity" label="Ver actividad" variant="ghost" />
        </View>
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.medium,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  bannerText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
    gap: 3,
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
});
