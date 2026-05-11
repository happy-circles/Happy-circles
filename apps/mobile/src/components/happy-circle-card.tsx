import { Link, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { useMemo, useState } from 'react';

import type { ActiveSettlementPreviewDto } from '@happy-circles/application';

import { HappyCircleRing, happyCircleDecisionColor } from '@/components/happy-circle-ring';
import { LoadingOverlay } from '@/components/loading-overlay';
import { PrimaryAction } from '@/components/primary-action';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import {
  triggerAppActionHaptic,
  triggerAppErrorHaptic,
  triggerAppSelectionHaptic,
  triggerAppWarningHaptic,
} from '@/lib/app-haptics';
import { resolveHappyCirclePresentation } from '@/lib/happy-circle-presentation';
import { showBlockedActionAlert, useActionFeedbackOverlay } from '@/lib/action-feedback';
import { showGlobalFeedback } from '@/lib/global-feedback';
import { useApproveSettlementMutation, useRejectSettlementMutation } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSession } from '@/providers/session-provider';
import { AppText } from '@/components/app-text';

const CYCLE_COLOR = transactionCategoryColor('cycle');

function ApprovalDots({
  decisions,
}: {
  readonly decisions: readonly { readonly decision: 'approved' | 'pending' | 'rejected' }[];
}) {
  return (
    <View style={styles.dotsRow}>
      {decisions.map((participant, index) => (
        <View
          key={index}
          style={[styles.dot, { backgroundColor: happyCircleDecisionColor(participant.decision) }]}
        />
      ))}
    </View>
  );
}

export interface HappyCircleCardProps {
  readonly proposal: ActiveSettlementPreviewDto;
  readonly variant?: 'full' | 'compact' | 'showcase';
}

