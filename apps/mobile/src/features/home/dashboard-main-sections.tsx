import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { ActivityItemCard } from '@/components/activity-item-card';
import { CardPressable } from '@/components/card-shell';
import { SectionBlock } from '@/components/section-block';
import { dashboardStyles as styles } from '@/features/home/dashboard-screen.styles';
import type { ActivityItemDto, PendingActionDto, PersonCardDto } from '@happy-circles/application';
import {
  statusLabelForHomePendingPreview,
  type TransactionTargetPanel,
} from './dashboard-helpers';
import { PersonTile, ShortcutTile, TransactionPreviewCard } from './dashboard-preview-cards';
import { AppText } from '@/components/app-text';
import { cardStateColor, cardStateIntentFromStatus, cardStateSoftColor } from '@/lib/card-language';
import { useAppTheme } from '@/providers/theme-provider';

function pendingPreviewIconName(item: PendingActionDto): keyof typeof Ionicons.glyphMap {
  if (item.kind === 'account_invite') {
    return 'key-outline';
  }

  if (item.kind === 'friendship_invite') {
    return 'person-add-outline';
  }

  if (item.kind === 'reminder') {
    return 'notifications-outline';
  }

  return 'information-circle-outline';
}

export function DashboardPendingActionSection({ item }: { readonly item: PendingActionDto }) {
  const activeTheme = useAppTheme();
  const statusLabel = statusLabelForHomePendingPreview(item);
  const intent = cardStateIntentFromStatus(item.status);
  const accentColor = cardStateColor(intent);
  const iconBackgroundColor = cardStateSoftColor(intent);
  const href = (item.href || '/activity') as Href;
  const meta = [statusLabel, item.subtitle].filter(Boolean).join(' | ');

  return (
    <SectionBlock
      action={
        <Link href="/activity" asChild>
          <Pressable
            hitSlop={12}
            pressRetentionOffset={12}
            style={({ pressed }) => [
              styles.peopleSectionAction,
              pressed ? styles.quickActionPressed : null,
            ]}
          >
            <AppText style={styles.peopleSectionActionText}>Ver todo</AppText>
          </Pressable>
        </Link>
      }
      contentStyle={styles.homeSectionContent}
      headerStyle={styles.homeSectionHeader}
      title="Pendiente"
    >
      <Link href={href} asChild>
        <CardPressable accessibilityLabel={item.title} accessibilityRole="button" haptic="selection">
          <ActivityItemCard
            accentColor={accentColor}
            compact
            leadingNode={
              <View
                style={[
                  styles.homePendingActionIcon,
                  { backgroundColor: iconBackgroundColor },
                ]}
              >
                <Ionicons color={accentColor} name={pendingPreviewIconName(item)} size={21} />
              </View>
            }
            metaNode={
              <AppText numberOfLines={2} style={styles.homePendingActionMeta}>
                {meta}
              </AppText>
            }
            sideNode={
              <View style={styles.homePendingActionSide}>
                <AppText numberOfLines={1} style={styles.homePendingActionCta}>
                  {item.ctaLabel}
                </AppText>
                <Ionicons color={activeTheme.colors.textMuted} name="chevron-forward" size={18} />
              </View>
            }
            title={item.title}
            unread={intent === 'needsAction'}
            variant="elevated"
          />
        </CardPressable>
      </Link>
    </SectionBlock>
  );
}

export function DashboardPeopleSection({
  activePeople,
  onAddPerson,
}: {
  readonly activePeople: readonly PersonCardDto[];
  readonly onAddPerson: () => void;
}) {
  return (
    <SectionBlock
      action={
        <Link href="/people" asChild>
          <Pressable
            hitSlop={12}
            pressRetentionOffset={12}
            style={({ pressed }) => [
              styles.peopleSectionAction,
              pressed ? styles.quickActionPressed : null,
            ]}
          >
            <AppText style={styles.peopleSectionActionText}>Ver lista</AppText>
          </Pressable>
        </Link>
      }
      headerStyle={styles.homeSectionHeader}
      title="Personas"
    >
      <ScrollView
        horizontal
        contentContainerStyle={styles.peopleRailContent}
        showsHorizontalScrollIndicator={false}
      >
        <ShortcutTile dashed icon="add" label="Agregar" onPress={onAddPerson} />
        {activePeople.map((person) => (
          <PersonTile key={person.userId} person={person} />
        ))}
      </ScrollView>
    </SectionBlock>
  );
}

export function DashboardTransactionsSection({
  items,
  onOpenItem,
  people,
}: {
  readonly items: readonly {
    readonly highlightPending: boolean;
    readonly isPending: boolean;
    readonly item: ActivityItemDto;
    readonly unread: boolean;
  }[];
  readonly onOpenItem: (item: ActivityItemDto, panel: TransactionTargetPanel) => void;
  readonly people: readonly PersonCardDto[];
}) {
  if (items.length === 0) {
    return null;
  }

  const pendingItems = items.filter((entry) => entry.isPending);
  const historyItems = items.filter((entry) => !entry.isPending);

  return (
    <SectionBlock
      action={
        <Link href="/transactions" asChild>
          <Pressable
            hitSlop={12}
            pressRetentionOffset={12}
            style={({ pressed }) => [
              styles.peopleSectionAction,
              pressed ? styles.quickActionPressed : null,
            ]}
          >
            <AppText style={styles.peopleSectionActionText}>Ver historial</AppText>
          </Pressable>
        </Link>
      }
      contentStyle={styles.homeSectionContent}
      headerStyle={styles.homeSectionHeader}
      title="Movimientos"
    >
      <View style={styles.transactionGroups}>
        {pendingItems.length > 0 ? (
          <View style={styles.transactionGroup}>
            <View style={styles.transactionGroupHeader}>
              <AppText style={styles.transactionGroupTitle}>Pendientes</AppText>
              <View style={styles.transactionGroupBadge}>
                <AppText style={styles.transactionGroupBadgeText}>{pendingItems.length}</AppText>
              </View>
            </View>
            <View style={styles.transactionList}>
              {pendingItems.map(({ highlightPending, isPending, item, unread }) => (
                <TransactionPreviewCard
                  highlightPending={highlightPending}
                  isPending={isPending}
                  item={item}
                  key={item.id}
                  onPress={() => onOpenItem(item, isPending ? 'pending' : 'history')}
                  people={people}
                  unread={unread}
                />
              ))}
            </View>
          </View>
        ) : null}
        {historyItems.length > 0 ? (
          <View style={styles.transactionGroup}>
            <View style={styles.transactionGroupHeader}>
              <AppText style={styles.transactionGroupTitle}>Historial reciente</AppText>
            </View>
            <View style={styles.transactionList}>
              {historyItems.map(({ highlightPending, isPending, item, unread }) => (
                <TransactionPreviewCard
                  highlightPending={highlightPending}
                  isPending={isPending}
                  item={item}
                  key={item.id}
                  onPress={() => onOpenItem(item, isPending ? 'pending' : 'history')}
                  people={people}
                  unread={unread}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </SectionBlock>
  );
}
