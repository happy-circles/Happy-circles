import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardTimeline } from '@/components/card-shell';
import { CircleActionFeedbackOverlay } from '@/components/circle-action-feedback-overlay';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { standardHappyCircleParticipants } from '@/components/happy-circle-ring';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { Snackbar } from '@/components/snackbar';
import { StatusChip } from '@/components/status-chip';
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
  markNotificationItemsViewed,
  notificationItemCanAlert,
  notificationViewKeyForItem,
  useAppSnapshot,
  useApproveSettlementMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { settlementDetailScreenStyles as styles } from './settlement-detail-screen-styles';
import {
  ApprovalDecisionList,
  ApprovalPills,
  CircleMovementDetails,
  approvalProgressText,
  settlementStoryHeadline,
  settlementStoryText,
} from './settlement-detail-story';
import { versionStorySteps } from './settlement-version-story';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useHappyReward } from '@/providers/happy-reward-provider';
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
  const [rewardClaiming, setRewardClaiming] = useState(false);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const actionFeedback = useActionFeedbackOverlay();
  const { claimReward, getRewardForSettlement } = useHappyReward();
  const viewedProposalIdRef = useRef<string | null>(null);
  const viewedNotificationKeyRef = useRef<string | null>(null);

  const settlement = snapshotQuery.data?.settlementsById[proposalId] ?? null;
  const pendingSettlementNotificationItem =
    snapshotQuery.data?.activitySections
      .find((section) => section.key === 'pending')
      ?.items.find(
        (item) =>
          item.kind === 'settlement_proposal' &&
          (item.id === proposalId || item.originSettlementProposalId === proposalId),
      ) ?? null;

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

  useEffect(() => {
    if (
      !session.userId ||
      !pendingSettlementNotificationItem ||
      !notificationItemCanAlert(pendingSettlementNotificationItem)
    ) {
      return;
    }

    const notificationKey = notificationViewKeyForItem(pendingSettlementNotificationItem);
    if (viewedNotificationKeyRef.current === notificationKey) {
      return;
    }

    viewedNotificationKeyRef.current = notificationKey;
    void markNotificationItemsViewed(session.userId, [pendingSettlementNotificationItem]);
  }, [pendingSettlementNotificationItem, session.userId]);

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
            message: 'Hay un cálculo nuevo.',
            tone: 'warning',
          });
        } else if (nextStatus === 'executed') {
          const nextAutoCycleStatus = readNestedStatus(response, 'nextAutoCycleJob');
          await actionFeedback.showResult({
            message:
              nextAutoCycleStatus === 'queued'
                ? 'Tesoro listo y otro Circle en camino'
                : 'Tesoro listo para reclamar',
            title: 'Circle completado',
            variant: 'success',
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
          description="Confirma que sigas siendo participante o vuelve a abrir la propuesta desde tu historial."
          title="Propuesta no visible"
        />
      </ScreenShell>
    );
  }

  const myDecision =
    settlement.participantDecisions.find((participant) => participant.userId === session.userId)
      ?.decision ?? null;
  const circleFeedbackParticipants = standardHappyCircleParticipants(
    settlement.participantDecisions,
    session.userId,
    myDecision ?? 'pending',
  );
  const circleFeedbackAmountLabel = formatCop(settlement.personalAmountMinor);
  const canDecide = settlement.status === 'pending_approvals' && myDecision === 'pending';
  const approvalsPending = settlement.approvalsPending;
  const presentation = resolveHappyCirclePresentation({
    approvalsPending,
    myDecision,
    status: settlement.status,
  });
  const participantCount = settlement.participantCount;
  const approvedCount = settlement.approvedCount;
  const approvalSummary =
    participantCount > 0 ? `${approvedCount}/${participantCount} aprobaron` : 'Sin aprobaciones';
  const replacementProposalId = settlement.replacedByProposalId;
  const versionSteps = versionStorySteps(settlement.timeline);
  const cycleColor = activeTheme.colors.cycle;
  const cycleForegroundColor = activeTheme.colors.onPrimary;
  const storyText = settlementStoryText(settlement.status, approvalsPending);
  const storyHeadline = settlementStoryHeadline({
    approvalsPending,
    canDecide,
    status: settlement.status,
  });
  const approvalText = approvalProgressText({
    approvalsPending,
    participantCount,
    status: settlement.status,
  });
  const claimableReward = getRewardForSettlement(proposalId);

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

      <View style={styles.detailStory}>
        <View style={styles.statusStory}>
          <View style={styles.statusStoryTop}>
            <AppText style={[styles.statusEyebrow, { color: cycleColor }]}>Happy Circle</AppText>
            <StatusChip compact label={presentation.label} tone={presentation.tone} />
          </View>
          <AppText style={[styles.statusHeadline, { color: activeTheme.colors.text }]}>
            {storyHeadline}
          </AppText>
          <AppText style={[styles.statusBody, { color: activeTheme.colors.textMuted }]}>
            {storyText}
          </AppText>
        </View>

        {claimableReward ? (
          <View
            style={[
              styles.rewardClaimPanel,
              {
                backgroundColor: activeTheme.colors.treasureSoft,
                borderColor: activeTheme.colors.treasure,
              },
            ]}
          >
            <View style={styles.rewardClaimCopy}>
              <View style={styles.rewardClaimHeader}>
                <Ionicons color={activeTheme.colors.treasure} name="gift-outline" size={18} />
                <AppText
                  style={[styles.rewardClaimEyebrow, { color: activeTheme.colors.treasure }]}
                >
                  Tesoro listo
                </AppText>
              </View>
              <AppText style={[styles.rewardClaimTitle, { color: activeTheme.colors.text }]}>
                Reclama los Happy puntos de este Circle
              </AppText>
              <AppText style={[styles.rewardClaimBody, { color: activeTheme.colors.textMuted }]}>
                La animacion queda ligada a este detalle, para que sepas exactamente de donde viene.
              </AppText>
            </View>
            <PrimaryAction
              color={activeTheme.colors.treasure}
              icon="happy"
              label={rewardClaiming ? 'Reclamando...' : `Reclamar +${claimableReward.scoreDelta}`}
              loading={rewardClaiming}
              onPress={() => {
                triggerAppActionHaptic();
                setRewardClaiming(true);
                void claimReward(claimableReward)
                  .catch((error) => {
                    triggerAppErrorHaptic();
                    showSnackbar(
                      error instanceof Error ? error.message : 'No se pudo reclamar el tesoro.',
                      'danger',
                    );
                  })
                  .finally(() => {
                    setRewardClaiming(false);
                  });
              }}
            />
          </View>
        ) : null}

        <View style={styles.storySection}>
          <View style={styles.storySectionHeader}>
            <AppText style={[styles.storyEyebrow, { color: cycleColor }]}>Tu impacto</AppText>
            <AppText style={[styles.storySectionTitle, { color: activeTheme.colors.text }]}>
              Lo que cambia para ti
            </AppText>
          </View>
          <CircleMovementDetails
            currentUserId={session.userId}
            movements={settlement.movementDetails}
            onOpenMovement={(counterpartyUserId) => {
              triggerAppSelectionHaptic();
              pushRoute(
                router,
                `/person/${encodeURIComponent(counterpartyUserId)}?panel=history&focus=${encodeURIComponent(
                  settlement.id,
                )}`,
              );
            }}
            participants={settlement.participantDecisions}
            status={settlement.status}
          />
        </View>

        <View style={styles.storySection}>
          <View style={styles.storySectionHeader}>
            <AppText style={[styles.storyEyebrow, { color: cycleColor }]}>Aprobaciones</AppText>
            <AppText style={[styles.storySectionTitle, { color: activeTheme.colors.text }]}>
              {approvalSummary}
            </AppText>
            {approvalText ? (
              <AppText style={[styles.storySectionBody, { color: activeTheme.colors.textMuted }]}>
                {approvalText}
              </AppText>
            ) : null}
          </View>
          <View style={styles.approvalPillsBlock}>
            <ApprovalPills participants={settlement.participantDecisions} />
            <ApprovalDecisionList
              currentUserId={session.userId}
              participants={settlement.participantDecisions}
            />
          </View>
        </View>

        {canDecide ? (
          <View style={styles.actionStory}>
            <AppText style={[styles.actionHint, { color: activeTheme.colors.textMuted }]}>
              Tu aprobación define si este cálculo se aplica o queda cancelado para todos.
            </AppText>
            <View style={styles.cardActions}>
              <Pressable
                accessibilityLabel="Rechazar Happy Circle"
                accessibilityRole="button"
                disabled={busyAction !== null}
                onPressIn={busyAction === null ? triggerAppWarningHaptic : undefined}
                onPress={() => {
                  Alert.alert('Rechazar Circle?', 'No se aplicaran estos movimientos.', [
                    {
                      text: 'Volver',
                      style: 'cancel',
                    },
                    {
                      text: 'Rechazar',
                      style: 'destructive',
                      onPress: () => void handleAction('reject'),
                    },
                  ]);
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
                  color={cycleForegroundColor}
                  name={busyAction === 'approve' ? 'hourglass-outline' : 'checkmark'}
                  size={20}
                />
                <AppText style={[styles.circleActionLabel, { color: cycleForegroundColor }]}>
                  {busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.versionsSection}>
        <View style={styles.versionsHeader}>
          <View style={styles.versionsTitleBlock}>
            <AppText style={[styles.versionsTitle, { color: activeTheme.colors.text }]}>
              Cómo llegó aquí
            </AppText>
            <AppText style={[styles.versionsSubtitle, { color: activeTheme.colors.textMuted }]}>
              Versiones y resultado de cada cálculo.
            </AppText>
          </View>
          <View
            style={[
              styles.versionsCountBadge,
              {
                backgroundColor: activeTheme.colors.surfaceSoft,
                borderColor: activeTheme.colors.hairline,
              },
            ]}
          >
            <AppText style={[styles.versionsCountText, { color: activeTheme.colors.text }]}>
              {settlement.timeline.length}
            </AppText>
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
              label="Abrir cálculo actual"
              onPress={() => {
                triggerAppSelectionHaptic();
                pushRoute(router, `/settlements/${replacementProposalId}`);
              }}
            />
          </View>
        ) : null}
      </View>

      <CircleActionFeedbackOverlay
        action="approve"
        amountLabel={circleFeedbackAmountLabel}
        message={actionFeedback.overlayProps.message}
        participants={circleFeedbackParticipants}
        title={actionFeedback.overlayProps.title}
        variant={actionFeedback.overlayProps.variant}
        visible={actionFeedback.overlayProps.visible && busyAction === 'approve'}
      />
    </ScreenShell>
  );
}
