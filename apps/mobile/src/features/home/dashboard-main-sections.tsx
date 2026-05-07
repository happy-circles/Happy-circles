import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { SectionBlock } from '@/components/section-block';
import { dashboardStyles as styles } from '@/features/home/dashboard-screen.styles';
import { theme } from '@/lib/theme';
import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import { PersonTile, ShortcutTile, TransactionPreviewCard } from './dashboard-preview-cards';
import { AppText } from '@/components/app-text';

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
            style={({ pressed }) => [
              styles.peopleSectionAction,
              pressed ? styles.quickActionPressed : null,
            ]}
          >
            <AppText style={styles.peopleSectionActionText}>Ver lista</AppText>
          </Pressable>
        </Link>
      }
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
  readonly onOpenItem: (item: ActivityItemDto) => void;
  readonly people: readonly PersonCardDto[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <SectionBlock title="Ultimos movimientos">
      <View style={styles.transactionList}>
        {items.map(({ highlightPending, isPending, item, unread }) => (
          <TransactionPreviewCard
            highlightPending={highlightPending}
            isPending={isPending}
            item={item}
            key={item.id}
            onPress={() => onOpenItem(item)}
            people={people}
            unread={unread}
          />
        ))}
        <Link href="/transactions" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.transactionFooter,
              pressed ? styles.quickActionPressed : null,
            ]}
          >
            <View style={styles.transactionFooterIcon}>
              <Ionicons color={theme.colors.primary} name="time-outline" size={19} />
            </View>
            <View style={styles.transactionFooterCopy}>
              <AppText numberOfLines={1} style={styles.transactionFooterTitle}>
                Ver historial completo
              </AppText>
              <AppText numberOfLines={1} style={styles.transactionFooterDetail}>
                Abre todos los movimientos y filtros.
              </AppText>
            </View>
            <View style={styles.transactionFooterCta}>
              <AppText numberOfLines={1} style={styles.transactionFooterCtaText}>
                Abrir
              </AppText>
              <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
            </View>
          </Pressable>
        </Link>
      </View>
    </SectionBlock>
  );
}
