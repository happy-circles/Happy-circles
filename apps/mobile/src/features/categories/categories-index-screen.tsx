import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsPeriod,
} from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';

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

function peoplePreviewLabel(row: BalanceAnalyticsCategoryRowDto): string {
  if (row.personLabels.length === 0) {
    return 'Sin personas visibles';
  }

  const visiblePeople = row.personLabels.slice(0, 2).join(', ');
  const hiddenCount = row.personLabels.length - 2;

  return hiddenCount > 0 ? `${visiblePeople} y ${hiddenCount} mas` : visiblePeople;
}

function categoryHref(category: string, period: BalanceAnalyticsPeriod): Href {
  return `/category/${category}?period=${period}` as Href;
}

function CategoryRow({
  period,
  row,
}: {
  readonly period: BalanceAnalyticsPeriod;
  readonly row: BalanceAnalyticsCategoryRowDto;
}) {
  const icon = transactionCategoryIcon(row.category) as keyof typeof Ionicons.glyphMap;
  const color = transactionCategoryColor(row.category);
  const backgroundColor = transactionCategoryBackgroundColor(row.category);

  return (
    <Link href={categoryHref(row.category, period)} asChild>
      <Pressable style={({ pressed }) => [pressed ? styles.pressed : null]}>
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
              <Text numberOfLines={1} style={styles.categoryTitle}>
                {row.label}
              </Text>
              <Text numberOfLines={1} style={styles.categoryMeta}>
                {peoplePreviewLabel(row)}
              </Text>
            </View>
          </View>

          <View style={styles.trailing}>
            <Text style={styles.amountLabel}>{movementCountLabel(row.movementCount)}</Text>
            <View style={styles.amountRow}>
              <Text numberOfLines={1} style={[styles.amount, amountToneStyle(row.netMinor)]}>
                {formatCop(row.netMinor)}
              </Text>
              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
            </View>
          </View>
        </SurfaceCard>
      </Pressable>
    </Link>
  );
}

export function CategoriesIndexScreen() {
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const analytics = snapshotQuery.data?.balanceAnalytics ?? null;
  const [period, setPeriod] = useState<BalanceAnalyticsPeriod>(analytics?.defaultPeriod ?? 'month');

  useEffect(() => {
    if (analytics?.defaultPeriod) {
      setPeriod(analytics.defaultPeriod);
    }
  }, [analytics?.defaultPeriod]);

  if (snapshotQuery.error && !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Categorias">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.isLoading || !analytics) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Categorias">
        <View style={styles.loadingState}>
          <HappyCirclesMotion size={108} variant="loading" />
          <Text style={styles.supportText}>Estamos organizando tus categorias.</Text>
        </View>
      </ScreenShell>
    );
  }

  const currentPeriod = analytics.periods[period];
  const categories = [...currentPeriod.categories].sort((left, right) => {
    const amountDiff = Math.abs(right.netMinor) - Math.abs(left.netMinor);
    if (amountDiff !== 0) {
      return amountDiff;
    }

    return right.movementCount - left.movementCount;
  });

  return (
    <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Categorias">
      <SegmentedControl
        label="Periodo"
        onChange={setPeriod}
        options={PERIOD_OPTIONS}
        value={period}
      />

      {categories.length === 0 ? (
        <EmptyState
          description="Cuando registres movimientos, podras ver el balance por categoria."
          title="Sin categorias todavia"
        />
      ) : (
        <View style={styles.list}>
          {categories.map((row) => (
            <CategoryRow key={row.key} period={period} row={row} />
          ))}
        </View>
      )}
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
  list: {
    gap: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.92,
  },
  categoryCard: {
    alignItems: 'center',
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  cardPositive: {
    borderLeftColor: theme.colors.success,
  },
  cardNegative: {
    borderLeftColor: theme.colors.warning,
  },
  leading: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  categoryIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  categoryCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  categoryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  categoryMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: 132,
  },
  amountLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '700',
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  amount: {
    flexShrink: 1,
    fontSize: theme.typography.body,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'right',
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
