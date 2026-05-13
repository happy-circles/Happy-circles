import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

import { EmptyState } from '@/components/empty-state';
import {
  HappyCircleFaceIcon,
  HappyCircleRing,
  type HappyCircleDecision,
  type HappyCircleRingParticipant,
} from '@/components/happy-circle-ring';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { Snackbar } from '@/components/snackbar';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import {
  showBlockedActionAlert,
  useActionFeedbackOverlay,
  useFeedbackSnackbar,
} from '@/lib/action-feedback';
import { recordProductEventSafe } from '@/lib/analytics-client';
import {
  triggerAppActionHaptic,
  triggerAppErrorHaptic,
  triggerAppSelectionHaptic,
  triggerAppWarningHaptic,
} from '@/lib/app-haptics';
import { formatCop } from '@/lib/data';
import { resolveHappyCirclePresentation } from '@/lib/happy-circle-presentation';
import {
  useAppSnapshot,
  useApproveSettlementMutation,
  useRejectSettlementMutation,
  type SettlementDetailMovementDto,
  type SettlementDetailParticipantDto,
} from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { settlementDetailScreenStyles as styles } from './settlement-detail-screen-styles';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';
import { CardTimeline, type CardTone } from '@/components/card-shell';

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

function versionTimelineTone(status: string): CardTone {
  if (status === 'executed') {
    return 'success';
  }

  if (status === 'approved') {
    return 'cycle';
  }

  if (status === 'pending_approvals') {
    return 'warning';
  }

  if (status === 'rejected') {
    return 'danger';
  }

  return 'neutral';
}

function circleFallbackDecision(
  participants: readonly SettlementDetailParticipantDto[],
): HappyCircleDecision {
  if (participants.some((participant) => participant.decision === 'rejected')) {
    return 'rejected';
  }

  if (participants.some((participant) => participant.decision === 'pending')) {
    return 'pending';
  }

  return 'approved';
}

