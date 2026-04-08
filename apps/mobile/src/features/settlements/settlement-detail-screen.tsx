import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import {
  useAppSnapshot,
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';

export interface SettlementDetailScreenProps {
  readonly proposalId: string;
}

export function SettlementDetailScreen({ proposalId }: SettlementDetailScreenProps) {
  const { authMode } = useSession();
  const snapshotQuery = useAppSnapshot();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | 'execute' | null>(null);

  const settlement = snapshotQuery.data?.settlementsById[proposalId] ?? null;

  async function handleAction(action: 'approve' | 'reject' | 'execute') {
    setBusyAction(action);
    setMessage(null);

    try {
      if (action === 'approve') {
        await approveSettlement.mutateAsync(proposalId);
        setMessage('Cierre aprobado.');
      } else if (action === 'reject') {
        await rejectSettlement.mutateAsync(proposalId);
        setMessage('Cierre rechazado.');
      } else {
        await executeSettlement.mutateAsync(proposalId);
        setMessage('Cierre ejecutado.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyAction(null);
    }
  }

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell
        largeTitle={false}
        title={`Cierre ${proposalId}`}
        subtitle="Cargando el detalle de la propuesta."
      >
        <Text style={styles.supportText}>Estamos leyendo participantes, movimientos y estado.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        largeTitle={false}
        title={`Cierre ${proposalId}`}
        subtitle="No pudimos cargar esta propuesta."
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (!settlement) {
    return (
      <ScreenShell
        largeTitle={false}
        title={`Cierre ${proposalId}`}
        subtitle="No encontramos esta propuesta."
      >
        <EmptyState
          title="Propuesta no visible"
          description="Confirma que sigas siendo participante o que el id exista en Supabase."
        />
      </ScreenShell>
    );
  }

  const canApproveOrReject = authMode === 'supabase' && settlement.status === 'pending_approvals';
  const canExecute = authMode === 'supabase' && settlement.status === 'approved';

  return (
    <ScreenShell
      largeTitle={false}
      title={`Cierre ${proposalId}`}
      subtitle="Resumen de la propuesta antes de aprobar, rechazar o ejecutar."
    >
      {message ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <StatusChip label={settlement.status} tone={settlement.status === 'approved' ? 'success' : 'primary'} />
        <Text style={styles.heroTitle}>Cierre sugerido listo para revisar</Text>
        <Text style={styles.heroBody}>
          Esta vista prioriza la accion, pero mantiene el detalle tecnico accesible.
        </Text>
      </View>

      <SectionBlock title="Participantes" subtitle="Las personas afectadas por el cierre.">
        <View style={styles.card}>
          <Text style={styles.text}>{settlement.participants.join(', ')}</Text>
        </View>
      </SectionBlock>

      <SectionBlock title="Movimientos sugeridos" subtitle="Orden propuesto para dejar el saldo mas limpio.">
        {settlement.movements.length === 0 ? (
          <EmptyState
            title="Sin movimientos visibles"
            description="La propuesta existe, pero no trajo movimientos legibles para esta pantalla."
          />
        ) : (
          settlement.movements.map((movement) => (
            <View key={movement} style={styles.card}>
              <Text style={styles.text}>{movement}</Text>
            </View>
          ))
        )}
      </SectionBlock>

      <SectionBlock title="Detalle tecnico" subtitle="Solo para validacion avanzada.">
        <View style={styles.card}>
          <Text style={styles.label}>Snapshot hash</Text>
          <Text style={styles.text}>{settlement.snapshotHash}</Text>
          {settlement.explainers.map((item) => (
            <Text key={item} style={styles.helper}>
              {item}
            </Text>
          ))}
        </View>
      </SectionBlock>

      <View style={styles.actions}>
        {canApproveOrReject ? (
          <>
            <PrimaryAction
              label={busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
              onPress={busyAction ? undefined : () => void handleAction('approve')}
            />
            <PrimaryAction
              label={busyAction === 'reject' ? 'Rechazando...' : 'Rechazar'}
              onPress={busyAction ? undefined : () => void handleAction('reject')}
              variant="secondary"
            />
          </>
        ) : null}

        {canExecute ? (
          <PrimaryAction
            label={busyAction === 'execute' ? 'Ejecutando...' : 'Ejecutar cierre'}
            onPress={busyAction ? undefined : () => void handleAction('execute')}
          />
        ) : null}

        <PrimaryAction href="/activity" label="Volver a actividad" variant="ghost" />
      </View>
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
  hero: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xlarge,
    borderWidth: 1,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    ...theme.shadow.card,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
  },
  heroBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  helper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
});
