import { Ionicons } from '@expo/vector-icons';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { TransactionSummaryRow } from '@/components/transaction-summary-row';
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
  readonly detail?: string | null;
  readonly impact?: string | null;
  readonly meta?: string | null;
  readonly amountLabel?: string | null;
  readonly category?: string | null;
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const historyOpenLayoutAnimation = {
  create: {
    property: LayoutAnimation.Properties.opacity,
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  duration: 180,
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
};

const historyCloseLayoutAnimation = {
  duration: 150,
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
};

function animateHistoryToggle(isExpanded: boolean, onToggle: () => void): void {
  LayoutAnimation.configureNext(
    isExpanded ? historyCloseLayoutAnimation : historyOpenLayoutAnimation,
  );
  onToggle();
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
  const impactSign = tone === 'positive' ? '+' : tone === 'negative' ? '-' : null;
  const displayAmountLabel = amountLabel
    ? `${impactSign ? `${impactSign} ` : ''}${amountLabel}`
    : null;
  const primaryLabel = eyebrow ?? (isCycleSnippet ? 'Happy Circle' : title);
  const detailTitle = primaryLabel !== title ? title : null;
  const showExpandedSummary = isExpanded && Boolean(detailTitle || description);

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
      variant={isCycleSnippet ? 'muted' : 'default'}
    >
      <Pressable
        onPress={() => animateHistoryToggle(isExpanded, onToggle)}
        style={({ pressed }) => [styles.header, pressed ? styles.headerPressed : null]}
      >
        <TransactionSummaryRow
          amountColor={toneColor(tone)}
          amountLabel={displayAmountLabel}
          category={category}
          chevron={isExpanded ? 'up' : 'forward'}
          meta={meta}
          statusLabel={statusLabel}
          statusTone={statusTone}
          title={primaryLabel}
        />
      </Pressable>

      {isExpanded ? (
        <View style={styles.expandedContent}>
          {showExpandedSummary ? (
            <View style={styles.expandedSummary}>
              {detailTitle ? <Text style={styles.expandedTitle}>{detailTitle}</Text> : null}
              {description ? <Text style={styles.expandedDescription}>{description}</Text> : null}
            </View>
          ) : null}
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
                    <View style={styles.stepTitleRow}>
                      {step.category ? (
                        <View
                          style={[
                            styles.stepCategoryBadge,
                            {
                              backgroundColor: transactionCategoryBackgroundColor(step.category),
                            },
                          ]}
                        >
                          <Ionicons
                            color={transactionCategoryColor(step.category)}
                            name={
                              transactionCategoryIcon(
                                step.category,
                              ) as keyof typeof Ionicons.glyphMap
                            }
                            size={11}
                          />
                        </View>
                      ) : null}
                      <Text style={styles.stepTitle}>{step.title}</Text>
                    </View>
                    {step.amountLabel ? (
                      <Text style={[styles.stepAmount, toneStyles[step.tone]]}>
                        {step.amountLabel}
                      </Text>
                    ) : null}
                  </View>
                  {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
                  {step.impact && !step.amountLabel ? (
                    <Text style={[styles.stepImpact, toneStyles[step.tone]]}>{step.impact}</Text>
                  ) : null}
                  {step.meta ? <Text style={styles.stepMeta}>{step.meta}</Text> : null}
                </View>
              </View>
            ))}
          </View>
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

function toneColor(tone: HistoryCaseTone): string {
  return toneStyles[tone].color;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.small,
    gap: theme.spacing.sm,
    minHeight: 76,
  },
  cardExpanded: {
    borderColor: 'rgba(26, 39, 68, 0.14)',
  },
  cardExpandedPositive: {
    borderColor: 'rgba(61, 186, 110, 0.24)',
  },
  cardExpandedNegative: {
    borderColor: 'rgba(249, 115, 22, 0.22)',
  },
  cardExpandedDanger: {
    borderColor: 'rgba(232, 96, 74, 0.22)',
  },
  cardExpandedCycle: {
    borderColor: 'rgba(37, 99, 235, 0.2)',
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
    borderRadius: theme.radius.small,
  },
  headerPressed: {
    opacity: 0.94,
  },
  expandedContent: {
    gap: theme.spacing.sm,
    overflow: 'hidden',
  },
  expandedSummary: {
    gap: 3,
    paddingTop: theme.spacing.xxs,
  },
  expandedTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 18,
  },
  expandedDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
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
  stepTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
    paddingRight: theme.spacing.sm,
  },
  stepCategoryBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flexShrink: 0,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  stepTitle: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  stepDetail: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    lineHeight: 16,
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
