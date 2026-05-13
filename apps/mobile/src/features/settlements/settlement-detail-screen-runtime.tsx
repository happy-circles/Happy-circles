import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CardTimeline,
  type CardTimelineStep,
  type CardTone,
} from '@/components/card-shell';
import { EmptyState } from '@/components/empty-state';
import { HappyCircleFaceIcon, happyCircleDecisionColor } from '@/components/happy-circle-ring';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { Snackbar } from '@/components/snackbar';
import { StatusChip } from '@/components/status-chip';
import { StateAuraLayer, stateAuraVariantFromTone } from '@/components/state-aura-layer';
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
  type SettlementVersionTimelineItemDto,
} from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { settlementDetailScreenStyles as styles } from './settlement-detail-screen-styles';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

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

function versionStatusLabel(status: string): string {
  if (status === 'pending_approvals') {
    return 'En aprobacion';
  }

  if (status === 'approved') {
    return 'Lista';
  }

  if (status === 'executed') {
    return 'Cerrada';
  }

  if (status === 'rejected') {
    return 'No aprobada';
  }

  if (status === 'stale') {
    return 'Reemplazada';
  }

  if (status === 'expired') {
    return 'Expirada';
  }

  return status;
}

function versionNumberLabel(item: SettlementVersionTimelineItemDto, index: number): string {
  const versionNumber = item.displayVersionNumber ?? item.versionNumber ?? index + 1;

  return `Version ${versionNumber}`;
}

