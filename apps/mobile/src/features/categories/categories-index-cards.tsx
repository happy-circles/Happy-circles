import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';

import type {
  ActivityItemDto,
  BalanceAnalyticsCategoryRowDto,
  PersonCardDto,
} from '@happy-circles/application';

import { AppText } from '@/components/app-text';
import { SurfaceCard } from '@/components/surface-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { formatCop } from '@/lib/data';
import { theme, type AppTheme } from '@/lib/theme';
import { categoriesIndexScreenStyles as styles } from './categories-index-screen-styles';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
import {
  isCycleTransactionItem,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionMetaLabel,
  transactionShouldSurfaceStatus,
  transactionStatusLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import {
  transactionInitialsBackgroundColor,
  transactionPersonForItem,
} from '@/lib/transaction-people';
import { useAppTheme } from '@/providers/theme-provider';

export type CategoryInsightTone =
  | 'positive'
  | 'negative'
  | 'pending'
  | 'danger'
  | 'neutral'
  | 'cycle';

export interface CategoryInsightRow {
  readonly metricLabel: string;
  readonly row: BalanceAnalyticsCategoryRowDto;
  readonly score: number;
  readonly tone: CategoryInsightTone;
}

const PODIUM_VISUAL_ORDER = [2, 1, 3] as const;

type PodiumRank = (typeof PODIUM_VISUAL_ORDER)[number];

type CategoryPodiumVisualItem = {
  readonly displayRank: PodiumRank | null;
  readonly insight: CategoryInsightRow | null;
  readonly isDimmed: boolean;
  readonly isFocused: boolean;
  readonly isOutsideRanking: boolean;
  readonly key: string;
  readonly visualPlace: PodiumRank;
};

function amountToneStyle(amountMinor: number) {
  if (amountMinor > 0) {
    return styles.positive;
  }

  if (amountMinor < 0) {
    return styles.negative;
  }

  return styles.neutral;
}

function amountToneColor(amountMinor: number, activeTheme: AppTheme = theme): string {
  if (amountMinor > 0) {
    return activeTheme.colors.success;
  }

  if (amountMinor < 0) {
    return activeTheme.colors.warning;
  }

  return activeTheme.colors.text;
}

function toneStyle(tone: CategoryInsightTone) {
  if (tone === 'positive') {
    return styles.positive;
  }

  if (tone === 'negative') {
    return styles.negative;
  }

  if (tone === 'pending') {
    return styles.pending;
  }

  if (tone === 'danger') {
    return styles.danger;
  }

  if (tone === 'cycle') {
    return styles.cycle;
  }

  return styles.neutral;
}

function toneColor(tone: CategoryInsightTone, activeTheme: AppTheme = theme): string {
  if (tone === 'positive') {
    return activeTheme.colors.success;
  }

  if (tone === 'negative') {
    return activeTheme.colors.warning;
  }

  if (tone === 'pending') {
    return activeTheme.colors.pending;
  }

  if (tone === 'danger') {
    return activeTheme.colors.danger;
  }

  if (tone === 'cycle') {
    return activeTheme.colors.cycle;
  }

  return activeTheme.colors.primary;
}

function toneSoftColor(tone: CategoryInsightTone, activeTheme: AppTheme = theme): string {
  if (tone === 'positive') {
    return activeTheme.colors.successSoft;
  }

  if (tone === 'negative') {
    return activeTheme.colors.warningSoft;
  }

  if (tone === 'pending') {
    return activeTheme.colors.pendingSoft;
  }

  if (tone === 'danger') {
    return activeTheme.colors.dangerSoft;
  }

  if (tone === 'cycle') {
    return activeTheme.colors.cycleSoft;
  }

  return activeTheme.colors.primarySoft;
}

function movementCountLabel(count: number): string {
  return `${count} movimiento${count === 1 ? '' : 's'}`;
}

function firstName(value: string): string {
  const [name] = value.trim().split(/\s+/);

  return name && name.length > 0 ? name : value;
}

function compactFirstNames(values: readonly string[]): string {
  const names = Array.from(
    new Set(
      values
        .map(firstName)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (names.length === 0) {
    return 'Sin personas visibles';
  }

  const visibleNames = names.slice(0, 2);
  const hiddenCount = names.length - visibleNames.length;

  return hiddenCount > 0
    ? `${visibleNames.join(', ')} y ${hiddenCount} más`
    : visibleNames.join(', ');
}

function peoplePreviewLabel(row: BalanceAnalyticsCategoryRowDto): string {
  return compactFirstNames(row.personLabels);
}

function categoryMetaLabel(row: BalanceAnalyticsCategoryRowDto): string {
  return `${peoplePreviewLabel(row)} | ${movementCountLabel(row.movementCount)}`;
}

function podiumStepStyleForPlace(place: PodiumRank) {
  if (place === 1) {
    return styles.podiumStepFirst;
  }

  if (place === 2) {
    return styles.podiumStepSecond;
  }

  return styles.podiumStepThird;
}

function categoryPodiumVisualItems(
  ranking: readonly CategoryInsightRow[],
  selectedInsight: CategoryInsightRow | null,
): readonly CategoryPodiumVisualItem[] {
  const categoriesByRank = new Map<PodiumRank, CategoryInsightRow>();

  ranking.slice(0, 3).forEach((insight, index) => {
    categoriesByRank.set((index + 1) as PodiumRank, insight);
  });

  if (!selectedInsight) {
    return PODIUM_VISUAL_ORDER.map((rank) => ({
      displayRank: rank,
      insight: categoriesByRank.get(rank) ?? null,
      isDimmed: false,
      isFocused: false,
      isOutsideRanking: false,
      key: categoriesByRank.get(rank)?.row.key ?? `empty-${rank}`,
      visualPlace: rank,
    }));
  }

  const selectedRank =
    PODIUM_VISUAL_ORDER.find(
      (rank) => categoriesByRank.get(rank)?.row.category === selectedInsight.row.category,
    ) ?? null;
  const contextItems = ([1, 2, 3] as const)
    .filter((rank) => rank !== selectedRank)
    .map((rank) => ({ displayRank: rank, insight: categoriesByRank.get(rank) ?? null }))
    .filter((item) => item.insight?.row.category !== selectedInsight.row.category);
  const leftContext = contextItems[0] ?? null;
  const rightContext = contextItems[1] ?? null;

  return [
    {
      displayRank: leftContext?.displayRank ?? 2,
      insight: leftContext?.insight ?? null,
      isDimmed: true,
      isFocused: false,
      isOutsideRanking: false,
      key: leftContext?.insight?.row.key ?? 'empty-left',
      visualPlace: 2,
    },
    {
      displayRank: selectedRank,
      insight: selectedInsight,
      isDimmed: false,
      isFocused: true,
      isOutsideRanking: selectedRank === null,
      key: selectedInsight.row.key,
      visualPlace: 1,
    },
    {
      displayRank: rightContext?.displayRank ?? 3,
      insight: rightContext?.insight ?? null,
      isDimmed: true,
      isFocused: false,
      isOutsideRanking: false,
      key: rightContext?.insight?.row.key ?? 'empty-right',
      visualPlace: 3,
    },
  ];
}

export function CategoryRow({
  actionIcon = 'funnel-outline',
  metricLabel,
  metricTone,
  onPress,
  row,
}: {
  readonly actionIcon?: keyof typeof Ionicons.glyphMap;
  readonly metricLabel?: string;
  readonly metricTone?: CategoryInsightTone;
  readonly onPress: () => void;
  readonly row: BalanceAnalyticsCategoryRowDto;
}) {
  const activeTheme = useAppTheme();
  const icon = transactionCategoryIcon(row.category) as keyof typeof Ionicons.glyphMap;
  const color = transactionCategoryColor(row.category);
  const backgroundColor = transactionCategoryBackgroundColor(row.category);
  const resolvedMetricLabel = metricLabel ?? formatCop(row.netMinor);
  const resolvedMetricStyle = metricTone ? toneStyle(metricTone) : amountToneStyle(row.netMinor);
  const resolvedMetricColor = metricTone
    ? toneColor(metricTone, activeTheme)
    : amountToneColor(row.netMinor, activeTheme);

  return (
    <Pressable
      accessibilityLabel={`${row.label}. ${categoryMetaLabel(row)}. ${resolvedMetricLabel}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.pressed : null]}
    >
      <SurfaceCard
        padding="md"
        style={[
          styles.categoryCard,
          {
            backgroundColor: activeTheme.colors.surface,
            borderColor: activeTheme.colors.hairline,
          },
        ]}
      >
        <View style={styles.leading}>
          <View style={[styles.categoryIcon, { backgroundColor }]}>
            <Ionicons color={color} name={icon} size={20} />
          </View>
          <View style={styles.categoryCopy}>
            <AppText numberOfLines={1} style={styles.categoryTitle}>
              {row.label}
            </AppText>
            <AppText numberOfLines={1} style={styles.categoryMeta}>
              {categoryMetaLabel(row)}
            </AppText>
          </View>
        </View>

        <View style={styles.trailing}>
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            numberOfLines={1}
            style={[styles.amount, resolvedMetricStyle, { color: resolvedMetricColor }]}
          >
            {resolvedMetricLabel}
          </AppText>
          <Ionicons color={activeTheme.colors.textMuted} name={actionIcon} size={15} />
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

export function CategoriesPodiumCard({
  activeFilter,
  onSelectCategory,
  ranking,
  selectedCategory,
  selectedInsight,
}: {
  readonly activeFilter: string;
  readonly onSelectCategory: (category: BalanceAnalyticsCategoryRowDto['category']) => void;
  readonly ranking: readonly CategoryInsightRow[];
  readonly selectedCategory: BalanceAnalyticsCategoryRowDto['category'] | null;
  readonly selectedInsight: CategoryInsightRow | null;
}) {
  const activeTheme = useAppTheme();
  const bodyProgress = useRef(new Animated.Value(1)).current;
  const podiumItems = useMemo(
    () => categoryPodiumVisualItems(ranking, selectedInsight),
    [ranking, selectedInsight],
  );
  const bodyTransitionKey = selectedInsight
    ? `category:${selectedInsight.row.category}:${activeFilter}:${selectedInsight.metricLabel}`
    : `top:${activeFilter}:${ranking.map((insight) => insight.row.category).join('|')}`;

  useEffect(() => {
    bodyProgress.stopAnimation();
    bodyProgress.setValue(0);
    Animated.timing(bodyProgress, {
      duration: 220,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [bodyProgress, bodyTransitionKey]);

  const bodyAnimatedStyle = {
    opacity: bodyProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.84, 1],
    }),
    transform: [
      {
        translateY: bodyProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [3, 0],
        }),
      },
      {
        scale: bodyProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.997, 1],
        }),
      },
    ],
  };

  return (
    <View style={styles.insightModule}>
      <Animated.View style={[styles.insightBody, bodyAnimatedStyle]}>
        <View style={styles.podiumRow}>
          {podiumItems.map((item) => {
            const {
              displayRank,
              insight,
              isDimmed,
              isFocused,
              isOutsideRanking,
              key,
              visualPlace,
            } = item;
            const stepStyle = podiumStepStyleForPlace(visualPlace);
            const rankLabel = displayRank === null ? 'Filtro' : String(displayRank);

            if (!insight) {
              return (
                <View
                  accessibilityLabel={`Puesto ${displayRank ?? visualPlace} esperando historial`}
                  accessible
                  key={key}
                  style={[
                    styles.podiumSlot,
                    visualPlace === 1 ? styles.podiumSlotFirst : null,
                    isDimmed ? styles.podiumSlotDimmed : null,
                  ]}
                >
                  <View style={styles.podiumIconWrap}>
                    <View
                      style={[
                        styles.podiumRankMedal,
                        styles.podiumRankMedalEmpty,
                        visualPlace === 1 ? styles.podiumRankMedalFirst : null,
                        {
                          backgroundColor: activeTheme.colors.surfaceMuted,
                          borderColor: activeTheme.colors.border,
                        },
                      ]}
                    >
                      <AppText
                        adjustsFontSizeToFit
                        minimumFontScale={0.68}
                        numberOfLines={1}
                        style={styles.podiumRankMedalTextEmpty}
                      >
                        {rankLabel}
                      </AppText>
                    </View>
                    <View
                      style={[
                        styles.podiumIconRing,
                        styles.podiumIconRingEmpty,
                        { borderColor: activeTheme.colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.emptyPodiumIcon,
                          visualPlace === 1 ? styles.emptyPodiumIconFirst : null,
                          { backgroundColor: activeTheme.colors.floatingSurface },
                        ]}
                      >
                        <Ionicons
                          color={activeTheme.colors.textMuted}
                          name="hourglass-outline"
                          size={visualPlace === 1 ? 21 : 18}
                        />
                      </View>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.podiumStep,
                      styles.podiumStepEmpty,
                      stepStyle,
                      {
                        backgroundColor: activeTheme.colors.inputGlass,
                        borderColor: activeTheme.colors.border,
                      },
                    ]}
                  >
                    <AppText numberOfLines={1} style={styles.podiumNameEmpty}>
                      Esperando
                    </AppText>
                  </View>
                </View>
              );
            }

            const categoryIcon = transactionCategoryIcon(
              insight.row.category,
            ) as keyof typeof Ionicons.glyphMap;
            const color = toneColor(insight.tone, activeTheme);
            const softColor = toneSoftColor(insight.tone, activeTheme);
            const categoryColor = transactionCategoryColor(insight.row.category);
            const categoryBackground = transactionCategoryBackgroundColor(insight.row.category);
            const selected = insight.row.category === selectedCategory;

            return (
              <Pressable
                accessibilityLabel={`Filtrar movimientos de ${insight.row.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={key}
                onPress={() => onSelectCategory(insight.row.category)}
                style={({ pressed }) => [
                  styles.podiumSlot,
                  visualPlace === 1 ? styles.podiumSlotFirst : null,
                  isFocused ? styles.podiumSlotFocused : null,
                  isDimmed ? styles.podiumSlotDimmed : null,
                  selected && !isFocused ? styles.podiumSlotSelected : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={styles.podiumIconWrap}>
                  <View
                    style={[
                      styles.podiumRankMedal,
                      visualPlace === 1 ? styles.podiumRankMedalFirst : null,
                      { backgroundColor: softColor, borderColor: color },
                    ]}
                  >
                    <AppText
                      adjustsFontSizeToFit
                      minimumFontScale={0.68}
                      numberOfLines={1}
                      style={[
                        styles.podiumRankMedalText,
                        isOutsideRanking ? styles.podiumRankMedalTextFilter : null,
                        { color },
                      ]}
                    >
                      {rankLabel}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.podiumIconRing,
                      isFocused ? styles.podiumIconRingFocused : null,
                      { borderColor: color },
                    ]}
                  >
                    <View
                      style={[
                        styles.podiumCategoryIcon,
                        visualPlace === 1 ? styles.podiumCategoryIconFirst : null,
                        { backgroundColor: categoryBackground },
                      ]}
                    >
                      <Ionicons
                        color={categoryColor}
                        name={categoryIcon}
                        size={visualPlace === 1 ? 24 : 20}
                      />
                    </View>
                  </View>
                </View>
                <View
                  style={[
                    styles.podiumStep,
                    stepStyle,
                    isFocused ? styles.podiumStepFocused : null,
                    { backgroundColor: softColor, borderColor: color },
                  ]}
                >
                  <AppText numberOfLines={1} style={styles.podiumName}>
                    {insight.row.label}
                  </AppText>
                  <AppText
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={[styles.podiumStepMetric, { color }]}
                  >
                    {insight.metricLabel}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

export function CategoryTransactionCard({
  item,
  people,
}: {
  readonly item: ActivityItemDto;
  readonly people: readonly PersonCardDto[];
}) {
  const category = transactionVisualCategory(item);
  const isSystemTransaction = isCycleTransactionItem(item);
  const actorLabel = isSystemTransaction ? 'Happy Circle' : (item.counterpartyLabel ?? 'Persona');
  const toneColor = transactionToneColor(item);
  const person = transactionPersonForItem(people, item);
  const fallbackPerson = {
    displayName: actorLabel,
    userId: person?.userId ?? item.id,
  };

  return (
    <TransactionEventCard
      accentColor={toneColor}
      actorAvatarUrl={isSystemTransaction ? null : (person?.avatarUrl ?? null)}
      actorAvatarVariant={isSystemTransaction ? 'system' : 'person'}
      actorFallbackColor={
        isSystemTransaction ? toneColor : transactionInitialsBackgroundColor(fallbackPerson)
      }
      actorLabel={actorLabel}
      amountColor={toneColor}
      amountLabel={transactionAmountLabel(item)}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={category}
      categoryPlacement="none"
      compact
      compactMetaLayout="inline"
      context=""
      href={(item.href ?? '/transactions') as Href}
      meta={transactionMetaLabel(item)}
      statusLabel={
        transactionShouldSurfaceStatus(item, { density: 'summary' })
          ? transactionStatusLabel(item)
          : null
      }
      statusTone={transactionStatusTone(item)}
    />
  );
}
