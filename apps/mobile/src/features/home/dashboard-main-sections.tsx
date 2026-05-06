import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SectionBlock } from '@/components/section-block';
import { dashboardStyles as styles } from '@/features/home/dashboard-screen.styles';
import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';
import { PersonTile, ShortcutTile, TransactionPreviewCard } from './dashboard-preview-cards';

export function DashboardPeopleSection({
  activePeople,
  inviteRequestCount,
  onAddPerson,
  onOpenInviteRequests,
}: {
  readonly activePeople: readonly PersonCardDto[];
  readonly inviteRequestCount: number;
  readonly onAddPerson: () => void;
  readonly onOpenInviteRequests: () => void;
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
            <Text style={styles.peopleSectionActionText}>Ver todas</Text>
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
        <ShortcutTile
          badgeCount={inviteRequestCount}
          icon="person-add-outline"
          label="Solicitudes"
          onPress={onOpenInviteRequests}
        />
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
  readonly onOpenItem: (item: ActivityItemDto, isPending: boolean) => void;
  readonly people: readonly PersonCardDto[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <SectionBlock
      action={
        <Link href="/transactions" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.peopleSectionAction,
              pressed ? styles.quickActionPressed : null,
            ]}
          >
            <Text style={styles.peopleSectionActionText}>Ver todas</Text>
          </Pressable>
        </Link>
      }
      title="Transacciones"
    >
      <View style={styles.transactionList}>
        {items.map(({ highlightPending, isPending, item, unread }) => (
          <TransactionPreviewCard
            highlightPending={highlightPending}
            isPending={isPending}
            item={item}
            key={item.id}
            onPress={() => onOpenItem(item, isPending)}
            people={people}
            unread={unread}
          />
        ))}
      </View>
    </SectionBlock>
  );
}
