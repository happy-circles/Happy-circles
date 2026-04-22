import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
import { StatusChip } from './status-chip';
import { SurfaceCard } from './surface-card';

export type HistoryCaseTone = 'positive' | 'negative' | 'neutral' | 'danger' | 'cycle';

export interface HistoryCaseStepViewModel {
  readonly id: string;
  readonly title: string;
  readonly impact?: string | null;
  readonly meta?: string | null;
  readonly amountLabel?: string | null;
  readonly tone: HistoryCaseTone;
}

export interface HistoryCaseCardProps {
  readonly eyebrow?: string | null;
  readonly category?: string | null;
  readonly title: string;
  readonly impact?: string | null;
  readonly meta?: string | null;
  readonly statusLabel: string;
  readonly statusTone?: 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle';
  readonly tone: HistoryCaseTone;
  readonly isCycleSnippet?: boolean;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly steps: readonly HistoryCaseStepViewModel[];
}

export function HistoryCaseCard({
  eyebrow,
  category,
  title,
  impact,
  meta,
  statusLabel,
  statusTone = 'neutral',
  tone,
  isCycleSnippet = false,
  isExpanded,
  onToggle,
  steps,
}: HistoryCaseCardProps) {
  const categoryIcon = transactionCategoryIcon(category) as keyof typeof Ionicons.glyphMap;

  return (
    <SurfaceCard
      padding="md"
      style={[
        styles.card,
        tone === 'positive' ? styles.cardPositive : null,
        tone === 'negative' ? styles.cardNegative : null,
        tone === 'neutral' ? styles.cardNeutral : null,
        tone === 'danger' ? styles.cardDanger : null,
        tone === 'cycle' ? styles.cardCycle : null,
        isCycleSnippet ? styles.cycleSnippet : null,
        tone === 'danger' ? styles.rejectedSnippet : null,
      ]}
      variant={isCycleSnippet ? 'muted' : 'default'}
    >
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.header, pressed ? styles.headerPressed : null]}>
        <View style={styles.text}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <View style={styles.titleLine}>
            {isCycleSnippet ? (
              <View style={styles.cycleIconBadge}>
                <Ionicons
                  color={transactionCategoryColor('cycle')}
                  name="happy-outline"
                  size={14}
                />
              </View>
            ) : category ? (
              <View
                style={[
                  styles.categoryIconBadge,
                  { backgroundColor: transactionCategoryBackgroundColor(category) },
                ]}
              >
                <Ionicons color={transactionCategoryColor(category)} name={categoryIcon} size={14} />
              </View>
            ) : null}
            <Text style={styles.title}>{title}</Text>
          </View>
          {impact ? <Text style={[styles.impact, toneStyles[tone]]}>{impact}</Text> : null}
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        <View style={styles.headerMeta}>
          <StatusChip label={statusLabel} tone={statusTone} />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>{isExpanded ? 'Ocultar' : 'Ver detalle'}</Text>
            <Ionicons
              color={theme.colors.textMuted}
              name={isExpanded ? 'chevron-up' : 'chevron-forward'}
              size={16}
            />
          </View>
        </View>
      </Pressable>

      {isExpanded ? (
        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.id} style={styles.stepRow}>
              <View style={styles.stepRail}>
                <View
                  style={[
                    styles.stepMarker,
                    step.tone === 'positive' ? styles.stepMarkerPositive : null,
                    step.tone === 'negative' ? styles.stepMarkerNegative : null,
                    step.tone === 'neutral' ? styles.stepMarkerNeutral : null,
                    step.tone === 'danger' ? styles.stepMarkerDanger : null,
                    step.tone === 'cycle' ? styles.stepMarkerCycle : null,
                  ]}
                />
                {index < steps.length - 1 ? <View style={styles.stepLine} /> : null}
              </View>
              <View style={styles.stepBody}>
                <View style={styles.stepTop}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  {step.amountLabel ? (
                    <Text style={[styles.stepAmount, toneStyles[step.tone]]}>
                      {step.amountLabel}
                    </Text>
                  ) : null}
                </View>
                {step.impact ? <Text style={[styles.stepImpact, toneStyles[step.tone]]}>{step.impact}</Text> : null}
                {step.meta ? <Text style={styles.stepMeta}>{step.meta}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

const toneStyles = StyleSheet.create({
  positive: {
    color: theme.colors.success,
  },
  negative: {
    color: theme.colors.warning,
  },
  neutral: {
    color: theme.colors.textMuted,
  },
  danger: {
    color: theme.colors.danger,
  },
  cycle: {
    color: transactionCategoryColor('cycle'),
  },
});

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xxs,
  },
  cycleSnippet: {
    borderColor: 'rgba(37, 99, 235, 0.16)',
    borderLeftColor: transactionCategoryColor('cycle'),
    borderLeftWidth: 3,
  },
  rejectedSnippet: {
    backgroundColor: 'rgba(178, 67, 56, 0.07)',
    borderColor: 'rgba(178, 67, 56, 0.18)',
  },
  cardPositive: {
    borderLeftColor: theme.colors.success,
    borderLeftWidth: 3,
  },
  cardNegative: {
    borderLeftColor: theme.colors.warning,
    borderLeftWidth: 3,
  },
  cardNeutral: {
    borderLeftColor: theme.colors.textMuted,
    borderLeftWidth: 3,
  },
  cardDanger: {
    borderLeftColor: theme.colors.danger,
    borderLeftWidth: 3,
  },
  cardCycle: {
    borderLeftColor: transactionCategoryColor('cycle'),
    borderLeftWidth: 3,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  headerPressed: {
    opacity: 0.94,
  },
  text: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  headerMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 22,
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  cycleIconBadge: {
    alignItems: 'center',
    backgroundColor: '#eaf1ff',
    borderRadius: theme.radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  categoryIconBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  impact: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  toggleText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  steps: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  stepRail: {
    alignItems: 'center',
    width: 14,
  },
  stepMarker: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    height: 10,
    marginTop: 4,
    width: 10,
  },
  stepMarkerPositive: {
    backgroundColor: theme.colors.success,
  },
  stepMarkerNegative: {
    backgroundColor: theme.colors.warning,
  },
  stepMarkerNeutral: {
    backgroundColor: theme.colors.textMuted,
  },
  stepMarkerDanger: {
    backgroundColor: theme.colors.danger,
  },
  stepMarkerCycle: {
    backgroundColor: transactionCategoryColor('cycle'),
  },
  stepLine: {
    backgroundColor: theme.colors.hairline,
    flex: 1,
    marginTop: 4,
    width: 1,
  },
  stepBody: {
    flex: 1,
    gap: 4,
  },
  stepTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  stepTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    paddingRight: theme.spacing.sm,
  },
  stepImpact: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  stepMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  stepAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
});