function versionDateLabel(timestamp: string): string | null {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function versionStoryTitle(item: SettlementVersionTimelineItemDto, index: number): string {
  if (item.isCurrent) {
    return index === 0 ? 'Calculo actual' : 'Nuevo calculo actual';
  }

  if (item.status === 'executed') {
    return 'Circle cerrado';
  }

  if (item.status === 'rejected') {
    return 'No se aprobo';
  }

  if (item.status === 'stale' || item.replacedByProposalId) {
    return index === 0 ? 'Primer calculo' : 'Calculo anterior';
  }

  return index === 0 ? 'Primer calculo' : 'Nuevo calculo';
}

function versionStoryDetail(item: SettlementVersionTimelineItemDto): string | null {
  if (item.status === 'pending_approvals') {
    return 'Esperando aprobaciones';
  }

  if (item.status === 'approved') {
    return 'Listo para cerrar';
  }

  if (item.status === 'executed') {
    return 'Actualizo el saldo';
  }

  if (item.status === 'rejected') {
    return 'No cambio el saldo';
  }

  if (item.status === 'stale') {
    return 'Los saldos cambiaron';
  }

  if (item.status === 'expired') {
    return 'Expiro antes de cerrarse';
  }

  return null;
}

function versionStoryMeta(item: SettlementVersionTimelineItemDto, index: number): string {
  const parts = [
    versionNumberLabel(item, index),
    versionDateLabel(item.createdAt),
    item.isCurrent ? 'Actual' : versionStatusLabel(item.status),
  ].filter(Boolean);

  return parts.join(' / ');
}

function versionStorySteps(
  timeline: readonly SettlementVersionTimelineItemDto[],
): readonly CardTimelineStep[] {
  return timeline.map((item, index) => ({
    amountLabel: formatCop(item.amountMinor),
    detail: versionStoryDetail(item),
    id: item.proposalId,
    meta: versionStoryMeta(item, index),
    tone: versionTimelineTone(item.status),
    title: versionStoryTitle(item, index),
  }));
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
  return [...incoming, ...outgoing];
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

function approvalDecisionLabel(decision: SettlementDetailParticipantDto['decision']): string {
  if (decision === 'approved') {
    return 'aprobado';
  }

  if (decision === 'rejected') {
    return 'no aprobado';
  }

  return 'pendiente';
}

function ApprovalPills({
  participants,
}: {
  readonly participants: readonly SettlementDetailParticipantDto[];
}) {
  if (participants.length === 0) {
    return null;
  }

  return (
    <View style={styles.approvalPillsRow}>
      {participants.map((participant) => {
        const color = happyCircleDecisionColor(participant.decision);

        return (
          <View
            accessible
            accessibilityLabel={`${participant.label}: ${approvalDecisionLabel(participant.decision)}`}
            key={participant.userId}
            style={[
              styles.approvalPill,
              { backgroundColor: color, shadowColor: color },
            ]}
          />
        );
      })}
    </View>
  );
}

function MovementEndpoint({
  active,
  label,
  participant,
  tone,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly participant: SettlementDetailParticipantDto | null;
  readonly tone: 'success' | 'warning';
}) {
  const toneColor = tone === 'success' ? theme.colors.success : theme.colors.warning;

  return (
    <View style={styles.movementEndpoint}>
      <View
        style={[
          styles.movementEndpointIcon,
          { backgroundColor: active ? `${toneColor}12` : theme.colors.surfaceSoft },
        ]}
      >
        {participant ? (
          <HappyCircleFaceIcon decision={participant.decision} size={30} />
        ) : (
          <Ionicons color={theme.colors.textMuted} name="remove-circle-outline" size={22} />
        )}
      </View>
      <AppText numberOfLines={1} style={styles.movementEndpointLabel}>
        {label}
      </AppText>
    </View>
  );
}

function MovementFlowBadge({
  active,
  amountLabel,
  direction,
  label,
  tone,
}: {
  readonly active: boolean;
  readonly amountLabel: string;
  readonly direction: 'incoming' | 'outgoing';
  readonly label: string;
  readonly tone: 'success' | 'warning';
}) {
  const toneColor = tone === 'success' ? theme.colors.success : theme.colors.warning;
  const color = active ? toneColor : theme.colors.textMuted;
  const lineColor = active ? `${toneColor}B8` : theme.colors.hairline;

  return (
    <View style={styles.movementFlowBadge}>
      <View style={styles.movementConnectorTop}>
        <AppText numberOfLines={1} style={[styles.movementDetailLabel, { color }]}>
          {label}
        </AppText>
        <AppText
          adjustsFontSizeToFit
          minimumFontScale={0.76}
          numberOfLines={1}
          style={[styles.movementDetailAmount, { color }]}
        >
          {amountLabel}
        </AppText>
      </View>
      <View
        style={[
          styles.movementLineRow,
          direction === 'incoming'
            ? styles.movementLineRowIncoming
            : styles.movementLineRowOutgoing,
        ]}
      >
        <View style={[styles.movementLine, { backgroundColor: lineColor }]} />
        <Ionicons color={lineColor} name="arrow-forward" size={15} />
        <View style={[styles.movementLine, { backgroundColor: lineColor }]} />
      </View>
    </View>
  );
}

function MovementSelfNode({
  participant,
}: {
  readonly participant: SettlementDetailParticipantDto | null;
}) {
  return (
    <View style={styles.movementSelfNode}>
      <View style={[styles.movementSelfIcon, { backgroundColor: `${theme.colors.cycle}12` }]}>
        {participant ? (
          <HappyCircleFaceIcon decision={participant.decision} size={34} />
        ) : (
          <Ionicons color={theme.colors.cycle} name="person-circle-outline" size={26} />
        )}
      </View>
      <AppText numberOfLines={1} style={styles.movementSelfLabel}>
        Tu
      </AppText>
    </View>
  );
}

function participantShortLabel(participant: SettlementDetailParticipantDto | null, fallback: string) {
  if (!participant) {
    return fallback;
  }

  return participant.label.split(/\s+/)[0] ?? participant.label;
}

function CircleMovementDetails({
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

  return (
    <View style={styles.movementDetails}>
      <View style={styles.movementMapRow}>
        <MovementEndpoint
          active={incomingMovement !== null}
          label={participantShortLabel(incomingParticipant, 'Nadie')}
          participant={incomingParticipant}
          tone="success"
        />
        <MovementFlowBadge
          active={incomingMovement !== null}
          amountLabel={incomingMovement ? formatCop(incomingMovement.amountMinor) : 'Sin pago'}
          direction="incoming"
          label="Recibes"
          tone="success"
        />
        <View style={styles.movementSelfSpacer} />
      </View>

      <View style={styles.movementCenterRow}>
        <MovementSelfNode participant={currentParticipant} />
      </View>

      <View style={styles.movementMapRow}>
        <View style={styles.movementSelfSpacer} />
        <MovementFlowBadge
          active={outgoingMovement !== null}
          amountLabel={outgoingMovement ? formatCop(outgoingMovement.amountMinor) : 'Sin pago'}
          direction="outgoing"
          label="Pagas"
          tone="warning"
        />
        <MovementEndpoint
          active={outgoingMovement !== null}
          label={participantShortLabel(outgoingParticipant, 'Nadie')}
          participant={outgoingParticipant}
          tone="warning"
        />
      </View>
    </View>
  );
}

export function SettlementDetailScreen({ proposalId }: SettlementDetailScreenProps) {
  const router = useRouter();
  const { top: topInset } = useSafeAreaInsets();
  const activeTheme = useAppTheme();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();

  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);
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
        contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
        eyebrow="Happy Circle"
        largeTitle={false}
        safeAreaEdges={['left', 'right']}
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
        contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
        eyebrow="Happy Circle"
        largeTitle={false}
        refresh={refresh}
        safeAreaEdges={['left', 'right']}
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
        contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
        eyebrow="Happy Circle"
        largeTitle={false}
        refresh={refresh}
        safeAreaEdges={['left', 'right']}
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
  const participantCount = settlement.participantDecisions.length;
  const approvedCount = settlement.participantDecisions.filter(
    (participant) => participant.decision === 'approved',
  ).length;
  const approvalSummary = `${approvedCount}/${participantCount} aprobadas`;
  const replacementProposalId = settlement.replacedByProposalId;
  const versionSteps = versionStorySteps(settlement.timeline);
  const cycleColor = activeTheme.colors.cycle;

  return (
    <ScreenShell
      contentContainerStyle={{ paddingTop: topInset + theme.spacing.md }}
      largeTitle={false}
      overlay={
        <Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />
      }
      refresh={refresh}
      safeAreaEdges={['left', 'right']}
      title="Detalle"
      headerVariant="plain"
    >
      {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

      <SurfaceCard
        padding="none"
        style={styles.detailCard}
        underlay={
          <StateAuraLayer size="hero" variant={stateAuraVariantFromTone(presentation.tone)} />
        }
        variant="elevated"
      >
        <View style={styles.detailCardBody}>
          <View style={styles.detailCardHeader}>
            <View style={styles.detailCardTitleBlock}>
              <AppText style={styles.detailCardTitle}>Happy Circle</AppText>
              <AppText style={styles.detailCardMeta}>{approvalSummary}</AppText>
            </View>
            <View style={styles.detailCardHeaderActions}>
              <StatusChip compact label={presentation.label} tone={presentation.tone} />
            </View>
          </View>

          <CircleMovementDetails
            currentUserId={session.userId}
            movements={settlement.movementDetails}
            participants={settlement.participantDecisions}
          />

          <View style={styles.approvalPillsBlock}>
            <ApprovalPills participants={settlement.participantDecisions} />
            <AppText numberOfLines={1} style={styles.detailCardState}>
              {presentation.summary}
            </AppText>
          </View>
        </View>

        {canDecide ? (
          <View style={styles.cardActions}>
            <Pressable
              accessibilityLabel="Rechazar Happy Circle"
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPressIn={busyAction === null ? triggerAppWarningHaptic : undefined}
              onPress={() => {
                Alert.alert(
                  'Seguro quieres rechazar este Happy Circle?',
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
                );
              }}
              style={({ pressed }) => [
                styles.circleActionButton,
                {
                  backgroundColor: `${activeTheme.colors.danger}12`,
                  borderColor: `${activeTheme.colors.danger}2E`,
                  borderWidth: 1,
                },
                pressed ? styles.circleActionButtonPressed : null,
                busyAction !== null ? styles.circleActionButtonDisabled : null,
              ]}
            >
              <Ionicons
                color={activeTheme.colors.danger}
                name={busyAction === 'reject' ? 'hourglass-outline' : 'close'}
                size={20}
              />
              <AppText style={[styles.circleActionLabel, { color: activeTheme.colors.danger }]}>
                {busyAction === 'reject' ? 'Rechazando...' : 'Rechazar'}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityLabel="Aprobar Happy Circle"
              accessibilityRole="button"
              disabled={busyAction !== null}
              onPressIn={busyAction === null ? triggerAppActionHaptic : undefined}
              onPress={() => void handleAction('approve')}
              style={({ pressed }) => [
                styles.circleActionButton,
                {
                  backgroundColor: cycleColor,
                  borderColor: cycleColor,
                  ...activeTheme.shadow.card,
                },
                pressed ? styles.circleActionButtonPressed : null,
                busyAction !== null ? styles.circleActionButtonDisabled : null,
              ]}
            >
              <Ionicons
                color={activeTheme.colors.white}
                name={busyAction === 'approve' ? 'hourglass-outline' : 'checkmark'}
                size={20}
              />
              <AppText style={[styles.circleActionLabel, { color: activeTheme.colors.white }]}>
                {busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </SurfaceCard>

      <View style={styles.versionsSection}>
        <View style={styles.versionsHeader}>
          <View style={styles.versionsTitleBlock}>
            <AppText style={styles.versionsTitle}>Historia del Circle</AppText>
          </View>
          <View style={styles.versionsCountBadge}>
            <AppText style={styles.versionsCountText}>{settlement.timeline.length}</AppText>
          </View>
        </View>
        <View style={styles.versionStoryPanel}>
          <CardTimeline steps={versionSteps} />
        </View>
        {replacementProposalId ? (
          <View style={styles.replacementAction}>
            <PrimaryAction
              color={cycleColor}
              icon="arrow-forward"
              label="Abrir calculo actual"
              onPress={() => {
                triggerAppSelectionHaptic();
                pushRoute(router, `/settlements/${replacementProposalId}`);
              }}
            />
          </View>
        ) : null}
      </View>

      <LoadingOverlay {...actionFeedback.overlayProps} />
    </ScreenShell>
  );
}