export function HappyCircleCard({ proposal, variant = 'full' }: HappyCircleCardProps) {
  const router = useRouter();
  const session = useSession();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const actionFeedback = useActionFeedbackOverlay();
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);

  const isCompact = variant === 'compact';
  const isShowcase = variant === 'showcase';
  const ringSize = isShowcase ? 142 : isCompact ? 118 : 168;
  const approvedCount = proposal.participantCount - proposal.approvalsPending;
  const participantCount = Math.max(proposal.participantCount, 1);
  const approvalRatio = Math.min(Math.max(approvedCount / participantCount, 0), 1);
  const optimizedMovementCount = Math.max(0, proposal.movementCount);
  const originalMovementCount = Math.max(
    optimizedMovementCount,
    optimizedMovementCount + proposal.savedMovementsCount,
  );
  const myDecision = proposal.participantDecisions.find(
    (p) => p.userId === session.userId,
  )?.decision;
  const presentation = resolveHappyCirclePresentation({
    approvalsPending: proposal.approvalsPending,
    myDecision,
    status: proposal.status,
  });
  const canDecide = presentation.actionability === 'can_decide';

  const orderedDecisions = useMemo(() => {
    const arr = [...proposal.participantDecisions];
    const myIndex = arr.findIndex((p) => p.userId === session.userId);
    if (myIndex > 0) {
      return [...arr.slice(myIndex), ...arr.slice(0, myIndex)];
    }
    return arr;
  }, [proposal.participantDecisions, session.userId]);
  const participantLabel = orderedDecisions
    .map((participant) =>
      participant.userId === session.userId
        ? 'Tú'
        : (participant.label.trim().split(/\s+/)[0] ?? participant.label),
    )
    .slice(0, 4)
    .join(' · ');

  async function handleAction(action: 'approve' | 'reject') {
    triggerAppActionHaptic();
    setBusyAction(action);
    actionFeedback.clear();

    try {
      if (action === 'approve') {
        await actionFeedback.runBlockingAction('approveSettlement', () =>
          approveSettlement.mutateAsync(proposal.proposalId),
        );
        await actionFeedback.showResult({
          message: 'Decisión guardada',
          title: 'Listo',
          variant: 'success',
        });
      } else {
        await rejectSettlement.mutateAsync(proposal.proposalId);
        triggerAppWarningHaptic();
        showGlobalFeedback({
          message: 'No se aplicará ningún movimiento desde este Circle.',
          title: 'Happy Circle no aprobado',
          tone: 'neutral',
        });
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
        Alert.alert('No se pudo completar', nextMessage);
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SurfaceCard
      padding="none"
      style={[
        styles.card,
        isCompact ? styles.cardCompact : null,
        isShowcase ? styles.cardShowcase : null,
      ]}
      variant="elevated"
    >
      <Link href={`/settlements/${proposal.proposalId}` as Href} asChild>
        <Pressable
          style={({ pressed }) => [
            styles.cardPressable,
            isCompact ? styles.cardPressableCompact : null,
            isShowcase ? styles.cardPressableShowcase : null,
            pressed ? styles.cardPressed : null,
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderCopy}>
              {isShowcase ? null : (
                <View style={styles.brandRow}>
                  <Ionicons color={CYCLE_COLOR} name="happy-outline" size={18} />
                  <AppText style={styles.brandLabel}>Happy Circle</AppText>
                </View>
              )}
              <StatusChip
                compact
                label={presentation.label}
                tone={presentation.tone}
              />
            </View>
          </View>

          {isShowcase ? (
            <View style={styles.showcaseBody}>
              <View style={styles.showcaseSummary}>
                <AppText numberOfLines={1} style={styles.showcaseParticipants}>
                  {participantLabel || proposal.title}
                </AppText>
                <AppText adjustsFontSizeToFit numberOfLines={1} style={styles.showcaseAmount}>
                  {formatCop(proposal.personalAmountMinor)}
                </AppText>
                <View style={styles.movementPill}>
                  <Ionicons color={CYCLE_COLOR} name="swap-horizontal-outline" size={15} />
                  <AppText style={styles.movementPillText}>
                    {originalMovementCount} movs {'->'} {optimizedMovementCount}
                  </AppText>
                </View>
              </View>

              <HappyCircleRing
                decisions={orderedDecisions}
                ringSize={ringSize}
                style={styles.showcaseRing}
              />

              <View style={styles.showcaseProgressBlock}>
                <View style={styles.showcaseProgressMeta}>
                  <AppText style={styles.approvalSummary}>
                    {approvedCount}/{proposal.participantCount} aprobadas
                  </AppText>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${approvalRatio * 100}%` }]} />
                </View>
              </View>

              <View style={styles.detailCta}>
                <AppText style={styles.detailCtaText}>Ver detalle</AppText>
                <Ionicons color={CYCLE_COLOR} name="chevron-forward" size={17} />
              </View>
            </View>
          ) : (
            <View style={[styles.body, isCompact ? styles.bodyCompact : null]}>
              <View style={styles.metricsColumn}>
                <View style={styles.metricBlock}>
                  <AppText style={styles.metricEyebrow}>Tu valor a resolver</AppText>
                  <AppText
                    style={[styles.metricAmount, isCompact ? styles.metricAmountCompact : null]}
                  >
                    {formatCop(proposal.personalAmountMinor)}
                  </AppText>
                  {proposal.personalAmountMinor !== proposal.totalAmountMinor ? (
                    <AppText style={styles.metricSecondary}>
                      Total del Circle: {formatCop(proposal.totalAmountMinor)}
                    </AppText>
                  ) : null}
                </View>
                <AppText style={styles.approvalSummary}>
                  {approvedCount}/{proposal.participantCount} aprobadas
                </AppText>
                <AppText numberOfLines={2} style={styles.stateSummary}>
                  {presentation.summary}
                </AppText>

                <View style={styles.approvalBlock}>
                  <ApprovalDots decisions={orderedDecisions} />
                </View>
              </View>

              <HappyCircleRing decisions={orderedDecisions} ringSize={ringSize} />
            </View>
          )}
        </Pressable>
      </Link>

      {canDecide ? (
        <View style={[styles.actionsFooter, isShowcase ? styles.actionsFooterShowcase : null]}>
          <PrimaryAction
            color={CYCLE_COLOR}
            compact
            disabled={busyAction !== null}
            fullWidth={false}
            icon="checkmark"
            label={busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
            loading={busyAction === 'approve'}
            onPress={() => void handleAction('approve')}
            style={styles.actionButton}
          />
          <PrimaryAction
            compact
            disabled={busyAction !== null}
            fullWidth={false}
            icon="close"
            label={busyAction === 'reject' ? 'Rechazando...' : 'No aprobar'}
            loading={busyAction === 'reject'}
            onPress={() => {
              triggerAppSelectionHaptic();
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
            }}
            variant="ghost"
            style={styles.actionButton}
          />
        </View>
      ) : null}
      <LoadingOverlay {...actionFeedback.overlayProps} />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftColor: CYCLE_COLOR,
    borderLeftWidth: 3,
    overflow: 'visible',
  },
  cardCompact: {
    borderRadius: theme.radius.medium,
  },
  cardShowcase: {
    borderLeftWidth: 0,
    borderRadius: theme.radius.large,
    minHeight: 360,
  },
  cardPressable: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  cardPressableCompact: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  cardPressableShowcase: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  cardPressed: {
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'flex-start',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  brandLabel: {
    color: CYCLE_COLOR,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  body: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  bodyCompact: {
    alignItems: 'flex-start',
  },
  showcaseBody: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  showcaseSummary: {
    alignItems: 'center',
    gap: 3,
    width: '100%',
  },
  showcaseParticipants: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    lineHeight: 24,
    maxWidth: '100%',
    textAlign: 'center',
  },
  showcaseAmount: {
    color: theme.colors.primary,
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 39,
    maxWidth: '100%',
    textAlign: 'center',
  },
  movementPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  movementPillText: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
  },
  showcaseRing: {
    marginRight: 0,
  },
  showcaseProgressBlock: {
    gap: 7,
    width: '100%',
  },
  showcaseProgressMeta: {
    alignItems: 'center',
  },
  progressTrack: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.pill,
    height: 7,
    maxWidth: 280,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    backgroundColor: CYCLE_COLOR,
    borderRadius: theme.radius.pill,
    height: '100%',
  },
  detailCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingTop: theme.spacing.xs,
  },
  detailCtaText: {
    color: CYCLE_COLOR,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  metricsColumn: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  metricBlock: {
    gap: 2,
  },
  metricEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  metricAmount: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  metricAmountCompact: {
    fontSize: theme.typography.title3,
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  metricSecondary: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  approvalSummary: {
    color: theme.colors.success,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  approvalBlock: {
    gap: 4,
  },
  stateSummary: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    borderRadius: 999,
    height: 6,
    width: 24,
  },

  actionsFooter: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  actionsFooterShowcase: {
    paddingTop: theme.spacing.sm,
  },
  actionButton: {
    flex: 1,
    justifyContent: 'center',
  },
});
