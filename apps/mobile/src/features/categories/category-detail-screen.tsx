import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type {
  ActivityItemDto,
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsPeriod,
  PersonCardDto,
} from '@happy-circles/application';
import type { TransactionCategory } from '@happy-circles/shared';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { useSyncedBalanceAnalyticsPeriod } from '@/features/balance/balance-period-selection';
import { formatCop } from '@/lib/data';
import { buildLatestHistoryCaseItems, isHistoryCaseItem } from '@/lib/history-cases';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import {
  normalizeTransactionCategory,
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import {
  isConsolidatedTransactionItem,
  isCycleTransactionItem,
  isPendingTransactionItem,
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
  transactionDetailHref,
  transactionInitialsBackgroundColor,
  transactionPersonForItem,
} from '@/lib/transaction-people';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';

const PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Ano', value: 'year' },
  { label: 'Todo', value: 'all' },
];

function movementCountLabel(count: number): string {
  return `${count} movimiento${count === 1 ? '' : 's'}`;
}

function rowForCategory(
  rows: readonly BalanceAnalyticsCategoryRowDto[],
  category: TransactionCategory,
): BalanceAnalyticsCategoryRowDto | null {
  return rows.find((row) => row.category === category) ?? null;
}

function matchesCategory(item: ActivityItemDto, category: TransactionCategory): boolean {
  return transactionVisualCategory(item) === category;
}

function amountToneStyle(amountMinor: number) {
  if (amountMinor > 0) {
    return styles.positive;
  }

  if (amountMinor < 0) {
    return styles.negative;
  }

  return styles.neutral;
}

function transactionsHref(category: TransactionCategory): Href {
  return `/transactions?category=${category}` as Href;
}

function personHref(userId: string): Href {
  return `/person/${userId}` as Href;
}

function CategoryTransactionCard({
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
      href={transactionDetailHref(
        people,
        item,
        isPendingTransactionItem(item) ? 'pending' : 'history',
      )}
      meta={transactionMetaLabel(item)}
      pending={isPendingTransactionItem(item)}
      pendingHighlightColor={toneColor}
      statusLabel={
        transactionShouldSurfaceStatus(item, { density: 'summary' })
          ? transactionStatusLabel(item)
          : null
      }
      statusTone={transactionStatusTone(item)}
    />
  );
}

