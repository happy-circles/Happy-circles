import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
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
    <ScreenShell eyebrow="Cuenta" subtitle="Tu sesion, seguridad y recordatorios en una sola vista." title="Perfil y ajustes">
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.summaryTitle}>Todo lo importante de tu cuenta esta controlado desde aqui.</Text>
        <Text style={styles.summaryBody}>
          {pendingCount > 0
            ? `Hoy tienes ${pendingCount} pendiente${pendingCount > 1 ? 's' : ''} activo${pendingCount > 1 ? 's' : ''}.`
            : 'No tienes pendientes activos en este momento.'}
        </Text>
      </SurfaceCard>

      {message ? <MessageBanner message={message} /> : null}

      <SectionBlock title="Cuenta" subtitle="Tu estado actual y la salida segura en un solo bloque.">
        <SurfaceCard padding="lg">
          <View style={styles.row}>
            <View style={styles.textWrap}>
              <Text style={styles.rowTitle}>{email ?? 'Sin sesion'}</Text>
              <Text style={styles.rowSubtitle}>Sesion real con correo y clave</Text>
            </View>
            <StatusChip label="Activa" tone="primary" />
          </View>
          <PrimaryAction label="Cerrar sesion" onPress={() => void signOut()} variant="secondary" />
        </SurfaceCard>
      </SectionBlock>

      <SectionBlock title="Seguridad" subtitle="Ingreso rapido con biometria para volver a entrar sin clave.">
        <SurfaceCard padding="lg">
          <View style={styles.row}>
            <View style={styles.textWrap}>
              <Text style={styles.rowTitle}>Desbloqueo con {biometricLabel}</Text>
              <Text style={styles.rowSubtitle}>
                {biometricAvailable
                  ? `Happy Circles pedira ${biometricLabel} al abrirse y tras 5 minutos en segundo plano.`
                  : 'No disponible en este dispositivo.'}
              </Text>
            </View>
            <Switch
              disabled={!biometricAvailable}
              onValueChange={(nextValue) => void handleBiometrics(nextValue)}
              trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
              value={biometricsEnabled}
            />
          </View>
        </SurfaceCard>
      </SectionBlock>

      <SectionBlock title="Recordatorios" subtitle="Solo activamos lo que realmente aporta en movil.">
        <SurfaceCard padding="lg">
          <View style={styles.row}>
            <View style={styles.textWrap}>
              <Text style={styles.rowTitle}>Pendientes del dia</Text>
              <Text style={styles.rowSubtitle}>
                {snapshotQuery.isLoading
                  ? 'Calculando pendientes...'
                  : pendingCount > 0
                    ? `Tienes ${pendingCount} pendiente${pendingCount > 1 ? 's' : ''} activo${pendingCount > 1 ? 's' : ''}.`
                    : 'No hay pendientes activos ahora mismo.'}
              </Text>
            </View>
            <Switch
              onValueChange={(nextValue) => void handleNotifications(nextValue)}
              trackColor={{ false: theme.colors.surfaceSoft, true: theme.colors.primarySoft }}
              value={notificationsEnabled}
            />
          </View>
        </SurfaceCard>
      </SectionBlock>

      <SectionBlock title="Avanzado" subtitle="Solo trazabilidad y soporte cuando lo necesitas.">
        <SurfaceCard padding="lg">
          <PrimaryAction href="/advanced/audit" label="Abrir auditoria" variant="secondary" />
          <PrimaryAction href="/activity" label="Ver alertas" variant="ghost" />
        </SurfaceCard>
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  summaryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  summaryBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
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
});
