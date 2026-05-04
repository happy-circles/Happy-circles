import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
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
  readonly description?: string | null;
  readonly amountLabel?: string | null;
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
  description,
  amountLabel,
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
  const metaParts =
    meta
      ?.split('|')
      .map((part) => part.trim())
      .filter((part) => part.length > 0) ?? [];
  const metaLabel = metaParts[0] ?? null;
  const showCategoryIcon = Boolean(category) && !isCycleSnippet;
  const impactSign = tone === 'positive' ? '+' : tone === 'negative' ? '-' : null;
  const showImpactMetric = Boolean(amountLabel) || tone === 'cycle';

  return (
    <SurfaceCard
      padding="sm"
      style={[
        styles.card,
        tone === 'positive' ? styles.cardPositive : null,
        tone === 'negative' ? styles.cardNegative : null,
        tone === 'neutral' ? styles.cardNeutral : null,
        tone === 'danger' ? styles.cardDanger : null,
        tone === 'cycle' ? styles.cardCycle : null,
        isCycleSnippet ? styles.cycleSnippet : null,
        tone === 'danger' ? styles.rejectedSnippet : null,
        isExpanded ? styles.cardExpanded : null,
        isExpanded && tone === 'positive' ? styles.cardExpandedPositive : null,
        isExpanded && tone === 'negative' ? styles.cardExpandedNegative : null,
        isExpanded && tone === 'danger' ? styles.cardExpandedDanger : null,
        isExpanded && tone === 'cycle' ? styles.cardExpandedCycle : null,
      ]}
      variant={isExpanded ? 'elevated' : isCycleSnippet ? 'muted' : 'default'}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed ? styles.headerPressed : null]}
      >
        <View style={styles.text}>
          <View style={styles.kickerRow}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            {eyebrow ? <View style={styles.kickerDot} /> : null}
            <Text
              numberOfLines={1}
              style={[
                styles.statusText,
                statusTone === 'primary' ? styles.statusPrimary : null,
                statusTone === 'success' ? styles.statusSuccess : null,
                statusTone === 'warning' ? styles.statusWarning : null,
                statusTone === 'danger' ? styles.statusDanger : null,
                statusTone === 'cycle' ? styles.statusCycle : null,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
          <View style={styles.titleLine}>
            {showCategoryIcon ? (
              <View
                style={[
                  styles.categoryIconBadge,
                  { backgroundColor: transactionCategoryBackgroundColor(category) },
                ]}
              >
                <Ionicons
                  color={transactionCategoryColor(category)}
                  name={categoryIcon}
                  size={12}
                />
              </View>
            ) : null}
            <Text style={styles.title}>{title}</Text>
          </View>
          {metaLabel || description ? (
            <View style={styles.metaRow}>
              {metaLabel ? (
                <Text numberOfLines={1} style={styles.meta}>
                  {metaLabel}
                </Text>
              ) : null}
              {metaLabel && description ? <View style={styles.metaDot} /> : null}
              {description ? (
                <Text numberOfLines={1} style={[styles.meta, styles.descriptionMeta]}>
                  {description}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.headerMeta}>
          {showImpactMetric ? (
            <View style={styles.impactMetric}>
              <View style={styles.impactValueRow}>
                {tone === 'cycle' ? (
                  <View style={styles.impactCycleBadge}>
                    <Ionicons
                      color={transactionCategoryColor('cycle')}
                      name="happy-outline"
                      size={15}
                    />
                  </View>
                ) : impactSign ? (
                  <Text style={[styles.impactSign, toneStyles[tone]]}>{impactSign}</Text>
                ) : null}
                {amountLabel ? (
                  <Text numberOfLines={1} style={[styles.impactAmount, toneStyles[tone]]}>
                    {amountLabel}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.impactMetric} />
          )}
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
                {step.impact && !step.amountLabel ? (
                  <Text style={[styles.stepImpact, toneStyles[step.tone]]}>{step.impact}</Text>
                ) : null}
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
    borderRadius: theme.radius.medium,
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xxs,
  },
  cardExpanded: {
    backgroundColor: '#fbfcff',
    borderColor: 'rgba(26, 39, 68, 0.16)',
    transform: [{ translateY: -1 }],
  },
  cardExpandedPositive: {
    backgroundColor: '#fbfefc',
    borderColor: 'rgba(61, 186, 110, 0.28)',
  },
  cardExpandedNegative: {
    backgroundColor: '#fffaf5',
    borderColor: 'rgba(249, 115, 22, 0.24)',
  },
  cardExpandedDanger: {
    backgroundColor: '#fff8f7',
    borderColor: 'rgba(232, 96, 74, 0.24)',
  },
  cardExpandedCycle: {
    backgroundColor: '#f7fbff',
    borderColor: 'rgba(37, 99, 235, 0.22)',
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
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 78,
  },
  headerPressed: {
    opacity: 0.94,
  },
  text: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  kickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  kickerDot: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.pill,
    height: 3.5,
    width: 3.5,
  },
  statusText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 15,
  },
  statusPrimary: {
    color: theme.colors.primary,
  },
  statusSuccess: {
    color: theme.colors.success,
  },
  statusWarning: {
    color: theme.colors.warning,
  },
  statusDanger: {
    color: theme.colors.danger,
  },
  statusCycle: {
    color: transactionCategoryColor('cycle'),
  },
  headerMeta: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    maxWidth: 112,
    minWidth: 96,
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 19,
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  categoryIconBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  impactMetric: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    width: '100%',
  },
  impactValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  impactSign: {
    fontSize: theme.typography.title3,
    fontWeight: '900',
    lineHeight: 22,
  },
  impactAmount: {
    flexShrink: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '900',
    lineHeight: 17,
    textAlign: 'center',
  },
  impactCycleBadge: {
    alignItems: 'center',
    backgroundColor: '#eaf1ff',
    borderRadius: theme.radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaDot: {
    backgroundColor: theme.colors.muted,
    borderRadius: theme.radius.pill,
    height: 3.5,
    width: 3.5,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 15,
  },
  descriptionMeta: {
    flexShrink: 1,
    fontWeight: '700',
  },
  toggleRow: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 4,
  },
  toggleText: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  steps: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
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