export function CategoryDetailScreen({
  category: rawCategory,
  initialPeriod,
}: {
  readonly category: string;
  readonly initialPeriod?: string | null;
}) {
  const activeTheme = useAppTheme();
  const category = normalizeTransactionCategory(rawCategory);
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [period, setPeriod] = useSyncedBalanceAnalyticsPeriod({
    defaultPeriod: analytics?.defaultPeriod,
    initialPeriod,
  });

  if (snapshotQuery.error && !analytics) {
    return (
      <ScreenShell
        headerVariant="plain"
        largeTitle={false}
        refresh={refresh}
        title={transactionCategoryLabel(category)}
      >
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !analytics) {
    return (
      <ScreenShell
        headerVariant="plain"
        largeTitle={false}
        title={transactionCategoryLabel(category)}
      >
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Estamos leyendo esta categoria.</AppText>
        </View>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const categoryRow = rowForCategory(currentPeriod.categories, category);
  const sections = snapshotQuery.data?.activitySections ?? [];
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const pendingItems = (sections.find((section) => section.key === 'pending')?.items ?? [])
    .filter(isPendingTransactionItem)
    .filter((item) => matchesCategory(item, category));
  const historyItems = (sections.find((section) => section.key === 'history')?.items ?? [])
    .filter(isConsolidatedTransactionItem)
    .filter(isHistoryCaseItem)
    .filter((item) => matchesCategory(item, category));
  const visibleHistoryItems = buildLatestHistoryCaseItems(historyItems);
  const icon = transactionCategoryIcon(category) as keyof typeof Ionicons.glyphMap;
  const color = transactionCategoryColor(category);
  const backgroundColor = transactionCategoryBackgroundColor(category);

  return (
    <ScreenShell
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      title={transactionCategoryLabel(category)}
    >
      <SegmentedControl
        label="Periodo"
        onChange={setPeriod}
        options={PERIOD_OPTIONS}
        value={period}
      />

      {categoryRow ? (
        <>
          <SurfaceCard padding="lg" style={styles.heroCard}>
            <View style={[styles.heroIcon, { backgroundColor }]}>
              <Ionicons color={color} name={icon} size={24} />
            </View>
            <View style={styles.heroCopy}>
              <AppText style={styles.heroEyebrow}>Impacto del periodo</AppText>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.76}
                numberOfLines={1}
                style={[styles.heroAmount, amountToneStyle(categoryRow.netMinor)]}
              >
                {formatCop(categoryRow.netMinor)}
              </AppText>
              <AppText style={styles.heroMeta}>
                {movementCountLabel(categoryRow.movementCount)} - {categoryRow.personLabels.length}{' '}
                persona{categoryRow.personLabels.length === 1 ? '' : 's'}
              </AppText>
            </View>
          </SurfaceCard>

          <View style={styles.metricGrid}>
            <SurfaceCard padding="md" style={styles.metricCard}>
              <AppText style={styles.metricLabel}>Te deben</AppText>
              <AppText style={[styles.metricAmount, styles.positive]}>
                {formatCop(categoryRow.owedToMeMinor)}
              </AppText>
            </SurfaceCard>
            <SurfaceCard padding="md" style={styles.metricCard}>
              <AppText style={styles.metricLabel}>Debes</AppText>
              <AppText style={[styles.metricAmount, styles.negative]}>
                {formatCop(categoryRow.iOweMinor)}
              </AppText>
            </SurfaceCard>
          </View>

          <SectionBlock title="Personas">
            <SurfaceCard padding="md">
              {categoryRow.personLabels.length > 0 ? (
                <View style={styles.peopleWrap}>
                  {categoryRow.personLabels.map((label, index) => {
                    const userId = categoryRow.userIds[index];
                    const chip = (
                      <Pressable
                        disabled={!userId}
                        style={({ pressed }) => [
                          styles.personChip,
                          {
                            backgroundColor: activeTheme.colors.surfaceMuted,
                            borderColor: activeTheme.colors.hairline,
                          },
                          pressed ? styles.personChipPressed : null,
                        ]}
                      >
                        <AppText style={styles.personChipText}>{label}</AppText>
                      </Pressable>
                    );

                    return userId ? (
                      <Link href={personHref(userId)} key={userId} asChild>
                        {chip}
                      </Link>
                    ) : (
                      <View key={label}>{chip}</View>
                    );
                  })}
                </View>
              ) : (
                <AppText style={styles.supportText}>
                  No hay personas visibles en este periodo.
                </AppText>
              )}
            </SurfaceCard>
          </SectionBlock>
        </>
      ) : (
        <EmptyState
          description="No hay actividad visible para esta categoria en el periodo seleccionado."
          title="Sin actividad"
        />
      )}

      <PrimaryAction
        href={transactionsHref(category)}
        label="Ver todas las transacciones"
        variant="secondary"
      />

      {pendingItems.length > 0 ? (
        <SectionBlock title="Pendientes">
          <View style={styles.list}>
            {pendingItems.map((item) => (
              <CategoryTransactionCard item={item} key={item.id} people={people} />
            ))}
          </View>
        </SectionBlock>
      ) : null}

      {visibleHistoryItems.length > 0 ? (
        <SectionBlock title="Historial">
          <View style={styles.list}>
            {visibleHistoryItems.map((item) => (
              <CategoryTransactionCard item={item} key={item.id} people={people} />
            ))}
          </View>
        </SectionBlock>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  heroCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  heroIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.large,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  heroCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  heroEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.title1,
    fontWeight: '800',
    lineHeight: 34,
  },
  heroMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metricCard: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  metricAmount: {
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 22,
  },
  peopleWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  personChip: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  personChipPressed: {
    opacity: 0.72,
  },
  personChipText: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  list: {
    gap: theme.spacing.sm,
  },
  positive: {
    color: theme.colors.success,
  },
  negative: {
    color: theme.colors.warning,
  },
  neutral: {
    color: theme.colors.text,
  },
});
