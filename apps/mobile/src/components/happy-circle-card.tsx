import type { Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { ActiveSettlementPreviewDto } from '@happy-circles/application';

import { PrimaryAction } from '@/components/primary-action';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';
import { transactionCategoryColor } from '@/lib/transaction-categories';

const CYCLE_COLOR = transactionCategoryColor('cycle');
const APPROVED_COLOR = '#0f8a5f';
const PENDING_COLOR = '#a35f19';
const REJECTED_COLOR = '#b24338';

const AVATAR_RING_COLORS = [
  '#c026d3',
  '#047857',
  '#2563eb',
  '#334155',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
];

function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toLocaleUpperCase('es-CO');
  }

  return (parts[0]?.slice(0, 2) ?? '??').toLocaleUpperCase('es-CO');
}

function avatarColor(userId: string, label: string): string {
  const source = `${userId}:${label}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return AVATAR_RING_COLORS[hash % AVATAR_RING_COLORS.length] ?? theme.colors.primary;
}

function decisionColor(decision: 'approved' | 'pending' | 'rejected'): string {
  if (decision === 'approved') {
    return APPROVED_COLOR;
  }

  if (decision === 'rejected') {
    return REJECTED_COLOR;
  }

  return PENDING_COLOR;
}

function decisionIcon(decision: 'approved' | 'pending' | 'rejected'): keyof typeof Ionicons.glyphMap {
  if (decision === 'approved') {
    return 'checkmark-circle';
  }

  if (decision === 'rejected') {
    return 'close-circle';
  }

  return 'ellipse-outline';
}

function ParticipantNode({
  decision,
  index,
  label,
  totalCount,
  ringSize,
  userId,
}: {
  readonly decision: 'approved' | 'pending' | 'rejected';
  readonly index: number;
  readonly label: string;
  readonly totalCount: number;
  readonly ringSize: number;
  readonly userId: string;
}) {
  const nodeSize = 44;
  const radius = ringSize / 2;
  // Start from top (-90deg), distribute evenly
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / totalCount;
  const centerX = radius + radius * Math.cos(angle) - nodeSize / 2;
  const centerY = radius + radius * Math.sin(angle) - nodeSize / 2;
  const borderColor = decisionColor(decision);

  return (
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
      <View style={[styles.nodeAvatar, { borderColor, backgroundColor: avatarColor(userId, label) }]}>
        <Text style={styles.nodeInitials}>{initialsOf(label)}</Text>
      </View>
      <View style={[styles.nodeStatusBadge, { backgroundColor: borderColor }]}>
        <Ionicons color={theme.colors.white} name={decisionIcon(decision)} size={12} />
      </View>
      <Text numberOfLines={1} style={styles.nodeLabel}>
        {label.split(/\s+/)[0] ?? label}
      </Text>
    </View>
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
        <View
          key={index}
          style={[styles.dot, filled ? styles.dotFilled : styles.dotEmpty]}
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
  const ringSize = variant === 'full' ? 180 : 150;
  const approvedCount = proposal.participantCount - proposal.approvalsPending;

  return (
    <SurfaceCard padding="lg" style={styles.card} variant="elevated">
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderCopy}>
          <View style={styles.brandRow}>
            <Ionicons color={CYCLE_COLOR} name="happy-outline" size={18} />
            <Text style={styles.brandLabel}>Happy Circle</Text>
          </View>
          <StatusChip
            compact
            label={proposal.status === 'approved' ? 'Listo' : 'Propuesta en curso'}
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

          <View style={styles.visibilityHint}>
            <Ionicons color={theme.colors.muted} name="eye-off-outline" size={13} />
            <Text style={styles.visibilityText}>
              Solo ves a quien le debe{'\n'}y a quien debes
            </Text>
          </View>
        </View>

        {/* Right: Circle ring */}
        <View style={[styles.ringContainer, { width: ringSize, height: ringSize }]}>
          {/* Arc ring background */}
          <View
            style={[
              styles.ringCircle,
              {
                width: ringSize - 16,
                height: ringSize - 16,
                borderRadius: (ringSize - 16) / 2,
                top: 8,
                left: 8,
              },
            ]}
          />

          {/* Participant nodes */}
          {proposal.participantDecisions.map((participant, index) => (
            <ParticipantNode
              decision={participant.decision}
              index={index}
              key={participant.userId}
              label={participant.label}
              ringSize={ringSize}
              totalCount={proposal.participantDecisions.length}
              userId={participant.userId}
            />
          ))}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>Mismo saldo, menos movimientos.</Text>
          <Text style={styles.footerDetail}>
            La propuesta reduce pagos sin cambiar tu balance.
          </Text>
        </View>
        <PrimaryAction
          href={`/settlements/${proposal.proposalId}` as Href}
          label="Ver propuesta"
          variant="secondary"
        />
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftColor: CYCLE_COLOR,
    borderLeftWidth: 3,
    gap: theme.spacing.md,
    overflow: 'visible',
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
    justifyContent: 'space-between',
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
    color: APPROVED_COLOR,
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
    height: 8,
    width: 8,
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
  visibilityHint: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  visibilityText: {
    color: theme.colors.muted,
    fontSize: 11,
    lineHeight: 14,
  },
  ringContainer: {
    position: 'relative',
  },
  ringCircle: {
    borderColor: theme.colors.surfaceSoft,
    borderWidth: 2.5,
    position: 'absolute',
  },
  nodeContainer: {
    alignItems: 'center',
    gap: 2,
    position: 'absolute',
  },
  nodeAvatar: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2.5,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  nodeInitials: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  nodeStatusBadge: {
    alignItems: 'center',
    borderColor: theme.colors.white,
    borderRadius: 999,
    borderWidth: 1.5,
    height: 16,
    justifyContent: 'center',
    marginTop: -10,
    width: 16,
  },
  nodeLabel: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    maxWidth: 56,
    textAlign: 'center',
  },
  footer: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  footerCopy: {
    gap: 2,
  },
  footerTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  footerDetail: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
});
