import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { Snackbar } from '@/components/snackbar';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { showBlockedActionAlert, useDelayedBusy, useFeedbackSnackbar } from '@/lib/action-feedback';
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

interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
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
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();

  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | 'execute' | null>(null);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const showBusyOverlay = useDelayedBusy(Boolean(busyAction));

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
    setBanner(null);

    try {
      if (action === 'approve') {
        const response = await approveSettlement.mutateAsync(proposalId);
        const nextStatus = readResultStatus(response);
        if (nextStatus === 'stale') {
          setBanner({
            message: 'La propuesta ya no coincide con el grafo actual y quedo obsoleta.',
            tone: 'warning',
          });
        } else {
          showSnackbar(
            nextStatus === 'approved'
              ? 'Todos aceptaron. El cierre ya quedo aprobado.'
              : 'Tu aprobacion quedo registrada.',
            'success',
          );
        }
      } else if (action === 'reject') {
        await rejectSettlement.mutateAsync(proposalId);
        showSnackbar('Cierre rechazado.', 'neutral');
      } else {
        const response = await executeSettlement.mutateAsync(proposalId);
        const nextStatus = readResultStatus(response);
        const nextAutoCycleStatus = readNestedStatus(response, 'nextAutoCycleProposal');
        const nextAutoCycleProposalId = readNestedProposalId(response, 'nextAutoCycleProposal');
        if (nextStatus === 'stale') {
          setBanner({
            message: 'La propuesta se volvio obsoleta antes de ejecutar.',
            tone: 'warning',
          });
        } else {
          showSnackbar('Cierre ejecutado.', 'success');
        }
        showAutoCyclePrompt(nextAutoCycleProposalId, nextAutoCycleStatus);
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : 'No se pudo completar la accion.';
      if (
        showBlockedActionAlert(nextMessage, router, {
          hasEmailPassword: session.linkedMethods.hasEmailPassword,
          profile: {
            avatarPath: session.profile?.avatar_path ?? null,
            phoneE164: session.profile?.phone_e164 ?? null,
          },
        })
      ) {
        return;
      }

      setBanner({
        message: nextMessage,
        tone: 'danger',
      });
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
  const approvalsPending = settlement.participantStatuses.filter((participant) => participant.endsWith(': pending')).length;
  const summaryText =
    settlement.status === 'pending_approvals'
      ? approvalsPending > 0
        ? `Faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'} para poder ejecutarlo.`
        : 'Ya no faltan respuestas. Solo queda ejecutar el cierre.'
      : settlement.status === 'approved'
        ? 'Todos aprobaron este cierre. Puedes ejecutarlo ahora.'
        : settlement.status === 'executed'
          ? 'Este cierre ya fue aplicado al ledger.'
          : 'Este cierre ya no esta activo en el estado actual del grafo.';
  const primaryLines = settlement.impactLines.length > 0 ? settlement.impactLines : settlement.movements;

  return (
    <ScreenShell
      eyebrow="Cierre"
      largeTitle={false}
      overlay={<Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />}
      subtitle="Lo esencial antes de aprobar o ejecutar."
      title={`Cierre ${proposalId}`}
    >
      {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

      <SurfaceCard padding="lg" variant="elevated">
        <StatusChip label={settlement.status} tone={settlement.status === 'approved' ? 'success' : 'primary'} />
        <Text style={styles.summaryTitle}>Que pasa con este cierre</Text>
        <Text style={styles.summaryBody}>{summaryText}</Text>
      </SurfaceCard>

      <SectionBlock title="Participantes" subtitle="Solo necesitas ver quien ya respondio.">
        {settlement.participantStatuses.map((participant) => (
          <SurfaceCard key={participant} padding="md">
            <Text style={styles.text}>{participant}</Text>
          </SurfaceCard>
        ))}
      </SectionBlock>

      <SectionBlock title="Que cambiara" subtitle="Este es el efecto neto del cierre.">
        {primaryLines.length === 0 ? (
          <EmptyState
            description="La propuesta existe, pero no trajo un resumen legible para esta pantalla."
            title="Sin resumen visible"
          />
        ) : (
          primaryLines.map((line) => (
            <SurfaceCard key={line} padding="md">
              <Text style={styles.text}>{line}</Text>
            </SurfaceCard>
          ))
        )}
      </SectionBlock>

      <View style={styles.actions}>
        {canApproveOrReject ? (
          <>
            <View style={styles.actionSlot}>
              <PrimaryAction
                label={busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
                loading={busyAction === 'approve'}
                onPress={busyAction ? undefined : () => void handleAction('approve')}
              />
            </View>
            <View style={styles.actionSlot}>
              <PrimaryAction
                label={busyAction === 'reject' ? 'Rechazando...' : 'Rechazar'}
                loading={busyAction === 'reject'}
                onPress={
                  busyAction
                    ? undefined
                    : () =>
                        Alert.alert(
                          'Rechazar cierre',
                          'Tu respuesta dejara claro que no apruebas este cierre.',
                          [
                            {
                              text: 'Cancelar',
                              style: 'cancel',
                            },
                            {
                              text: 'Rechazar',
                              style: 'destructive',
                              onPress: () => void handleAction('reject'),
                            },
                          ],
                        )
                }
                variant="secondary"
              />
            </View>
          </>
        ) : null}

        {canExecute ? (
          <View style={styles.actionSlot}>
            <PrimaryAction
              label={busyAction === 'execute' ? 'Ejecutando...' : 'Ejecutar cierre'}
              loading={busyAction === 'execute'}
              onPress={
                busyAction
                  ? undefined
                  : () =>
                      Alert.alert(
                        'Ejecutar cierre',
                        'Aplicaremos este cierre al ledger y ya no podras deshacerlo desde aqui.',
                        [
                          {
                            text: 'Cancelar',
                            style: 'cancel',
                          },
                          {
                            text: 'Ejecutar',
                            style: 'destructive',
                            onPress: () => void handleAction('execute'),
                          },
                        ],
                      )
              }
            />
          </View>
        ) : null}

        <View style={styles.actionSlot}>
          <PrimaryAction href="/activity" label="Volver a alertas" variant="ghost" />
        </View>
      </View>
      <LoadingOverlay
        message="No cierres esta pantalla mientras registramos la decision."
        title="Procesando accion"
        visible={showBusyOverlay}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
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
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    lineHeight: 22,
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
