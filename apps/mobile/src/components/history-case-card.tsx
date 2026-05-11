import { Ionicons } from '@expo/vector-icons';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';

import { AppAvatar } from '@/components/app-avatar';
import { CardActorAvatar } from '@/components/card-actor-avatar';
import { CardTimeline, type CardTone, type CardTimelineStep } from '@/components/card-shell';
import { StatusFaceBadge } from '@/components/status-face-badge';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { cardStateColor, cardStateIntentFromTone } from '@/lib/card-language';
import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
import { SurfaceCard } from './surface-card';
import { AppText } from '@/components/app-text';

export type HistoryCaseTone = 'positive' | 'negative' | 'neutral' | 'danger' | 'cycle';
export type HistoryCaseExpandedLayout = 'panel' | 'showcase';

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
  readonly actorFallbackColor?: string;
  readonly actorAvatarUrl?: string | null;
  readonly eyebrow?: string | null;
  readonly category?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly amountLabel?: string | null;
  readonly amountStruckThrough?: boolean;
  readonly expandedLayout?: HistoryCaseExpandedLayout;
  readonly focused?: boolean;
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

const META_SEPARATOR = ` ${String.fromCharCode(183)} `;

function animateHistoryToggle(isExpanded: boolean, onToggle: () => void): void {
  triggerAppSelectionHaptic();
  LayoutAnimation.configureNext(
    isExpanded ? historyCloseLayoutAnimation : historyOpenLayoutAnimation,
  );
  onToggle();
}

export function HistoryCaseCard({
  actorFallbackColor,
  actorAvatarUrl = null,
  eyebrow,
  title,
  description,
  amountLabel,
  amountStruckThrough = false,
  expandedLayout = 'panel',
  focused = false,
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
  const showExpandedSummary = Boolean(detailTitle || description);
  const isExpandedShowcase = expandedLayout === 'showcase';
  const avatarSize = 34;
  const metaLabel = meta ? meta.replace(/\s*\|\s*/g, META_SEPARATOR) : null;
  const avatarIntent = cardStateIntentFromTone(statusTone);
  const avatarHaloIntensity = statusTone === 'warning' ? 'strong' : 'soft';
  const avatarHaloColor = historyCaseHaloColor(tone, statusTone);
  const leadingNode =
    isCycleSnippet && statusLabel ? (
      <StatusFaceBadge label={statusLabel} size={avatarSize} tone={statusTone} />
    ) : (
      <AppAvatar
        fallbackBackgroundColor={
          isCycleSnippet
            ? transactionCategoryColor('cycle')
            : (actorFallbackColor ?? toneColor(tone))
        }
        fallbackTextColor={theme.colors.white}
        imageUrl={isCycleSnippet ? null : actorAvatarUrl}
        label={primaryLabel}
        size={avatarSize}
        variant={isCycleSnippet ? 'system' : 'person'}
      />
    );

  return (
    <View style={styles.caseWrap}>
      <SurfaceCard
        padding="sm"
        shape="pill"
        style={[
          styles.card,
          isCycleSnippet ? styles.cycleSnippet : null,
          tone === 'danger' ? styles.rejectedSnippet : null,
          focused ? styles.cardFocused : null,
          isExpanded ? styles.cardActive : null,
        ]}
        variant={isCycleSnippet ? 'muted' : 'default'}
      >
        <Pressable
          accessibilityLabel={[primaryLabel, displayAmountLabel, metaLabel]
            .filter(Boolean)
            .join(', ')}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          onPress={() => animateHistoryToggle(isExpanded, onToggle)}
          style={({ pressed }) => [styles.header, pressed ? styles.headerPressed : null]}
        >
          <View style={styles.headerRow}>
            <View style={styles.avatarWrap}>
              <CardActorAvatar
                haloColor={avatarHaloColor}
                haloIntensity={avatarHaloIntensity}
                haloSize={42}
                intent={avatarIntent}
                size={avatarSize}
                tone={statusTone}
              >
                {leadingNode}
              </CardActorAvatar>
            </View>
            <View style={styles.headerCopy}>
              <AppText numberOfLines={1} style={styles.headerTitle}>
                {primaryLabel}
              </AppText>
              {metaLabel ? (
                <AppText numberOfLines={1} style={styles.headerMeta}>
                  {metaLabel}
                </AppText>
              ) : null}
            </View>
            <View style={styles.headerSide}>
              <View style={styles.amountRow}>
                {displayAmountLabel ? (
                  <AppText
                    adjustsFontSizeToFit
                    minimumFontScale={0.76}
                    numberOfLines={1}
                    style={[
                      styles.headerAmount,
                      { color: toneColor(tone) },
                      amountStruckThrough ? styles.headerAmountStruckThrough : null,
                    ]}
                  >
                    {displayAmountLabel}
                  </AppText>
                ) : null}
                <Ionicons
                  color={theme.colors.textMuted}
                  name={isExpanded ? 'chevron-up' : 'chevron-forward'}
                  size={16}
                />
              </View>
            </View>
          </View>
        </Pressable>
      </SurfaceCard>

      {isExpanded ? (
        <SurfaceCard
          glassTreatment={isExpandedShowcase ? 'standard' : 'flatSoft'}
          padding={isExpandedShowcase ? 'lg' : 'md'}
          style={[styles.expandedPanel, isExpandedShowcase ? styles.expandedPanelShowcase : null]}
          variant={isCycleSnippet ? 'muted' : isExpandedShowcase ? 'elevated' : 'default'}
        >
          {showExpandedSummary ? (
            <View style={styles.expandedSummary}>
              {detailTitle ? <AppText style={styles.expandedTitle}>{detailTitle}</AppText> : null}
              {description ? (
                <AppText style={styles.expandedDescription}>{description}</AppText>
              ) : null}
            </View>
          ) : null}
          <CardTimeline steps={historyTimelineSteps(steps)} />
        </SurfaceCard>
      ) : null}
    </View>
  );
}

function historyTimelineSteps(
  steps: readonly HistoryCaseStepViewModel[],
): readonly CardTimelineStep[] {
  return steps.map((step) => ({
    amountLabel: step.amountLabel,
    detail: step.detail ?? (step.impact && step.impact !== step.title ? step.impact : null),
    id: step.id,
    leadingNode: step.category ? (
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
          name={transactionCategoryIcon(step.category) as keyof typeof Ionicons.glyphMap}
          size={11}
        />
      </View>
    ) : null,
    meta: step.meta,
    title: step.title,
    tone: historyTimelineTone(step.tone),
  }));
}

function historyTimelineTone(tone: HistoryCaseTone): CardTone {
  if (tone === 'positive') {
    return 'success';
  }

  if (tone === 'negative') {
    return 'warning';
  }

  return tone;
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
    color: theme.colors.warning,
  },
  cycle: {
    color: transactionCategoryColor('cycle'),
  },
});

