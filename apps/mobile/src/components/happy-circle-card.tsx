import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMemo, useState } from 'react';

import type { ActiveSettlementPreviewDto } from '@happy-circles/application';

import { HappyCircleRing, happyCircleDecisionColor } from '@/components/happy-circle-ring';
import { PrimaryAction } from '@/components/primary-action';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { useApproveSettlementMutation, useRejectSettlementMutation } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSession } from '@/providers/session-provider';

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
  const session = useSession();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);

  const ringSize = variant === 'full' ? 180 : 150;
  const approvedCount = proposal.participantCount - proposal.approvalsPending;
  const myDecision = proposal.participantDecisions.find(
    (p) => p.userId === session.userId,
  )?.decision;
  const canDecide = proposal.status === 'pending_approvals' && myDecision === 'pending';

  const orderedDecisions = useMemo(() => {
    const arr = [...proposal.participantDecisions];
    const myIndex = arr.findIndex((p) => p.userId === session.userId);
    if (myIndex > 0) {
      return [...arr.slice(myIndex), ...arr.slice(0, myIndex)];
    }
    return arr;
  }, [proposal.participantDecisions, session.userId]);

  async function handleAction(action: 'approve' | 'reject') {
    setBusyAction(action);
    try {
      if (action === 'approve') {
        await approveSettlement.mutateAsync(proposal.proposalId);
      } else {
        await rejectSettlement.mutateAsync(proposal.proposalId);
      }
    } catch {
      // Errors handled globally or ignored for this simplified inline view
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SurfaceCard padding="none" style={styles.card} variant="elevated">
      <Link href={`/settlements/${proposal.proposalId}` as Href} asChild>
        <Pressable style={styles.cardPressable}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderCopy}>
              <View style={styles.brandRow}>
                <Ionicons color={CYCLE_COLOR} name="happy-outline" size={18} />
                <Text style={styles.brandLabel}>Happy Circle</Text>
              </View>
              <StatusChip
                compact
                label={proposal.status === 'approved' ? 'Listo' : 'En curso'}
                tone={proposal.status === 'approved' ? 'cycle' : 'warning'}
              />
            </View>
          </View>

          <View style={styles.body}>
            {/* Left: Metrics */}
            <View style={styles.metricsColumn}>
              <View style={styles.metricBlock}>
                <Text style={styles.metricEyebrow}>Valor a resolver</Text>
                <Text style={styles.metricAmount}>{formatCop(proposal.totalAmountMinor)}</Text>
              </View>
              <Text style={styles.approvalSummary}>
                {approvedCount}/{proposal.participantCount} aprobadas
              </Text>

              <View style={styles.approvalBlock}>
                <ApprovalDots decisions={orderedDecisions} />
              </View>
            </View>

            {/* Right: Circle ring */}
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
            label={busyAction === 'approve' ? 'Aceptando...' : 'Aceptar'}
            loading={busyAction === 'approve'}
            onPress={() => void handleAction('approve')}
          />
          <PrimaryAction
            compact
            disabled={busyAction !== null}
            fullWidth={false}
            icon="close"
            label={busyAction === 'reject' ? 'Rechazando...' : 'Rechazar'}
            loading={busyAction === 'reject'}
            onPress={() => void handleAction('reject')}
            variant="ghost"
          />
        </View>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftColor: CYCLE_COLOR,
    borderLeftWidth: 3,
    overflow: 'visible',
  },
  cardPressable: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
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
  approvalSummary: {
    color: theme.colors.success,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  approvalBlock: {
    gap: 4,
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
