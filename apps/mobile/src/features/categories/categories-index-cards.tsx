import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import type {
  ActivityItemDto,
  BalanceAnalyticsCategoryRowDto,
  PersonCardDto,
} from '@happy-circles/application';

import { AppText } from '@/components/app-text';
import { SurfaceCard } from '@/components/surface-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { formatCop } from '@/lib/data';
import { theme } from '@/lib/theme';
import { categoriesIndexScreenStyles as styles } from './categories-index-screen-styles';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
  transactionCategoryLabel,
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

export function CategoryRow({
  actionIcon = 'funnel-outline',
  onPress,
  row,
}: {
  readonly actionIcon?: keyof typeof Ionicons.glyphMap;
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
            <Ionicons color={theme.colors.textMuted} name={actionIcon} size={15} />
          </View>
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

export function CategoriesSummaryCard({
  categoryCount,
  movementCount,
  topCategories,
  totalMinor,
  deltaMinor,
  label,
}: {
  readonly categoryCount: number;
  readonly movementCount: number;
  readonly topCategories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly totalMinor: number;
  readonly deltaMinor: number;
  readonly label: string;
}) {
  return (
    <SurfaceCard padding="lg" style={styles.summaryCard} variant="elevated">
      <View style={styles.summaryVisualRow}>
        <View style={styles.summaryIconCluster}>
          {topCategories.slice(0, 4).map((row) => {
            const icon = transactionCategoryIcon(row.category) as keyof typeof Ionicons.glyphMap;
            const color = transactionCategoryColor(row.category);
            const backgroundColor = transactionCategoryBackgroundColor(row.category);

            return (
              <View
                key={row.key}
                style={[styles.summaryCategoryOrb, { backgroundColor, borderColor: color }]}
              >
                <Ionicons color={color} name={icon} size={16} />
              </View>
            );
          })}
        </View>
        <View style={styles.summaryFlowBadge}>
          <Ionicons
            color={totalMinor >= 0 ? theme.colors.success : theme.colors.warning}
            name={totalMinor >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
            size={15}
          />
          <AppText
            numberOfLines={1}
            style={[styles.summaryFlowText, totalMinor >= 0 ? styles.positive : styles.negative]}
          >
            balance
          </AppText>
        </View>
      </View>
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

export function ActiveCategoryPill({
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
