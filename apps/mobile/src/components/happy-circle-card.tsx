import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fragment, useMemo, useState } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import type { ActiveSettlementPreviewDto } from '@happy-circles/application';

import { PrimaryAction } from '@/components/primary-action';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { useApproveSettlementMutation, useRejectSettlementMutation } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';
import { useSession } from '@/providers/session-provider';

const CYCLE_COLOR = transactionCategoryColor('cycle');
const APPROVED_COLOR = theme.colors.success;
const PENDING_COLOR = theme.colors.muted;
const REJECTED_COLOR = theme.colors.warning;

function decisionColor(decision: 'approved' | 'pending' | 'rejected'): string {
  if (decision === 'approved') return APPROVED_COLOR;
  if (decision === 'rejected') return REJECTED_COLOR;
  return PENDING_COLOR;
}

function FaceIcon({ decision, size }: { readonly decision: 'approved' | 'pending' | 'rejected', readonly size: number }) {
  const color = decisionColor(decision);
  const strokeWidth = 1.5;

  if (decision === 'approved') {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Circle cx={12} cy={12} fill="none" r={10} stroke={color} strokeWidth={strokeWidth} />
        <Circle cx={8.5} cy={9.5} fill={color} r={1.5} />
        <Circle cx={15.5} cy={9.5} fill={color} r={1.5} />
        <Path d="M 7 14 Q 12 19 17 14" fill="none" stroke={color} strokeLinecap="round" strokeWidth={strokeWidth} />
      </Svg>
    );
  }

  if (decision === 'rejected') {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Circle cx={12} cy={12} fill="none" r={10} stroke={color} strokeWidth={strokeWidth} />
        <Circle cx={8.5} cy={10} fill={color} r={1.5} />
        <Circle cx={15.5} cy={10} fill={color} r={1.5} />
        <Path d="M 7 17 Q 12 12 17 17" fill="none" stroke={color} strokeLinecap="round" strokeWidth={strokeWidth} />
      </Svg>
    );
  }

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx={12} cy={12} fill="none" r={10} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={8.5} cy={9.5} fill={color} r={1.5} />
      <Circle cx={15.5} cy={9.5} fill={color} r={1.5} />
      <Path d="M 8 15 L 16 15" stroke={color} strokeLinecap="round" strokeWidth={strokeWidth} />
    </Svg>
  );
}

function ParticipantNode({
  decision,
  index,
  label,
  totalCount,
  ringSize,
}: {
  readonly decision: 'approved' | 'pending' | 'rejected';
  readonly index: number;
  readonly label: string;
  readonly totalCount: number;
  readonly ringSize: number;
}) {
  const nodeSize = 40;
  const radius = ringSize / 2;
  const arcRadius = radius - 16;
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / totalCount;
  
  const centerX = radius + arcRadius * Math.cos(angle) - nodeSize / 2;
  const centerY = radius + arcRadius * Math.sin(angle) - nodeSize / 2;

  const labelDistance = arcRadius + 36;
  const labelX = radius + labelDistance * Math.cos(angle);
  const labelY = radius + labelDistance * Math.sin(angle);

  const displayLabel = label.split(/\s+/)[0] ?? label;

  return (
    <Fragment>
      <View
        style={[
          styles.nodeContainer,
          {
            left: centerX,
            top: centerY,
            width: nodeSize,
            height: nodeSize,
          },
        ]}
      >
        <FaceIcon decision={decision} size={nodeSize} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: labelX - 40,
          top: labelY - 10,
          width: 80,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text numberOfLines={1} style={styles.nodeLabel}>
          {displayLabel}
        </Text>
      </View>
    </Fragment>
  );
}

function ApprovalDots({
  approved,
  total,
}: {
  readonly approved: number;
  readonly total: number;
}) {
  const dots: boolean[] = [];

  for (let index = 0; index < total; index += 1) {
    dots.push(index < approved);
  }

  return (
    <View style={styles.dotsRow}>
      {dots.map((filled, index) => (
        <View key={index} style={[styles.dot, filled ? styles.dotFilled : styles.dotEmpty]} />
      ))}
    </View>
  );
}

function CircleArcs({
  decisions,
  ringSize,
}: {
  readonly decisions: readonly { readonly decision: 'approved' | 'pending' | 'rejected' }[];
  readonly ringSize: number;
}) {
  const N = decisions.length;
  if (N < 2) return null;

  const radius = ringSize / 2;
  const arcRadius = radius - 16;
  const strokeWidth = 8;
  const gap = 0.5; // Gap in radians

  return (
    <Svg height={ringSize} style={{ position: 'absolute' }} width={ringSize}>
      {decisions.map((d, i) => {
        const angle1 = -Math.PI / 2 + (2 * Math.PI * i) / N;
        const angle2 = -Math.PI / 2 + (2 * Math.PI * (i + 1)) / N;

        const startAngle = angle1 + gap;
        const endAngle = angle2 - gap;

        if (startAngle >= endAngle) return null;

        const x1 = radius + arcRadius * Math.cos(startAngle);
        const y1 = radius + arcRadius * Math.sin(startAngle);
        const x2 = radius + arcRadius * Math.cos(endAngle);
        const y2 = radius + arcRadius * Math.sin(endAngle);

        const color1 = decisionColor(d.decision);
        const color2 = decisionColor(decisions[(i + 1) % N]!.decision);

        const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
        const path = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${x2} ${y2}`;
        const gradId = `grad-${i}`;

        return (
          <Fragment key={i}>
            <Defs>
              <LinearGradient gradientUnits="userSpaceOnUse" id={gradId} x1={x1} x2={x2} y1={y1} y2={y2}>
                <Stop offset="0%" stopColor={color1} />
                <Stop offset="100%" stopColor={color2} />
              </LinearGradient>
            </Defs>
            <Path d={path} fill="none" stroke={`url(#${gradId})`} strokeLinecap="round" strokeWidth={strokeWidth} />
          </Fragment>
        );
      })}
    </Svg>
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
  const myDecision = proposal.participantDecisions.find((p) => p.userId === session.userId)?.decision;
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
          <Text style={styles.savingsLabel}>
            Ahorra {proposal.savedMovementsCount} movimiento
            {proposal.savedMovementsCount === 1 ? '' : 's'}
          </Text>

          <View style={styles.approvalBlock}>
            <ApprovalDots approved={approvedCount} total={proposal.participantCount} />
            <Text style={styles.approvalText}>
              {approvedCount} de {proposal.participantCount} aprobaciones
            </Text>
          </View>


        </View>

        {/* Right: Circle ring */}
        <View style={[styles.ringContainer, { width: ringSize, height: ringSize }]}>
          <CircleArcs decisions={orderedDecisions} ringSize={ringSize} />

          {/* Participant nodes */}
          {orderedDecisions.map((participant, index) => (
            <ParticipantNode
              decision={participant.decision}
              index={index}
              key={participant.userId}
              label={participant.label}
              ringSize={ringSize}
              totalCount={orderedDecisions.length}
            />
          ))}
        </View>
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
  savingsLabel: {
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
  dotFilled: {
    backgroundColor: CYCLE_COLOR,
  },
  dotEmpty: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  approvalText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },

  ringContainer: {
    position: 'relative',
  },
  nodeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },

  nodeLabel: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    maxWidth: 56,
    textAlign: 'center',
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