function anonymousGraphParticipant(
  key: string,
  decision: HappyCircleDecision,
): HappyCircleRingParticipant {
  return {
    decision,
    label: 'Happy',
    userId: key,
  };
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

function privateCircleParticipants(
  participants: readonly SettlementDetailParticipantDto[],
  movements: readonly SettlementDetailMovementDto[],
  currentUserId: string | null,
): readonly HappyCircleRingParticipant[] {
  const fallbackDecision = circleFallbackDecision(participants);
  const personalMovements = personalMovementsForUser(movements, currentUserId);
  const incomingMovement =
    personalMovements.find((movement) => movement.creditorUserId === currentUserId) ?? null;
  const outgoingMovement =
    personalMovements.find((movement) => movement.debtorUserId === currentUserId) ?? null;
  const currentParticipant =
    participantById(participants, currentUserId, 'Tu') ??
    anonymousGraphParticipant('happy-circle:self', fallbackDecision);
  const outgoingParticipant = outgoingMovement
    ? participantById(participants, outgoingMovement.creditorUserId, outgoingMovement.creditorLabel)
    : null;
  const incomingParticipant = incomingMovement
    ? participantById(participants, incomingMovement.debtorUserId, incomingMovement.debtorLabel)
    : null;

  return [
    { ...currentParticipant, label: 'Tu' },
    outgoingParticipant ?? anonymousGraphParticipant('happy-circle:outgoing', fallbackDecision),
    anonymousGraphParticipant('happy-circle:hidden:right', fallbackDecision),
    anonymousGraphParticipant('happy-circle:hidden:left', fallbackDecision),
    incomingParticipant ?? anonymousGraphParticipant('happy-circle:incoming', fallbackDecision),
  ];
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
  amountLabel,
  currentUserId,
  focused,
  movements,
  participants,
}: {
  readonly amountLabel: string;
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

  const ringSize = 260;
  const visibleParticipants = privateCircleParticipants(participants, movements, currentUserId);

  return (
    <View style={styles.circleGraph}>
      <HappyCircleRing
        centerColor={transactionCategoryColor('cycle')}
        centerLabel={amountLabel}
        centerSubLabel="a solucionar"
        decisions={visibleParticipants}
        ringSize={ringSize}
      />
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
  const [graphFocused, setGraphFocused] = useState(false);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const actionFeedback = useActionFeedbackOverlay();
  const viewedProposalIdRef = useRef<string | null>(null);

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

  async function handleAction(action: 'approve' | 'reject') {
    setBusyAction(action);
    setBanner(null);
    actionFeedback.clear();

    try {
      if (action === 'approve') {
        const response = await actionFeedback.runBlockingAction('approveSettlement', () =>
          approveSettlement.mutateAsync(proposalId),
        );
        const nextStatus = readResultStatus(response);
        if (nextStatus === 'stale') {
          triggerAppWarningHaptic();
          setBanner({
            message: 'Esta versión fue reemplazada porque los saldos cambiaron.',
            tone: 'warning',
          });
        } else {
          const nextAutoCycleStatus = readNestedStatus(response, 'nextAutoCycleJob');
          await actionFeedback.showResult({
            message:
              nextStatus === 'executed'
                ? nextAutoCycleStatus === 'queued'
                  ? 'Siguiente Circle'
                  : 'Happy Circle completado'
                : 'Decision guardada',
            title: 'Listo',
            variant: 'success',
          });
        }
      } else if (action === 'reject') {
        await rejectSettlement.mutateAsync(proposalId);
        triggerAppWarningHaptic();
        showSnackbar('Happy Circle no aprobado.', 'neutral');
      }
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'No se pudo completar la acción.';
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

      if (action === 'approve') {
        await actionFeedback.showResult({
          message: 'Intenta nuevamente',
          title: 'No se pudo',
          variant: 'danger',
        });
      } else {
        triggerAppErrorHaptic();
        showSnackbar(nextMessage, 'danger');
      }
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
  const presentation = resolveHappyCirclePresentation({
    approvalsPending,
    myDecision,
    status: settlement.status,
  });
  const summaryText = presentation.summary;
  const replacementProposalId = settlement.replacedByProposalId;
  const versionTimelineSteps = settlement.timeline.map((item) => ({
    id: item.proposalId,
    title: item.title,
    detail: item.detail,
    amountLabel: formatCop(item.amountMinor),
    meta: item.isCurrent ? 'Version actual' : null,
    tone: versionTimelineTone(item.status),
  }));

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
        <StatusChip label={presentation.label} tone={presentation.tone} />
        <AppText style={styles.summaryTitle}>Que pasa con este Happy Circle</AppText>
        <AppText style={styles.summaryBody}>{summaryText}</AppText>
      </SurfaceCard>

      <SurfaceCard padding="lg" style={styles.timelineCard} variant="elevated">
        <View style={styles.timelineHeader}>
          <AppText style={styles.timelineTitle}>Historial de versiones</AppText>
          <AppText style={styles.timelineSubtitle}>
            Solo mostramos versiones cuando cambia lo que debes revisar.
          </AppText>
        </View>
        <CardTimeline steps={versionTimelineSteps} />
        {replacementProposalId ? (
          <View style={styles.replacementAction}>
            <PrimaryAction
              label="Ver nueva versión"
              onPress={() => {
                triggerAppSelectionHaptic();
                pushRoute(router, `/settlements/${replacementProposalId}`);
              }}
              variant="secondary"
            />
          </View>
        ) : null}
      </SurfaceCard>

      <SurfaceCard padding="lg" style={styles.circleGraphCard} variant="elevated">
        <View style={styles.circleGraphHeader}>
          <View style={styles.circleGraphTitleBlock}>
            <AppText style={styles.circleGraphTitle}>Estado del Circle</AppText>
            <AppText style={styles.circleGraphSubtitle}>
              {graphFocused
                ? 'Tus conexiones directas dentro del cierre.'
                : 'Solo ves tus conexiones directas.'}
            </AppText>
          </View>
          <Pressable
            accessibilityLabel={
              graphFocused ? 'Mostrar Circle completo' : 'Mostrar conexiones importantes'
            }
            hitSlop={10}
            onPress={() => {
              setGraphFocused((current) => !current);
            }}
            onPressIn={triggerAppSelectionHaptic}
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
          amountLabel={formatCop(settlement.personalAmountMinor)}
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
              onPress={
                busyAction
                  ? undefined
                  : () => {
                      triggerAppActionHaptic();
                      void handleAction('approve');
                    }
              }
            />
          </View>
          <View style={styles.actionSlot}>
            <PrimaryAction
              label={busyAction === 'reject' ? 'Rechazando...' : 'Rechazar'}
              loading={busyAction === 'reject'}
              onPress={
                busyAction
                  ? undefined
                  : () => {
                      triggerAppWarningHaptic();
                      Alert.alert(
                        '¿Seguro quieres rechazar este Happy Circle?',
                        'Si rechazas, este Circle se cerrará para todos. No se aplicará ningún movimiento.',
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
                      );
                    }
              }
              variant="secondary"
            />
          </View>
        </View>
      ) : null}
      <LoadingOverlay {...actionFeedback.overlayProps} />
    </ScreenShell>
  );
}
