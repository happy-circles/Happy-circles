import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ActivitySectionDto } from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SegmentedControl } from '@/components/segmented-control';
import { StatusChip } from '@/components/status-chip';
import { formatCop } from '@/lib/data';
import {
  useAcceptFinancialRequestMutation,
  useAppSnapshot,
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectFinancialRequestMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import {
  getNotificationSupport,
  requestLocalNotificationPermission,
  scheduleDeferredReminder,
} from '@/lib/notifications';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

const SEGMENTS = [
  { label: 'Pendientes', value: 'pending' },
  { label: 'Historial', value: 'history' },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]['value'];
type PendingActionKey = 'accept' | 'reject' | 'approve' | 'execute';

function toneForStatus(status: string): 'primary' | 'success' | 'warning' | 'neutral' {
  if (status === 'requires_you' || status === 'pending') {
    return 'warning';
  }

  if (status === 'accepted' || status === 'posted') {
    return 'success';
  }

  if (status === 'pending_approvals' || status === 'approved') {
    return 'primary';
  }

  return 'neutral';
}

export function ActivityScreen() {
  const { authMode } = useSession();
  const snapshotQuery = useAppSnapshot();
  const acceptRequest = useAcceptFinancialRequestMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();

  const [segment, setSegment] = useState<SegmentKey>('pending');
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const sections = snapshotQuery.data?.activitySections ?? [];
  const section = useMemo<ActivitySectionDto | undefined>(
    () => sections.find((item) => item.key === segment),
    [sections, segment],
  );

  async function handleRemindLater(title: string, subtitle: string, href?: string) {
    const support = getNotificationSupport();
    if (!support.supported) {
      setMessage(support.reason ?? 'Notificaciones no disponibles en este entorno.');
      return;
    }

    const granted = await requestLocalNotificationPermission();
    if (!granted) {
      setMessage('No se pudieron activar notificaciones en este dispositivo.');
      return;
    }

    await scheduleDeferredReminder(title, subtitle, href ?? '/activity');
    setMessage('Recordatorio programado para mas tarde.');
  }

  async function handlePendingAction(itemId: string, kind: string, status: string, action: PendingActionKey) {
    const key = `${itemId}:${action}`;
    setBusyKey(key);
    setMessage(null);

    try {
      if (kind === 'financial_request') {
        if (action === 'accept') {
          await acceptRequest.mutateAsync(itemId);
          setMessage('Request aceptado.');
        } else {
          await rejectRequest.mutateAsync(itemId);
          setMessage('Request rechazado.');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'pending_approvals') {
        if (action === 'approve') {
          await approveSettlement.mutateAsync(itemId);
          setMessage('Cierre aprobado.');
        } else {
          await rejectSettlement.mutateAsync(itemId);
          setMessage('Cierre rechazado.');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'approved' && action === 'execute') {
        await executeSettlement.mutateAsync(itemId);
        setMessage('Cierre ejecutado.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell title="Actividad" subtitle="Cargando tus pendientes e historial.">
        <Text style={styles.supportText}>Estamos leyendo tus acciones reales desde Supabase.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell title="Actividad" subtitle="No pudimos cargar la actividad.">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Actividad" subtitle="Pendientes e historial en tiempo real.">
      <SegmentedControl options={SEGMENTS} onChange={setSegment} value={segment} />

      {message ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{message}</Text>
        </View>
      ) : null}

      <SectionBlock subtitle={section?.description} title={section?.title ?? 'Actividad'}>
        {!section || section.items.length === 0 ? (
          <EmptyState
            actionHref="/register"
            actionLabel="Registrar deuda"
            description={section?.emptyMessage ?? 'No hay movimientos para mostrar.'}
            title="Todo al dia"
          />
        ) : (
          section.items.map((item) => {
            const canAcceptOrReject =
              authMode === 'supabase' && segment === 'pending' && item.kind === 'financial_request';
            const canApproveOrReject =
              authMode === 'supabase' &&
              segment === 'pending' &&
              item.kind === 'settlement_proposal' &&
              item.status === 'pending_approvals';
            const canExecute =
              authMode === 'supabase' &&
              segment === 'pending' &&
              item.kind === 'settlement_proposal' &&
              item.status === 'approved';

            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.header}>
                  <View style={styles.textWrap}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.subtitle}>{item.subtitle}</Text>
                  </View>
                  <StatusChip label={item.status} tone={toneForStatus(item.status)} />
                </View>
                {typeof item.amountMinor === 'number' && item.amountMinor > 0 ? (
                  <Text style={styles.amount}>{formatCop(item.amountMinor)}</Text>
                ) : null}
                <View style={styles.actions}>
                  {item.href ? <PrimaryAction href={item.href} label="Abrir" variant="secondary" /> : null}

                  {canAcceptOrReject ? (
                    <>
                      <PrimaryAction
                        label={busyKey === `${item.id}:accept` ? 'Aceptando...' : 'Aceptar'}
                        onPress={
                          busyKey
                            ? undefined
                            : () => void handlePendingAction(item.id, item.kind, item.status, 'accept')
                        }
                      />
                      <PrimaryAction
                        label={busyKey === `${item.id}:reject` ? 'Rechazando...' : 'Rechazar'}
                        onPress={
                          busyKey
                            ? undefined
                            : () => void handlePendingAction(item.id, item.kind, item.status, 'reject')
                        }
                        variant="ghost"
                      />
                    </>
                  ) : null}

                  {canApproveOrReject ? (
                    <>
                      <PrimaryAction
                        label={busyKey === `${item.id}:approve` ? 'Aprobando...' : 'Aprobar'}
                        onPress={
                          busyKey
                            ? undefined
                            : () => void handlePendingAction(item.id, item.kind, item.status, 'approve')
                        }
                      />
                      <PrimaryAction
                        label={busyKey === `${item.id}:reject` ? 'Rechazando...' : 'Rechazar'}
                        onPress={
                          busyKey
                            ? undefined
                            : () => void handlePendingAction(item.id, item.kind, item.status, 'reject')
                        }
                        variant="ghost"
                      />
                    </>
                  ) : null}

                  {canExecute ? (
                    <PrimaryAction
                      label={busyKey === `${item.id}:execute` ? 'Ejecutando...' : 'Ejecutar'}
                      onPress={
                        busyKey
                          ? undefined
                          : () => void handlePendingAction(item.id, item.kind, item.status, 'execute')
                      }
                    />
                  ) : null}

                  {segment === 'pending' && authMode === 'demo' ? (
                    <PrimaryAction
                      label="Recordarme"
                      onPress={() => void handleRemindLater(item.title, item.subtitle, item.href)}
                      variant="ghost"
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
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
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  amount: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
});
