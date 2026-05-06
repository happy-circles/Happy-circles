import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

import { EmptyState } from '@/components/empty-state';
import { HappyCircleFaceIcon, HappyCircleRing } from '@/components/happy-circle-ring';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { Snackbar } from '@/components/snackbar';
import { StatusChip, type StatusChipProps } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { showBlockedActionAlert, useDelayedBusy, useFeedbackSnackbar } from '@/lib/action-feedback';
import { recordProductEventSafe } from '@/lib/analytics-client';
import { formatCop } from '@/lib/data';
import {
  useAppSnapshot,
  useApproveSettlementMutation,
  useRejectSettlementMutation,
  type SettlementDetailMovementDto,
  type SettlementDetailParticipantDto,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';

export interface SettlementDetailScreenProps {
  readonly proposalId: string;
}

const RESULT_OVERLAY_DURATION_MS = 2200;

interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface ActionOverlayState {
  readonly message?: string;
  readonly title: string;
  readonly variant: 'success' | 'danger';
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

function settlementStatusLabel(status: string): string {
  if (status === 'pending_approvals') {
    return 'Happy Circle pendiente';
  }

  if (status === 'approved') {
    return 'Happy Circle listo';
  }

  if (status === 'executed') {
    return 'Completado';
  }

  if (status === 'rejected') {
    return 'No completado';
  }

  if (status === 'stale') {
    return 'Reemplazado';
  }

  return status;
}

function settlementStatusTone(status: string): StatusChipProps['tone'] {
  if (status === 'rejected') {
    return 'danger';
  }

  if (status === 'stale') {
    return 'neutral';
  }

  if (status === 'pending_approvals') {
    return 'warning';
  }

  return 'cycle';
}

function orderParticipantsForCircle(
  participants: readonly SettlementDetailParticipantDto[],
  movements: readonly SettlementDetailMovementDto[],
  currentUserId: string | null,
): readonly SettlementDetailParticipantDto[] {
  if (!currentUserId) {
    return participants;
  }

  const byUserId = new Map(participants.map((participant) => [participant.userId, participant]));
  const nextByDebtorId = new Map(
    movements.map((movement) => [movement.debtorUserId, movement.creditorUserId]),
  );
  const ordered: SettlementDetailParticipantDto[] = [];
  const visited = new Set<string>();
  let cursor: string | null = currentUserId;

  while (
    cursor &&
    byUserId.has(cursor) &&
    !visited.has(cursor) &&
    ordered.length < participants.length
  ) {
    ordered.push(byUserId.get(cursor)!);
    visited.add(cursor);
    cursor = nextByDebtorId.get(cursor) ?? null;
  }

  for (const participant of participants) {
    if (!visited.has(participant.userId)) {
      ordered.push(participant);
    }
  }

  return ordered.length > 0 ? ordered : participants;
}

function personalMovementsForUser(
  movements: readonly SettlementDetailMovementDto[],
  currentUserId: string | null,
): readonly SettlementDetailMovementDto[] {
  if (!currentUserId) {
    return [];
  }

  const incoming = movements.filter((movement) => movement.creditorUserId === currentUserId);
  const outgoing = movements.filter((movement) => movement.debtorUserId === currentUserId);
  return [...incoming, ...outgoing].slice(0, 2);
}

function participantById(
  participants: readonly SettlementDetailParticipantDto[],
  userId: string | null,
  fallbackLabel: string,
): SettlementDetailParticipantDto | null {
  if (!userId) {
    return null;
  }

  return (
    participants.find((participant) => participant.userId === userId) ?? {
      userId,
      label: fallbackLabel,
      decision: 'pending',
    }
  );
}

function FocusedConnectionNode({
  participant,
  tone,
}: {
  readonly participant: SettlementDetailParticipantDto | null;
  readonly tone: 'current' | 'incoming' | 'outgoing' | 'muted';
}) {
  const displayLabel = participant
    ? tone === 'current'
      ? 'Tu'
      : (participant.label.split(/\s+/)[0] ?? participant.label)
    : 'Sin dato';

  return (
    <View style={styles.focusNodeWrap}>
      <View style={styles.focusNode}>
        {participant ? (
          <HappyCircleFaceIcon decision={participant.decision} size={40} />
        ) : (
          <Ionicons color={theme.colors.muted} name="remove-circle-outline" size={30} />
        )}
      </View>
      <AppText numberOfLines={1} style={styles.focusNodeLabel}>
        {displayLabel}
      </AppText>
    </View>
  );
}

function FocusedCircleConnections({
  currentUserId,
  movements,
  participants,
}: {
  readonly currentUserId: string | null;
  readonly movements: readonly SettlementDetailMovementDto[];
  readonly participants: readonly SettlementDetailParticipantDto[];
}) {
  const personalMovements = personalMovementsForUser(movements, currentUserId);
  const incomingMovement =
    personalMovements.find((movement) => movement.creditorUserId === currentUserId) ?? null;
  const outgoingMovement =
    personalMovements.find((movement) => movement.debtorUserId === currentUserId) ?? null;
  const currentParticipant = participantById(participants, currentUserId, 'Tu');
  const incomingParticipant = incomingMovement
    ? participantById(participants, incomingMovement.debtorUserId, incomingMovement.debtorLabel)
    : null;
  const outgoingParticipant = outgoingMovement
    ? participantById(participants, outgoingMovement.creditorUserId, outgoingMovement.creditorLabel)
    : null;
  const incomingAmount = incomingMovement ? formatCop(incomingMovement.amountMinor) : 'Sin pago';
  const outgoingAmount = outgoingMovement ? formatCop(outgoingMovement.amountMinor) : 'Sin pago';

  return (
    <View style={styles.focusGraph}>
      <Svg height={140} style={styles.focusCurveLayer} width={282}>
        <Path
          d="M 58 104 C 74 40 119 20 141 38"
          fill="none"
          stroke={incomingMovement ? theme.colors.success : theme.colors.surfaceSoft}
          strokeLinecap="round"
          strokeWidth={7}
        />
        <Path
          d="M 135 42 L 147 37 L 143 50 Z"
          fill={incomingMovement ? theme.colors.success : theme.colors.surfaceSoft}
        />
        <Path
          d="M 141 38 C 164 20 208 40 224 104"
          fill="none"
          stroke={outgoingMovement ? theme.colors.warning : theme.colors.surfaceSoft}
          strokeLinecap="round"
          strokeWidth={7}
        />
        <Path
          d="M 220 97 L 226 110 L 212 106 Z"
          fill={outgoingMovement ? theme.colors.warning : theme.colors.surfaceSoft}
        />
      </Svg>
      <AppText
        numberOfLines={1}
        style={[
          styles.focusArrowLabel,
          styles.focusArrowLabelIncoming,
          { color: incomingMovement ? theme.colors.success : theme.colors.textMuted },
        ]}
      >
        Te paga
      </AppText>
      <AppText
        numberOfLines={1}
        style={[
          styles.focusArrowLabel,
          styles.focusArrowLabelOutgoing,
          { color: outgoingMovement ? theme.colors.warning : theme.colors.textMuted },
        ]}
      >
        Le pagas
      </AppText>
      <View style={[styles.focusNodeAbsolute, styles.focusNodeIncoming]}>
        <FocusedConnectionNode
          participant={incomingParticipant}
          tone={incomingParticipant ? 'incoming' : 'muted'}
        />
      </View>
      <View style={[styles.focusNodeAbsolute, styles.focusNodeCurrentPosition]}>
        <FocusedConnectionNode participant={currentParticipant} tone="current" />
      </View>
      <View style={[styles.focusNodeAbsolute, styles.focusNodeOutgoing]}>
        <FocusedConnectionNode
          participant={outgoingParticipant}
          tone={outgoingParticipant ? 'outgoing' : 'muted'}
        />
      </View>
      <View style={[styles.focusExplanationPill, styles.focusExplanationIncoming]}>
        <AppText numberOfLines={1} style={styles.focusExplanationLabel}>
          {incomingParticipant
            ? `${incomingParticipant.label.split(/\s+/)[0]} te paga`
            : 'Nadie te paga'}
        </AppText>
        <AppText style={[styles.focusExplanationAmount, { color: theme.colors.success }]}>
          {incomingAmount}
        </AppText>
      </View>
      <View style={[styles.focusExplanationPill, styles.focusExplanationOutgoing]}>
        <AppText numberOfLines={1} style={styles.focusExplanationLabel}>
          {outgoingParticipant
            ? `Pagas a ${outgoingParticipant.label.split(/\s+/)[0]}`
            : 'No pagas'}
        </AppText>
        <AppText style={[styles.focusExplanationAmount, { color: theme.colors.warning }]}>
          {outgoingAmount}
        </AppText>
      </View>
    </View>
  );
}

function SettlementCircleGraph({
  currentUserId,
  focused,
  movements,
  participants,
}: {
  readonly currentUserId: string | null;
  readonly focused: boolean;
  readonly movements: readonly SettlementDetailMovementDto[];
  readonly participants: readonly SettlementDetailParticipantDto[];
}) {
  if (focused) {
    return (
      <FocusedCircleConnections
        currentUserId={currentUserId}
        movements={movements}
        participants={participants}
      />
    );
  }

  const ringSize = 180;
  const orderedParticipants = orderParticipantsForCircle(participants, movements, currentUserId);

  return (
    <View style={styles.circleGraph}>
      <HappyCircleRing decisions={orderedParticipants} ringSize={ringSize} />
    </View>
  );
}

export function SettlementDetailScreen({ proposalId }: SettlementDetailScreenProps) {
  const router = useRouter();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();

  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);
  const [actionOverlay, setActionOverlay] = useState<ActionOverlayState | null>(null);
  const [graphFocused, setGraphFocused] = useState(false);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const showBusyOverlay = useDelayedBusy(Boolean(busyAction));
  const viewedProposalIdRef = useRef<string | null>(null);
  const resultOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settlement = snapshotQuery.data?.settlementsById[proposalId] ?? null;

  useEffect(() => {
    if (!settlement || viewedProposalIdRef.current === proposalId) {
      return;
    }

    viewedProposalIdRef.current = proposalId;
    recordProductEventSafe({
      eventName: 'settlement_proposal_viewed',
      screenName: 'settlement_detail',
      metadata: { status: settlement?.status ?? 'loading' },
    });
  }, [proposalId, settlement?.status]);

  useEffect(
    () => () => {
      if (resultOverlayTimeoutRef.current) {
        clearTimeout(resultOverlayTimeoutRef.current);
      }
    },
    [],
  );

  function showActionOverlay(nextOverlay: ActionOverlayState) {
    if (resultOverlayTimeoutRef.current) {
      clearTimeout(resultOverlayTimeoutRef.current);
    }

    setActionOverlay(nextOverlay);

    return new Promise<void>((resolve) => {
      resultOverlayTimeoutRef.current = setTimeout(() => {
        setActionOverlay(null);
        resultOverlayTimeoutRef.current = null;
        resolve();
      }, RESULT_OVERLAY_DURATION_MS);
    });
  }

  async function handleAction(action: 'approve' | 'reject') {
    setBusyAction(action);
    setBanner(null);
    setActionOverlay(null);

    try {
      if (action === 'approve') {
        const response = await approveSettlement.mutateAsync(proposalId);
        const nextStatus = readResultStatus(response);
        if (nextStatus === 'stale') {
          setBanner({
            message: 'Este Circle fue reemplazado porque el grafo cambio.',
            tone: 'warning',
          });
        } else {
          const nextAutoCycleStatus = readNestedStatus(response, 'nextAutoCycleJob');
          await showActionOverlay({
            message:
              nextStatus === 'executed'
                ? nextAutoCycleStatus === 'queued'
                  ? 'La transaccion quedo confirmada. Estamos buscando el siguiente en segundo plano.'
                  : 'La transaccion quedo confirmada.'
                : 'Tu aprobacion quedo registrada.',
            title: nextStatus === 'executed' ? 'Happy Circle completado' : 'Decision guardada',
            variant: 'success',
          });
        }
      } else if (action === 'reject') {
        await rejectSettlement.mutateAsync(proposalId);
        showSnackbar('Happy Circle no aprobado.', 'neutral');
      }
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'No se pudo completar la accion.';
      if (
        showBlockedActionAlert(nextMessage, router, {
          hasEmailPassword: session.linkedMethods.hasEmailPassword,
          profile: {
            displayName: session.profile?.display_name ?? null,
            avatarPath: session.profile?.avatar_path ?? null,
            phoneE164: session.profile?.phone_e164 ?? null,
          },
        })
      ) {
        return;
      }

      await showActionOverlay({
        message: nextMessage,
        title: 'No se pudo completar',
        variant: 'danger',
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell
        eyebrow="Happy Circle"
        largeTitle={false}
        subtitle="Cargando el detalle de la propuesta."
        title="Happy Circle"
      >
        <HappyCirclesMotion size={108} variant="loading" />
        <AppText style={styles.supportText}>
          Estamos leyendo participantes, movimientos y estado.
        </AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        eyebrow="Happy Circle"
        largeTitle={false}
        refresh={refresh}
        subtitle="No pudimos cargar esta propuesta."
        title="Happy Circle"
      >
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (!settlement) {
    return (
      <ScreenShell
        eyebrow="Happy Circle"
        largeTitle={false}
        refresh={refresh}
        subtitle="No encontramos esta propuesta."
        title="Happy Circle"
      >
        <EmptyState
          description="Confirma que sigas siendo participante o que el id exista en Supabase."
          title="Propuesta no visible"
        />
      </ScreenShell>
    );
  }

  const myDecision =
    settlement.participantDecisions.find((participant) => participant.userId === session.userId)
      ?.decision ?? null;
  const canDecide = settlement.status === 'pending_approvals' && myDecision === 'pending';
  const approvalsPending = settlement.participantDecisions.filter(
    (participant) => participant.decision === 'pending',
  ).length;
  const summaryText =
    settlement.status === 'pending_approvals'
      ? approvalsPending > 0
        ? `Faltan ${approvalsPending} aprobacion${approvalsPending === 1 ? '' : 'es'} para completarlo automaticamente.`
        : 'Ya no faltan respuestas. Estamos completando el Circle.'
      : settlement.status === 'approved'
        ? 'Todos aprobaron este Happy Circle. Estamos verificando el cierre automatico.'
        : settlement.status === 'executed'
          ? 'Happy Circle completado.'
          : settlement.status === 'rejected'
            ? 'Este Circle no se completo.'
            : 'Este Circle fue reemplazado por cambios nuevos.';
  return (
    <ScreenShell
      eyebrow="Happy Circle"
      largeTitle={false}
      overlay={
        <Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />
      }
      refresh={refresh}
      subtitle="Lo esencial antes de aprobar."
      title="Happy Circle"
    >
      {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

      <SurfaceCard padding="lg" style={styles.summaryCard} variant="elevated">
        <StatusChip
          label={settlementStatusLabel(settlement.status)}
          tone={settlementStatusTone(settlement.status)}
        />
        <AppText style={styles.summaryTitle}>Que pasa con este Happy Circle</AppText>
        <AppText style={styles.summaryBody}>{summaryText}</AppText>
      </SurfaceCard>

      <SurfaceCard padding="lg" style={styles.circleGraphCard} variant="elevated">
        <View style={styles.circleGraphHeader}>
          <View style={styles.circleGraphTitleBlock}>
            <AppText style={styles.circleGraphTitle}>Estado del Circle</AppText>
            <AppText style={styles.circleGraphSubtitle}>
              {graphFocused
                ? 'Tus conexiones directas dentro del cierre.'
                : 'Vista completa del Circle.'}
            </AppText>
          </View>
          <Pressable
            accessibilityLabel={
              graphFocused ? 'Mostrar Circle completo' : 'Mostrar conexiones importantes'
            }
            hitSlop={10}
            onPress={() => setGraphFocused((current) => !current)}
            style={({ pressed }) => [
              styles.circleGraphInfoButton,
              graphFocused ? styles.circleGraphInfoButtonActive : null,
              pressed ? styles.circleGraphInfoButtonPressed : null,
            ]}
          >
            <Ionicons
              color={graphFocused ? transactionCategoryColor('cycle') : theme.colors.textMuted}
              name={graphFocused ? 'close-circle-outline' : 'information-circle-outline'}
              size={20}
            />
          </Pressable>
        </View>
        <SettlementCircleGraph
          currentUserId={session.userId}
          focused={graphFocused}
          movements={settlement.movementDetails}
          participants={settlement.participantDecisions}
        />
      </SurfaceCard>

      {canDecide ? (
        <View style={styles.actions}>
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
                        '¿Seguro quieres rechazar este Happy Circle?',
                        'Si rechazas, este Circle se cerrara para todos. No se aplicara ningun movimiento.',
                        [
                          {
                            text: 'Volver',
                            style: 'cancel',
                          },
                          {
                            text: 'Rechazar Circle',
                            style: 'destructive',
                            onPress: () => void handleAction('reject'),
                          },
                        ],
                      )
              }
              variant="secondary"
            />
          </View>
        </View>
      ) : null}
      <LoadingOverlay
        message={
          actionOverlay?.message ?? 'No salgas de esta pantalla mientras registramos la decision.'
        }
        title={actionOverlay?.title ?? 'Procesando transaccion'}
        variant={actionOverlay?.variant ?? 'loading'}
        visible={showBusyOverlay || Boolean(actionOverlay)}
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
  summaryCard: {
    borderLeftColor: transactionCategoryColor('cycle'),
    borderLeftWidth: 3,
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
  circleGraphCard: {
    borderLeftColor: transactionCategoryColor('cycle'),
    borderLeftWidth: 3,
  },
  circleGraphHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  circleGraphTitleBlock: {
    flex: 1,
    gap: 2,
  },
  circleGraphTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 24,
  },
  circleGraphSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  circleGraphInfoButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    height: 32,
    justifyContent: 'center',
    marginTop: -2,
    width: 32,
  },
  circleGraphInfoButtonActive: {
    backgroundColor: theme.colors.primaryGhost,
  },
  circleGraphInfoButtonPressed: {
    opacity: 0.72,
  },
  circleGraph: {
    alignSelf: 'center',
    marginTop: theme.spacing.md,
    position: 'relative',
  },
  focusGraph: {
    alignSelf: 'center',
    height: 228,
    marginTop: theme.spacing.md,
    position: 'relative',
    width: 282,
  },
  focusCurveLayer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  focusNodeAbsolute: {
    position: 'absolute',
  },
  focusNodeIncoming: {
    left: 0,
    top: 82,
  },
  focusNodeCurrentPosition: {
    left: 114,
    top: 0,
  },
  focusNodeOutgoing: {
    left: 228,
    top: 82,
  },
  focusNodeWrap: {
    alignItems: 'center',
    width: 56,
  },
  focusNode: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  focusNodeLabel: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    marginTop: 3,
    maxWidth: 56,
    textAlign: 'center',
  },
  focusArrowLabel: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
    position: 'absolute',
  },
  focusArrowLabelIncoming: {
    left: 64,
    top: 44,
  },
  focusArrowLabelOutgoing: {
    right: 54,
    top: 44,
  },
  focusExplanationPill: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.medium,
    gap: 2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    position: 'absolute',
    top: 164,
    width: 132,
  },
  focusExplanationIncoming: {
    left: 0,
  },
  focusExplanationOutgoing: {
    right: 0,
  },
  focusExplanationLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  focusExplanationAmount: {
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 16,
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
