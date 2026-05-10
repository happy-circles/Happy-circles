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
  readonly variant?: 'full' | 'compact';
}

export function HappyCircleCard({ proposal, variant = 'full' }: HappyCircleCardProps) {
  const router = useRouter();
  const session = useSession();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const actionFeedback = useActionFeedbackOverlay();
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);

  const ringSize = variant === 'full' ? 168 : 118;
  const approvedCount = proposal.participantCount - proposal.approvalsPending;
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
          message: 'Decision guardada',
          title: 'Listo',
          variant: 'success',
        });
      } else {
        await rejectSettlement.mutateAsync(proposal.proposalId);
        triggerAppWarningHaptic();
        showGlobalFeedback({
          message: 'No se aplicara ningun movimiento desde este Circle.',
          title: 'Happy Circle no aprobado',
          tone: 'neutral',
        });
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
      style={[styles.card, variant === 'compact' ? styles.cardCompact : null]}
      variant="elevated"
    >
      <Link href={`/settlements/${proposal.proposalId}` as Href} asChild>
        <Pressable
          style={({ pressed }) => [
            styles.cardPressable,
            variant === 'compact' ? styles.cardPressableCompact : null,
            pressed ? styles.cardPressed : null,
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderCopy}>
              <View style={styles.brandRow}>
                <Ionicons color={CYCLE_COLOR} name="happy-outline" size={18} />
                <AppText style={styles.brandLabel}>Happy Circle</AppText>
              </View>
              <StatusChip
                compact
                label={presentation.label}
                tone={presentation.tone}
              />
            </View>
          </View>

          <View style={[styles.body, variant === 'compact' ? styles.bodyCompact : null]}>
            <View style={styles.metricsColumn}>
              <View style={styles.metricBlock}>
                <AppText style={styles.metricEyebrow}>Tu valor a resolver</AppText>
                <AppText
                  style={[
                    styles.metricAmount,
                    variant === 'compact' ? styles.metricAmountCompact : null,
                  ]}
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
        </Pressable>
      </Link>

      {canDecide ? (
        <View style={styles.actionsFooter}>
          <PrimaryAction
            color={CYCLE_COLOR}
            compact
            disabled={busyAction !== null}
            fullWidth={false}
            icon="checkmark"
            label={busyAction === 'approve' ? 'Aprobando...' : 'Aprobar'}
            loading={busyAction === 'approve'}
            onPress={() => void handleAction('approve')}
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
            variant="ghost"
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
  cardPressable: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  cardPressableCompact: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
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
});
