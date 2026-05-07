import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type {
  ActivityItemDto,
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsPeriod,
} from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import { categoriesIndexScreenStyles as styles } from './categories-index-screen-styles';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import {
  isConsolidatedTransactionItem,
  isCycleTransactionItem,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionContextLabel,
  transactionCreatedByMetaLabel,
  transactionStatusLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { AppText } from '@/components/app-text';

const PERIOD_OPTIONS: readonly SegmentedOption<BalanceAnalyticsPeriod>[] = [
  { label: 'Semana', value: 'week' },
  { label: 'Mes', value: 'month' },
  { label: 'Ano', value: 'year' },
  { label: 'Todo', value: 'all' },
];

function amountToneStyle(amountMinor: number) {
  if (amountMinor > 0) {
    return styles.positive;
  }

  if (amountMinor < 0) {
    return styles.negative;
  }

  return styles.neutral;
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
    ? `${visibleNames.join(', ')} y ${hiddenCount} mas`
    : visibleNames.join(', ');
}

function signedFormatCop(amountMinor: number): string {
  if (amountMinor > 0) {
    return `+${formatCop(amountMinor)}`;
  }

  return formatCop(amountMinor);
}

function peoplePreviewLabel(row: BalanceAnalyticsCategoryRowDto): string {
  return compactFirstNames(row.personLabels);
}

function matchesCategory(
  item: ActivityItemDto,
  category: BalanceAnalyticsCategoryRowDto['category'],
): boolean {
  return transactionVisualCategory(item) === category;
}

function CategoryRow({
  onPress,
  row,
}: {
  readonly onPress: () => void;
  readonly row: BalanceAnalyticsCategoryRowDto;
}) {
  const icon = transactionCategoryIcon(row.category) as keyof typeof Ionicons.glyphMap;
  const color = transactionCategoryColor(row.category);
  const backgroundColor = transactionCategoryBackgroundColor(row.category);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <SurfaceCard
        padding="md"
        style={[
          styles.categoryCard,
          row.netMinor > 0 ? styles.cardPositive : null,
          row.netMinor < 0 ? styles.cardNegative : null,
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
              {peoplePreviewLabel(row)}
            </AppText>
          </View>
        </View>

        <View style={styles.trailing}>
          <AppText style={styles.amountLabel}>{movementCountLabel(row.movementCount)}</AppText>
          <View style={styles.amountRow}>
            <AppText numberOfLines={1} style={[styles.amount, amountToneStyle(row.netMinor)]}>
              {formatCop(row.netMinor)}
            </AppText>
            <Ionicons color={theme.colors.textMuted} name="funnel-outline" size={15} />
          </View>
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

function CategoriesSummaryCard({
  categoryCount,
  movementCount,
  totalMinor,
  deltaMinor,
  label,
}: {
  readonly categoryCount: number;
  readonly movementCount: number;
  readonly totalMinor: number;
  readonly deltaMinor: number;
  readonly label: string;
}) {
  return (
    <SurfaceCard padding="lg" style={styles.summaryCard} variant="elevated">
      <AppText style={styles.summaryEyebrow}>{label}</AppText>
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[styles.summaryAmount, amountToneStyle(totalMinor)]}
      >
        {formatCop(totalMinor)}
      </AppText>
      <AppText style={styles.summaryMeta}>
        Cambio {signedFormatCop(deltaMinor)} | {categoryCount} categoria
        {categoryCount === 1 ? '' : 's'} | {movementCountLabel(movementCount)}
      </AppText>
    </SurfaceCard>
  );
}

function ActiveCategoryPill({
  row,
  fallbackCategory,
  onClear,
}: {
  readonly row: BalanceAnalyticsCategoryRowDto | null;
  readonly fallbackCategory: BalanceAnalyticsCategoryRowDto['category'];
  readonly onClear: () => void;
}) {
  const category = row?.category ?? fallbackCategory;
  const label = row?.label ?? transactionCategoryLabel(category);
  const icon = transactionCategoryIcon(category) as keyof typeof Ionicons.glyphMap;
  const color = transactionCategoryColor(category);
  const backgroundColor = transactionCategoryBackgroundColor(category);

  return (
    <View style={styles.activeFilterWrap}>
      <Pressable
        accessibilityRole="button"
        onPress={onClear}
        style={({ pressed }) => [
          styles.activeFilterPill,
          { backgroundColor, borderColor: color },
          pressed ? styles.pressed : null,
        ]}
      >
        <Ionicons color={color} name={icon} size={16} />
        <AppText numberOfLines={1} style={[styles.activeFilterText, { color }]}>
          {label}
        </AppText>
        <Ionicons color={color} name="close" size={15} />
      </Pressable>
    </View>
  );
}

function CategoryTransactionCard({ item }: { readonly item: ActivityItemDto }) {
  const category = transactionVisualCategory(item);
  const isSystemTransaction = isCycleTransactionItem(item);
  const actorLabel = isSystemTransaction ? 'Happy Circle' : (item.counterpartyLabel ?? 'Persona');
  const toneColor = transactionToneColor(item);

  return (
    <TransactionEventCard
      accentColor={toneColor}
      actorAvatarVariant={isSystemTransaction ? 'system' : 'person'}
      actorFallbackColor={transactionCategoryColor(category)}
      actorLabel={actorLabel}
      amountColor={toneColor}
      amountLabel={transactionAmountLabel(item)}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={category}
      categoryPlacement="none"
      compact
      compactMetaLayout="inline"
      context={transactionContextLabel(item, actorLabel)}
      href={(item.href ?? '/transactions') as Href}
      meta={transactionCreatedByMetaLabel(item, actorLabel)}
      statusLabel={transactionStatusLabel(item)}
      statusTone={transactionStatusTone(item)}
    />
  );
}

export function CategoriesIndexScreen() {
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [period, setPeriod] = useState<BalanceAnalyticsPeriod>(analytics?.defaultPeriod ?? 'month');
  const [selectedCategory, setSelectedCategory] = useState<
    BalanceAnalyticsCategoryRowDto['category'] | null
  >(null);

  useEffect(() => {
    if (analytics?.defaultPeriod) {
      setPeriod(analytics.defaultPeriod);
    }
  }, [analytics?.defaultPeriod]);

  if (snapshotQuery.error && !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Categorias">
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Categorias">
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <AppText style={styles.supportText}>Estamos organizando tus categorias.</AppText>
        </View>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const summary = currentPeriod.summaries.balance;
  const categories = [...currentPeriod.categories].sort((left, right) => {
    const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
    if (amountDiff !== 0) {
      return amountDiff;
    }

    return right.movementCount - left.movementCount;
  });
  const selectedCategoryRow =
    selectedCategory === null
      ? null
      : (categories.find((row) => row.category === selectedCategory) ?? null);
  const historyItems =
    selectedCategory === null
      ? []
      : (
          snapshotQuery.data?.activitySections.find((section) => section.key === 'history')
            ?.items ?? []
        )
          .filter(isConsolidatedTransactionItem)
          .filter((item) => matchesCategory(item, selectedCategory));

  return (
    <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Categorias">
      <CategoriesSummaryCard
        categoryCount={categories.length}
        deltaMinor={summary.deltaMinor}
        label={currentPeriod.labels.current}
        movementCount={summary.movementCount}
        totalMinor={summary.finalMinor}
      />

      <SegmentedControl
        label="Periodo"
        onChange={setPeriod}
        options={PERIOD_OPTIONS}
        value={period}
      />

      {selectedCategory ? (
        <>
          <ActiveCategoryPill
            fallbackCategory={selectedCategory}
            onClear={() => setSelectedCategory(null)}
            row={selectedCategoryRow}
          />

          {historyItems.length === 0 ? (
            <EmptyState
              description="No hay transacciones cerradas para esta categoria."
              title="Sin historial"
            />
          ) : (
            <View style={styles.list}>
              {historyItems.map((item) => (
                <CategoryTransactionCard item={item} key={item.id} />
              ))}
            </View>
          )}
        </>
      ) : categories.length === 0 ? (
        <EmptyState
          description="Cuando registres movimientos, podras ver el balance por categoria."
          title="Sin categorias todavia"
        />
      ) : (
        <View style={styles.list}>
          {categories.map((row) => (
            <CategoryRow
              key={row.key}
              onPress={() => setSelectedCategory(row.category)}
              row={row}
            />
          ))}
        </View>
      )}
    </ScreenShell>
  );
}
