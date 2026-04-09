import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import {
  useAppSnapshot,
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';

export interface SettlementDetailScreenProps {
  readonly proposalId: string;
}

function readResultStatus(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const status = (value as Record<string, unknown>)['status'];
  return typeof status === 'string' ? status : null;
}

function readNestedStatus(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return readResultStatus((value as Record<string, unknown>)[key]);
}

function readNestedProposalId(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const nested = (value as Record<string, unknown>)[key];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
    return null;
  }

  const proposalId = (nested as Record<string, unknown>)['proposalId'];
  return typeof proposalId === 'string' ? proposalId : null;
}

export function SettlementDetailScreen({ proposalId }: SettlementDetailScreenProps) {
  const router = useRouter();
  const snapshotQuery = useAppSnapshot();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | 'execute' | null>(null);

  const settlement = snapshotQuery.data?.settlementsById[proposalId] ?? null;

  function showAutoCyclePrompt(nextProposalId: string | null, status: string | null) {
    if (status !== 'pending_approvals' && status !== 'approved') {
      return;
    }

    Alert.alert(
      status === 'approved' ? 'Cierre listo para ejecutar' : 'Cierre de circulo pendiente',
      status === 'approved'
        ? 'Todos ya aprobaron este cierre. Quieres abrirlo ahora para ejecutarlo?'
        : 'Se detecto otro cierre automatico en tu circulo. Quieres revisarlo ahora?',
      [
        {
          text: 'Luego',
          style: 'cancel',
        },
        {
          text: 'Abrir',
          onPress: () => {
            router.push(nextProposalId ? `/settlements/${nextProposalId}` : '/activity');
          },
        },
      ],
    );
  }

  async function handleAction(action: 'approve' | 'reject' | 'execute') {
    setBusyAction(action);
    setMessage(null);

    try {
      if (action === 'approve') {
        const response = await approveSettlement.mutateAsync(proposalId);
        const nextStatus = readResultStatus(response);
        setMessage(
          nextStatus === 'approved'
            ? 'Todos aceptaron. El cierre ya quedo aprobado.'
            : nextStatus === 'stale'
              ? 'La propuesta ya no coincide con el grafo actual y quedo obsoleta.'
              : 'Tu aprobacion quedo registrada.',
        );
      } else if (action === 'reject') {
        await rejectSettlement.mutateAsync(proposalId);
        setMessage('Cierre rechazado.');
      } else {
        const response = await executeSettlement.mutateAsync(proposalId);
        const nextStatus = readResultStatus(response);
        const nextAutoCycleStatus = readNestedStatus(response, 'nextAutoCycleProposal');
        const nextAutoCycleProposalId = readNestedProposalId(response, 'nextAutoCycleProposal');
        setMessage(
          nextStatus === 'stale'
            ? 'La propuesta se volvio obsoleta antes de ejecutar.'
            : 'Cierre ejecutado.',
        );
        showAutoCyclePrompt(nextAutoCycleProposalId, nextAutoCycleStatus);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyAction(null);
    }
  }

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell eyebrow="Cierre" largeTitle={false} subtitle="Cargando el detalle de la propuesta." title={`Cierre ${proposalId}`}>
        <Text style={styles.supportText}>Estamos leyendo participantes, movimientos y estado.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell eyebrow="Cierre" largeTitle={false} subtitle="No pudimos cargar esta propuesta." title={`Cierre ${proposalId}`}>
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (!settlement) {
    return (
      <ScreenShell eyebrow="Cierre" largeTitle={false} subtitle="No encontramos esta propuesta." title={`Cierre ${proposalId}`}>
        <EmptyState
          description="Confirma que sigas siendo participante o que el id exista en Supabase."
          title="Propuesta no visible"
        />
      </ScreenShell>
    );
  }

  const canApproveOrReject = settlement.status === 'pending_approvals';
  const canExecute = settlement.status === 'approved';

  return (
    <ScreenShell
      eyebrow="Cierre"
      largeTitle={false}
      subtitle="Un resumen corto antes de aprobar, rechazar o ejecutar."
      title={`Cierre ${proposalId}`}
    >
      <SurfaceCard padding="lg" variant="accent">
        <Text style={styles.heroTitle}>Revisa el cierre sugerido antes de confirmarlo.</Text>
        <Text style={styles.heroBody}>
          El sistema detecto este circulo sobre saldo neto derivado del ledger. Aqui ves cuanto baja y entre quienes.
        </Text>
      </SurfaceCard>

      {message ? <MessageBanner message={message} /> : null}

      <SurfaceCard padding="lg" variant="elevated">
        <StatusChip label={settlement.status} tone={settlement.status === 'approved' ? 'success' : 'primary'} />
        <Text style={styles.summaryTitle}>Estado de la propuesta</Text>
        <Text style={styles.summaryBody}>
          {settlement.status === 'pending_approvals'
            ? 'Faltan respuestas antes de ejecutarla.'
            : 'Ya puede ejecutarse si todo sigue vigente.'}
        </Text>
      </SurfaceCard>

      <SectionBlock title="Participantes" subtitle="Todos deben aceptar antes de que quede aprobado.">
        {settlement.participantStatuses.map((participant) => (
          <SurfaceCard key={participant} padding="md">
            <Text style={styles.text}>{participant}</Text>
          </SurfaceCard>
        ))}
      </SectionBlock>

      <SectionBlock title="Impacto" subtitle="Solo muestra el efecto del cierre, no el grafo completo.">
        {settlement.impactLines.length === 0 ? (
          <EmptyState
            description="La propuesta existe, pero no trajo movimientos legibles para esta pantalla."
            title="Sin movimientos visibles"
          />
        ) : (
          settlement.impactLines.map((impact) => (
            <SurfaceCard key={impact} padding="md">
              <Text style={styles.text}>{impact}</Text>
            </SurfaceCard>
          ))
        )}
      </SectionBlock>

      <SectionBlock title="Movimientos" subtitle="Cada linea representa un registro neto al ejecutar.">
        {settlement.movements.map((movement) => (
          <SurfaceCard key={movement} padding="md">
            <Text style={styles.text}>{movement}</Text>
          </SurfaceCard>
        ))}
      </SectionBlock>

      <SectionBlock title="Validacion" subtitle="Solo cuando necesites revisar trazabilidad.">
        <SurfaceCard padding="lg">
          <Text style={styles.label}>Snapshot hash</Text>
          <Text style={styles.text}>{settlement.snapshotHash}</Text>
          {settlement.explainers.map((item) => (
            <Text key={item} style={styles.helper}>
              {item}
            </Text>
          ))}
        </SurfaceCard>
      </SectionBlock>

      <View style={styles.actions}>
        {canApproveOrReject ? (
          <>
            <View style={styles.actionSlot}>
              <PrimaryAction
                label={busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
                onPress={busyAction ? undefined : () => void handleAction('approve')}
              />
            </View>
            <View style={styles.actionSlot}>
              <PrimaryAction
                label={busyAction === 'reject' ? 'Rechazando...' : 'Rechazar'}
                onPress={busyAction ? undefined : () => void handleAction('reject')}
                variant="secondary"
              />
            </View>
          </>
        ) : null}

        {canExecute ? (
          <View style={styles.actionSlot}>
            <PrimaryAction
              label={busyAction === 'execute' ? 'Ejecutando...' : 'Ejecutar cierre'}
              onPress={busyAction ? undefined : () => void handleAction('execute')}
            />
          </View>
        ) : null}

        <View style={styles.actionSlot}>
          <PrimaryAction href="/activity" label="Volver a alertas" variant="ghost" />
        </View>
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
  heroTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  heroBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  summaryBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
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
  actionSlot: {
    flexGrow: 1,
    minWidth: 140,
  },
});