function toneColor(tone: HistoryCaseTone): string {
  return toneStyles[tone].color;
}

function historyCaseHaloColor(tone: HistoryCaseTone, statusTone: CardTone): string {
  if (statusTone === 'warning') {
    return cardStateColor('needsAction', 'warning');
  }

  if (statusTone === 'danger' || tone === 'danger') {
    return theme.colors.danger;
  }

  if (tone === 'positive' || statusTone === 'success') {
    return theme.colors.success;
  }

  if (tone === 'negative') {
    return theme.colors.warning;
  }

  if (tone === 'cycle' || statusTone === 'cycle' || statusTone === 'primary') {
    return transactionCategoryColor('cycle');
  }

  return cardStateColor('neutral', 'neutral');
}

const styles = StyleSheet.create({
  caseWrap: {
    gap: 0,
    position: 'relative',
  },
  card: {
    gap: theme.spacing.xs,
    minHeight: 68,
    position: 'relative',
    zIndex: 2,
  },
  cardActive: {
    opacity: 0.98,
  },
  cycleSnippet: {
    backgroundColor: 'transparent',
  },
  rejectedSnippet: {
    backgroundColor: 'transparent',
  },
  cardFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderColor: 'rgba(255, 255, 255, 0.98)',
  },
  header: {
    borderRadius: theme.radius.pill,
  },
  headerPressed: {
    opacity: 0.94,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  avatarWrap: {
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  headerTitle: {
    color: theme.colors.text,
    flexShrink: 1,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 18,
  },
  headerMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
  },
  headerSide: {
    alignItems: 'flex-end',
    gap: 3,
    minWidth: 82,
    width: 104,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'flex-end',
    maxWidth: '100%',
  },
  headerAmount: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'right',
  },
  headerAmountStruckThrough: {
    opacity: 0.72,
    textDecorationLine: 'line-through',
  },
  expandedPanel: {
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.sm,
    marginTop: -theme.spacing.sm,
    paddingTop: theme.spacing.xl,
    position: 'relative',
    zIndex: 1,
  },
  expandedPanelShowcase: {
    gap: theme.spacing.md,
    marginHorizontal: 0,
    marginTop: theme.spacing.xs,
    minHeight: 150,
    paddingTop: theme.spacing.lg,
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
