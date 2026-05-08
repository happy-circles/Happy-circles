import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SurfaceCard } from '@/components/surface-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { useAppSnapshot } from '@/lib/live-data';
import { theme } from '@/lib/theme';
import {
  isCycleTransactionItem,
  transactionAmountIsVoided,
  transactionAmountLabel,
  transactionDirectionLabel,
  transactionFocusId,
  transactionMetaLabel,
  transactionShouldSurfaceStatus,
  transactionStatusLabel,
  transactionStatusTone,
  transactionToneColor,
  transactionVisualCategory,
} from '@/lib/transaction-presentation';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import {
  firstName,
  formatCompactCop,
  signedFormatCompactCop,
} from '@/features/balance/balance-helpers';
import { AddPersonContactsSheet } from '@/features/home/add-person-contacts-sheet';
import { InviteRequestsSheet } from '@/features/home/dashboard-invite-requests-sheet';
import { PendingTransactionCard } from '@/features/transactions/transactions-pending-card';
import { buildLatestHistoryCaseItems, isHistoryCaseItem } from '@/lib/history-cases';
import {
  parseInviteRequestsTabParam,
  usePeopleInviteRequestsController,
} from '@/features/people/use-people-invite-requests-controller';
import {
  PEOPLE_INSIGHT_OPTIONS,
  activityMatchesPersonId,
  activityMatchesQuery,
  buildPeopleInsightActivitySections,
  buildPeopleInsightRanking,
  buildPeopleInsightRows,
  normalizePeopleInsightFilter,
  peopleInsightEmptyDescription,
  peopleInsightEmptyTitle,
  peopleInsightLabel,
  personIdFromActivityHref,
  type PeopleInsightFilter,
  type PeopleInsightPerson,
  type PeopleInsightTone,
} from './people-insights';

const AVATAR_COLORS = ['#c026d3', '#047857', '#2563eb', '#334155', '#dc2626', '#7c3aed'];
const CIRCLE_COLOR = '#2563eb';
const CIRCLE_SOFT_COLOR = '#eaf1ff';
const PENDING_COLOR = '#ca8a04';
const PENDING_SOFT_COLOR = '#fef3c7';

function inviteRequestsSummary(receivedCount: number, sentCount: number): string {
  if (receivedCount > 0) {
    return receivedCount === 1
      ? '1 solicitud por revisar'
      : `${receivedCount} solicitudes por revisar`;
  }

  return sentCount === 1 ? '1 solicitud enviada' : `${sentCount} solicitudes enviadas`;
}

function insightToneColor(tone: PeopleInsightTone): string {
  if (tone === 'positive') {
    return theme.colors.success;
  }

  if (tone === 'negative') {
    return theme.colors.warning;
  }

  if (tone === 'pending') {
    return PENDING_COLOR;
  }

  if (tone === 'cycle') {
    return CIRCLE_COLOR;
  }

  return theme.colors.primary;
}

function insightToneSoftColor(tone: PeopleInsightTone): string {
  if (tone === 'positive') {
    return theme.colors.successSoft;
  }

  if (tone === 'negative') {
    return theme.colors.warningSoft;
  }

  if (tone === 'pending') {
    return PENDING_SOFT_COLOR;
  }

  if (tone === 'cycle') {
    return CIRCLE_SOFT_COLOR;
  }

  return theme.colors.primarySoft;
}

function insightFilterTone(filter: PeopleInsightFilter): PeopleInsightTone {
  if (filter === 'owed_to_me') {
    return 'positive';
  }

  if (filter === 'i_owe') {
    return 'negative';
  }

  if (filter === 'pending') {
    return 'pending';
  }

  if (filter === 'circles') {
    return 'cycle';
  }

  return 'neutral';
}

function insightFilterIcon(filter: PeopleInsightFilter): keyof typeof Ionicons.glyphMap {
  if (filter === 'owed_to_me') {
    return 'arrow-down-outline';
  }

  if (filter === 'i_owe') {
    return 'arrow-up-outline';
  }

  if (filter === 'pending') {
    return 'time-outline';
  }

  if (filter === 'circles') {
    return 'sync-outline';
  }

  if (filter === 'movements') {
    return 'swap-horizontal-outline';
  }

  return 'wallet-outline';
}

function emptyMetricForFilter(filter: PeopleInsightFilter): string {
  if (filter === 'balance') {
    return signedFormatCompactCop(0);
  }

  if (filter === 'owed_to_me' || filter === 'i_owe') {
    return formatCompactCop(0);
  }

  if (filter === 'pending') {
    return '0';
  }

  if (filter === 'circles') {
    return '0 Circles';
  }

  return '0 mov.';
}

function emptyPersonInsight(
  person: PersonCardDto,
  filter: PeopleInsightFilter,
): PeopleInsightPerson {
  return {
    avatarUrl: person.avatarUrl ?? null,
    label: person.displayName,
    metricLabel: emptyMetricForFilter(filter),
    score: 0,
    tone: insightFilterTone(filter),
    userId: person.userId,
  };
}

function initialsBackgroundColor(person: Pick<PersonCardDto, 'userId' | 'displayName'>): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? theme.colors.primary;
}

function transactionPersonForItem(
  people: readonly PersonCardDto[],
  item: ActivityItemDto,
): PersonCardDto | undefined {
  const hrefPersonId = personIdFromActivityHref(item.href);
  if (hrefPersonId) {
    const matchedPerson = people.find((person) => person.userId === hrefPersonId);
    if (matchedPerson) {
      return matchedPerson;
    }
  }

  return people.find((person) => person.displayName === item.counterpartyLabel);
}

function transactionDetailHref(
  people: readonly PersonCardDto[],
  item: ActivityItemDto,
  panel: 'pending' | 'history',
): Href {
  if (item.kind === 'settlement_proposal') {
    return `/settlements/${item.id}` as Href;
  }

  const matchedPerson = transactionPersonForItem(people, item);
  const personId = matchedPerson?.userId ?? personIdFromActivityHref(item.href);

  if (!personId) {
    return (item.href ?? '/transactions') as Href;
  }

  return `/person/${personId}?panel=${panel}&focus=${encodeURIComponent(
    transactionFocusId(item),
  )}` as Href;
}

function PeopleInviteRequestsEntry({
  receivedCount,
  sentCount,
  onPress,
}: {
  readonly receivedCount: number;
  readonly sentCount: number;
  readonly onPress: () => void;
}) {
  const totalCount = receivedCount + sentCount;

  if (totalCount === 0) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={`Solicitudes. ${inviteRequestsSummary(receivedCount, sentCount)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.requestsEntry, pressed ? styles.pressed : null]}
    >
      <View style={styles.requestsEntryIcon}>
        <Ionicons color={theme.colors.primary} name="person-add-outline" size={19} />
      </View>
      <View style={styles.requestsEntryCopy}>
        <AppText numberOfLines={1} style={styles.requestsEntryTitle}>
          Solicitudes
        </AppText>
        <AppText numberOfLines={1} style={styles.requestsEntryDetail}>
          {inviteRequestsSummary(receivedCount, sentCount)}
        </AppText>
      </View>
      <View style={styles.requestsEntryCta}>
        <AppText numberOfLines={1} style={styles.requestsEntryCtaText}>
          Revisar
        </AppText>
        <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}

function FilterPill({
  icon,
  label,
  onPress,
  selected,
  tone,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly tone: PeopleInsightTone;
}) {
  const color = insightToneColor(tone);
  const softColor = insightToneSoftColor(tone);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterPill,
        selected
          ? [styles.filterPillSelected, { backgroundColor: softColor, borderColor: color }]
          : null,
        pressed ? styles.filterPillPressed : null,
      ]}
    >
      <View style={[styles.filterPillIcon, selected ? { backgroundColor: color } : null]}>
        <Ionicons color={selected ? theme.colors.white : color} name={icon} size={14} />
      </View>
      <AppText style={[styles.filterPillText, selected ? { color } : null]}>
        {label}
      </AppText>
    </Pressable>
  );
}

function PeopleInsightPodiumCard({
  activeFilter,
  onClearPerson,
  onSelectPerson,
  ranking,
  selectedPerson,
  selectedPersonId,
}: {
  readonly activeFilter: PeopleInsightFilter;
  readonly onClearPerson: () => void;
  readonly onSelectPerson: (personId: string) => void;
  readonly ranking: readonly PeopleInsightPerson[];
  readonly selectedPerson: PeopleInsightPerson | null;
  readonly selectedPersonId: string | null;
}) {
  const headline = peopleInsightLabel(activeFilter);
  const activeTone = insightFilterTone(activeFilter);
  const activeColor = insightToneColor(activeTone);
  const activeSoftColor = insightToneSoftColor(activeTone);
  const activeIcon = insightFilterIcon(activeFilter);
  const metricCopy = selectedPerson ? 'Filtro activo' : 'Top 3';

  return (
    <View style={styles.insightModule}>
      <View style={styles.insightHeader}>
        <View style={styles.insightHeaderCopy}>
          <View style={[styles.insightIconBubble, { backgroundColor: activeSoftColor }]}>
            <Ionicons color={activeColor} name={activeIcon} size={18} />
          </View>
          <AppText numberOfLines={1} style={styles.insightTitle}>
            {metricCopy}
          </AppText>
        </View>
        <View
          style={[
            styles.insightPill,
            { backgroundColor: activeSoftColor, borderColor: activeColor },
          ]}
        >
          <Ionicons color={activeColor} name={activeIcon} size={13} />
          <AppText numberOfLines={1} style={[styles.insightPillText, { color: activeColor }]}>
            {headline}
          </AppText>
        </View>
      </View>

      {selectedPerson ? (
        <View style={styles.selectedPersonHero}>
          <View
            style={[
              styles.selectedPersonAvatarRing,
              { borderColor: insightToneColor(selectedPerson.tone) },
            ]}
          >
            <AppAvatar
              fallbackBackgroundColor={insightToneSoftColor(selectedPerson.tone)}
              fallbackTextColor={insightToneColor(selectedPerson.tone)}
              imageUrl={selectedPerson.avatarUrl ?? null}
              label={selectedPerson.label}
              size={64}
            />
          </View>
          <View style={styles.selectedPersonHeroCopy}>
            <AppText numberOfLines={1} style={styles.selectedPersonHeroName}>
              {selectedPerson.label}
            </AppText>
            <View
              style={[
                styles.selectedPersonMetricPill,
                { backgroundColor: insightToneSoftColor(selectedPerson.tone) },
              ]}
            >
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                numberOfLines={1}
                style={[
                  styles.selectedPersonMetricText,
                  { color: insightToneColor(selectedPerson.tone) },
                ]}
              >
                {selectedPerson.metricLabel}
              </AppText>
            </View>
          </View>
          <Pressable
            accessibilityLabel={`Quitar filtro de ${selectedPerson.label}`}
            accessibilityRole="button"
            onPress={() => {
              triggerAppSelectionHaptic();
              onClearPerson();
            }}
            style={({ pressed }) => [styles.clearPersonButton, pressed ? styles.pressed : null]}
          >
            <Ionicons color={theme.colors.textMuted} name="close" size={18} />
          </Pressable>
        </View>
      ) : ranking.length === 0 ? (
        <View style={styles.emptyPodium}>
          <Ionicons color={theme.colors.textMuted} name="podium-outline" size={22} />
          <AppText style={styles.emptyPodiumText}>Aun no hay suficiente historial.</AppText>
        </View>
      ) : (
        <View style={styles.podiumRow}>
          {ranking.map((person, index) => {
            const rank = index + 1;
            const color = insightToneColor(person.tone);
            const softColor = insightToneSoftColor(person.tone);
            const selected = person.userId === selectedPersonId;

            return (
              <Pressable
                accessibilityLabel={`Filtrar movimientos de ${person.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={person.userId}
                onPress={() => {
                  triggerAppSelectionHaptic();
                  onSelectPerson(person.userId);
                }}
                style={({ pressed }) => [
                  styles.podiumSlot,
                  rank === 1 ? styles.podiumSlotFirst : null,
                  selected ? styles.podiumSlotSelected : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={[styles.rankBadge, { backgroundColor: softColor }]}>
                  <AppText style={[styles.rankBadgeText, { color }]}>{rank}</AppText>
                </View>
                <View style={[styles.podiumAvatarRing, { borderColor: color }]}>
                  <AppAvatar
                    fallbackBackgroundColor={softColor}
                    fallbackTextColor={color}
                    imageUrl={person.avatarUrl ?? null}
                    label={person.label}
                    size={rank === 1 ? 60 : 52}
                  />
                </View>
                <View style={[styles.podiumMetricPill, { backgroundColor: softColor }]}>
                  <AppText
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    numberOfLines={1}
                    style={[styles.podiumMetricText, { color }]}
                  >
                    {person.metricLabel}
                  </AppText>
                </View>
                <AppText numberOfLines={1} style={styles.podiumName}>
                  {firstName(person.label)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function PersonInsightRow({
  actionIcon = 'funnel-outline',
  meta,
  onPress,
  person,
}: {
  readonly actionIcon?: keyof typeof Ionicons.glyphMap;
  readonly meta?: string;
  readonly onPress: () => void;
  readonly person: PeopleInsightPerson;
}) {
  const color = insightToneColor(person.tone);
  const softColor = insightToneSoftColor(person.tone);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <SurfaceCard
        padding="md"
        style={[
          styles.personCard,
          person.tone === 'positive' ? styles.personCardPositive : null,
          person.tone === 'negative' ? styles.personCardNegative : null,
          person.tone === 'pending' ? styles.personCardPending : null,
          person.tone === 'cycle' ? styles.personCardCycle : null,
        ]}
      >
        <View style={styles.personLeading}>
          <AppAvatar
            fallbackBackgroundColor={softColor}
            fallbackTextColor={color}
            imageUrl={person.avatarUrl ?? null}
            label={person.label}
            size={42}
          />
          <View style={styles.personCopy}>
            <AppText numberOfLines={1} style={styles.personTitle}>
              {person.label}
            </AppText>
            {meta ? (
              <AppText numberOfLines={1} style={styles.personMeta}>
                {meta}
              </AppText>
            ) : null}
          </View>
        </View>

        <View style={styles.personTrailing}>
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            numberOfLines={1}
            style={[styles.personAmount, { color }]}
          >
            {person.metricLabel}
          </AppText>
          <Ionicons color={theme.colors.textMuted} name={actionIcon} size={15} />
        </View>
      </SurfaceCard>
    </Pressable>
  );
}

function HistoryTransactionCard({
  item,
  people,
}: {
  readonly item: ActivityItemDto;
  readonly people: readonly PersonCardDto[];
}) {
  const isSystemTransaction = isCycleTransactionItem(item);
  const matchedPerson = transactionPersonForItem(people, item);
  const actorLabel = isSystemTransaction ? 'Happy Circle' : (item.counterpartyLabel ?? 'Persona');
  const fallbackPerson = {
    displayName: actorLabel,
    userId: matchedPerson?.userId ?? item.id,
  };

  return (
    <TransactionEventCard
      accentColor={transactionToneColor(item)}
      actorAvatarUrl={isSystemTransaction ? null : (matchedPerson?.avatarUrl ?? null)}
      actorAvatarVariant={isSystemTransaction ? 'system' : 'person'}
      actorFallbackColor={
        isSystemTransaction ? transactionToneColor(item) : initialsBackgroundColor(fallbackPerson)
      }
      actorLabel={actorLabel}
      amountColor={transactionToneColor(item)}
      amountLabel={transactionAmountLabel(item)}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={transactionVisualCategory(item)}
      categoryPlacement="meta"
      compact
      compactMetaLayout="inline"
      context={transactionDirectionLabel(item)}
      contextVariant="badge"
      href={transactionDetailHref(people, item, 'history')}
      meta={transactionMetaLabel(item)}
      statusLabel={
        transactionShouldSurfaceStatus(item, { density: 'list' })
          ? transactionStatusLabel(item)
          : null
      }
      statusTone={transactionStatusTone(item)}
    />
  );
}

export function PeopleIndexScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    addPerson?: string;
    amountMinor?: string;
    description?: string;
    direction?: string;
    filter?: string | string[];
    requests?: string;
    requestTab?: string;
  }>();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const people = snapshotQuery.data?.dashboard.activePeople ?? snapshotQuery.data?.people ?? [];
  const currentUserProfile = snapshotQuery.data?.currentUserProfile ?? null;
  const inviteRequests = usePeopleInviteRequestsController({
    accountInviteHistoryItems: snapshotQuery.data?.accountInviteHistoryItems ?? [],
    accountInvitePendingItems: snapshotQuery.data?.accountInvitePendingItems ?? [],
    friendshipHistoryItems: snapshotQuery.data?.friendshipHistoryItems ?? [],
    friendshipPendingItems: snapshotQuery.data?.friendshipPendingItems ?? [],
  });
  const openInviteRequests = inviteRequests.open;
  const preferredInviteTab = inviteRequests.preferredTab;
  const routeFilter = normalizePeopleInsightFilter(params.filter);
  const [activeFilter, setActiveFilter] = useState<PeopleInsightFilter>(routeFilter);
  const activeFilterRef = useRef(activeFilter);
  const [query, setQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [addPersonSheetVisible, setAddPersonSheetVisible] = useState(false);
  const handledRequestParamRef = useRef<string | null>(null);
  const analyticsAllPeriod = snapshotQuery.data?.balanceAnalytics.periods.all ?? null;
  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = sections.find((section) => section.key === 'pending');
  const historySection = sections.find((section) => section.key === 'history');
  const insightSections = useMemo(
    () =>
      buildPeopleInsightActivitySections({
        filter: activeFilter,
        historyItems: historySection?.items ?? [],
        pendingItems: pendingSection?.items ?? [],
      }),
    [activeFilter, historySection?.items, pendingSection?.items],
  );
  const personRows = useMemo(
    () =>
      buildPeopleInsightRows({
        activeCircleProposals: analyticsAllPeriod?.settlements.activeProposals ?? [],
        analyticsPeople: analyticsAllPeriod?.people ?? [],
        filter: activeFilter,
        historyItems: historySection?.items ?? [],
        pendingItems: pendingSection?.items ?? [],
        people,
      }),
    [
      activeFilter,
      analyticsAllPeriod?.people,
      analyticsAllPeriod?.settlements.activeProposals,
      historySection?.items,
      pendingSection?.items,
      people,
    ],
  );
  const ranking = useMemo(
    () =>
      buildPeopleInsightRanking({
        activeCircleProposals: analyticsAllPeriod?.settlements.activeProposals ?? [],
        analyticsPeople: analyticsAllPeriod?.people ?? [],
        filter: activeFilter,
        historyItems: historySection?.items ?? [],
        pendingItems: pendingSection?.items ?? [],
        people,
      }),
    [
      activeFilter,
      analyticsAllPeriod?.people,
      analyticsAllPeriod?.settlements.activeProposals,
      historySection?.items,
      pendingSection?.items,
      people,
    ],
  );
  const selectedRawPerson = selectedPersonId
    ? (people.find((person) => person.userId === selectedPersonId) ?? null)
    : null;
  const selectedPerson =
    personRows.find((person) => person.userId === selectedPersonId) ??
    (selectedRawPerson ? emptyPersonInsight(selectedRawPerson, activeFilter) : null);
  const selectedActivityPersonId = selectedPerson?.userId ?? null;
  const visiblePersonRows = personRows.filter((person) =>
    query.trim().length === 0
      ? true
      : person.label.toLocaleLowerCase('es-CO').includes(query.trim().toLocaleLowerCase('es-CO')),
  );
  const visiblePendingItems = insightSections.pending.filter(
    (item) =>
      activityMatchesQuery(item, query) &&
      activityMatchesPersonId(item, people, selectedActivityPersonId),
  );
  const visibleHistoryItems = insightSections.history.filter(
    (item) =>
      activityMatchesQuery(item, query) &&
      activityMatchesPersonId(item, people, selectedActivityPersonId),
  );
  const visibleHistoryCaseItems = buildLatestHistoryCaseItems(
    visibleHistoryItems.filter(isHistoryCaseItem),
  );
  const hasSelectedPerson = selectedActivityPersonId !== null;
  const hasVisibleActivity = visiblePendingItems.length > 0 || visibleHistoryCaseItems.length > 0;
  const selectedPendingSectionTitle =
    activeFilter === 'circles' ? 'Circles activos' : 'Pendientes';
  const selectedHistorySectionTitle =
    activeFilter === 'circles' ? 'Historial de Circles' : 'Historial';
  const hasAnyRelationshipContext =
    people.length > 0 ||
    insightSections.pending.length > 0 ||
    insightSections.history.length > 0 ||
    inviteRequests.receivedItems.length + inviteRequests.sentItems.length > 0;
  const transactionContext = useMemo(() => {
    const amountMinor =
      typeof params.amountMinor === 'string' ? Number.parseInt(params.amountMinor, 10) : Number.NaN;
    const direction: 'i_owe' | 'owes_me' | null =
      params.direction === 'i_owe' ? 'i_owe' : params.direction === 'owes_me' ? 'owes_me' : null;

    if (!Number.isFinite(amountMinor) || amountMinor <= 0 || !direction) {
      return null;
    }

    return {
      amountMinor,
      description: typeof params.description === 'string' ? params.description : null,
      direction,
    };
  }, [params.amountMinor, params.description, params.direction]);

  useEffect(() => {
    activeFilterRef.current = activeFilter;
  }, [activeFilter]);

  useEffect(() => {
    if (routeFilter === activeFilterRef.current) {
      return;
    }

    activeFilterRef.current = routeFilter;
    setActiveFilter(routeFilter);
    setSelectedPersonId(null);
  }, [routeFilter]);

  function changePeopleFilter(nextFilter: PeopleInsightFilter) {
    triggerAppSelectionHaptic();
    activeFilterRef.current = nextFilter;
    setActiveFilter(nextFilter);
    router.setParams({ filter: nextFilter });
  }

  useEffect(() => {
    if (params.addPerson === '1') {
      setAddPersonSheetVisible(true);
    }
  }, [params.addPerson]);

  useEffect(() => {
    if (params.requests !== '1') {
      return;
    }

    const requestKey = `${params.requests}:${params.requestTab ?? ''}`;
    if (handledRequestParamRef.current === requestKey) {
      return;
    }

    handledRequestParamRef.current = requestKey;
    openInviteRequests(parseInviteRequestsTabParam(params.requestTab) ?? preferredInviteTab);
  }, [openInviteRequests, params.requestTab, params.requests, preferredInviteTab]);

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} title="Personas">
        <View style={styles.loadingMotion}>
          <HappyCirclesMotion size={108} variant="loading" />
        </View>
        <AppText style={styles.supportText}>Estamos cargando tu red real.</AppText>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} refresh={refresh} title="Personas">
        <AppText style={styles.supportText}>{snapshotQuery.error.message}</AppText>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      headerSlot={
        <Pressable
          onPress={() => setAddPersonSheetVisible(true)}
          style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
        >
          <Ionicons color={theme.colors.text} name="person-add-outline" size={18} />
        </Pressable>
      }
      headerVariant="plain"
      largeTitle={false}
      refresh={refresh}
      title="Personas"
    >
      <PeopleInsightPodiumCard
        activeFilter={activeFilter}
        onClearPerson={() => setSelectedPersonId(null)}
        onSelectPerson={(personId) =>
          setSelectedPersonId((currentPersonId) => (currentPersonId === personId ? null : personId))
        }
        ranking={ranking}
        selectedPerson={selectedPerson}
        selectedPersonId={selectedActivityPersonId}
      />

      <View style={styles.filterStack}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRail}
        >
          {PEOPLE_INSIGHT_OPTIONS.map((option) => (
            <FilterPill
              icon={insightFilterIcon(option.value)}
              key={option.value}
              label={option.label}
              onPress={() => {
                changePeopleFilter(option.value);
              }}
              selected={activeFilter === option.value}
              tone={insightFilterTone(option.value)}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons color={theme.colors.textMuted} name="search-outline" size={18} />
        <AppTextInput
          autoCapitalize="sentences"
          clearButtonMode="while-editing"
          chrome="plain"
          density="compact"
          onChangeText={setQuery}
          placeholder={hasSelectedPerson ? 'Buscar movimiento' : 'Buscar persona'}
          placeholderTextColor={theme.colors.muted}
          style={styles.searchInput}
          value={query}
        />
      </View>

      <PeopleInviteRequestsEntry
        onPress={() => openInviteRequests()}
        receivedCount={inviteRequests.receivedItems.length}
        sentCount={inviteRequests.sentItems.length}
      />

      {!hasAnyRelationshipContext ? (
        <EmptyState
          description={noActiveRelationshipsEmptyState.description}
          title={noActiveRelationshipsEmptyState.title}
        />
      ) : hasSelectedPerson && selectedPerson ? (
        <>
          {!hasVisibleActivity ? (
            <EmptyState
              description={
                query.trim().length > 0
                  ? 'Prueba con otro texto o borra la busqueda para ver su historial.'
                  : peopleInsightEmptyDescription(activeFilter)
              }
              title={
                query.trim().length > 0
                  ? 'No encontramos movimientos'
                  : peopleInsightEmptyTitle(activeFilter)
              }
            />
          ) : null}

          {visiblePendingItems.length > 0 ? (
            <SectionBlock title={selectedPendingSectionTitle}>
              <View style={styles.list}>
                {visiblePendingItems.map((item) => (
                  <PendingTransactionCard
                    item={item}
                    key={item.id}
                    people={people}
                    unread={false}
                  />
                ))}
              </View>
            </SectionBlock>
          ) : null}

          {visibleHistoryCaseItems.length > 0 ? (
            <SectionBlock title={selectedHistorySectionTitle}>
              <View style={styles.list}>
                {visibleHistoryCaseItems.map((item) => (
                  <HistoryTransactionCard item={item} key={item.id} people={people} />
                ))}
              </View>
            </SectionBlock>
          ) : null}
        </>
      ) : visiblePersonRows.length === 0 ? (
        <EmptyState
          description={
            query.trim().length > 0
              ? 'Prueba con otro nombre o borra la busqueda para ver tus personas.'
              : peopleInsightEmptyDescription(activeFilter)
          }
          title={
            query.trim().length > 0
              ? 'No encontramos personas'
              : peopleInsightEmptyTitle(activeFilter)
          }
        />
      ) : (
        <View style={styles.list}>
          {visiblePersonRows.map((person) => (
            <PersonInsightRow
              key={person.userId}
              onPress={() => {
                triggerAppSelectionHaptic();
                setSelectedPersonId(person.userId);
              }}
              person={person}
            />
          ))}
        </View>
      )}

      <AddPersonContactsSheet
        currentUserAvatarUrl={currentUserProfile?.avatarUrl ?? null}
        currentUserLabel={currentUserProfile?.displayName ?? currentUserProfile?.email ?? 'Tu'}
        onClose={() => setAddPersonSheetVisible(false)}
        transactionContext={transactionContext}
        visible={addPersonSheetVisible}
      />
      <InviteRequestsSheet
        activeTab={inviteRequests.activeTab}
        busyKey={inviteRequests.busyKey}
        historyItems={inviteRequests.historyItems}
        message={inviteRequests.message}
        onAction={(item, action) => void inviteRequests.handleAction(item, action)}
        onChangeTab={inviteRequests.setActiveTab}
        onClose={inviteRequests.close}
        receivedItems={inviteRequests.receivedItems}
        sentItems={inviteRequests.sentItems}
        visible={inviteRequests.visible}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  loadingMotion: {
    alignItems: 'center',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.62,
  },
  insightModule: {
    gap: theme.spacing.sm,
    paddingHorizontal: 2,
    paddingTop: theme.spacing.xs,
  },
  insightHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  insightHeaderCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  insightIconBubble: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  insightEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 15,
    textTransform: 'uppercase',
  },
  insightTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
    lineHeight: 21,
  },
  insightPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.primaryGhost,
    borderColor: 'rgba(26, 39, 68, 0.12)',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    maxWidth: 116,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  insightPillText: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 15,
  },
  emptyPodium: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.large,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: theme.spacing.xs,
    justifyContent: 'center',
    minHeight: 118,
    padding: theme.spacing.lg,
  },
  emptyPodiumText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  podiumRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
    minHeight: 154,
  },
  podiumSlot: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: theme.radius.large,
    flex: 1,
    gap: 6,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: theme.spacing.xs,
  },
  podiumSlotFirst: {
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
    paddingTop: theme.spacing.sm,
  },
  podiumSlotSelected: {
    backgroundColor: theme.colors.surface,
  },
  rankBadge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  rankBadgeText: {
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 15,
  },
  podiumAvatarRing: {
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    padding: 3,
  },
  podiumMetricPill: {
    borderRadius: theme.radius.pill,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  podiumMetricText: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    textAlign: 'center',
  },
  podiumName: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
    lineHeight: 17,
    maxWidth: '100%',
    textAlign: 'center',
  },
  selectedPersonHero: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 88,
    padding: theme.spacing.sm,
  },
  selectedPersonAvatarRing: {
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    padding: 3,
  },
  selectedPersonHeroCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  selectedPersonHeroName: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
    lineHeight: 21,
  },
  selectedPersonMetricPill: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedPersonMetricText: {
    fontSize: theme.typography.footnote,
    fontWeight: '900',
    lineHeight: 16,
  },
  clearPersonButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  personCard: {
    alignItems: 'center',
    borderLeftColor: theme.colors.textMuted,
    borderLeftWidth: 3,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  personCardPositive: {
    borderLeftColor: theme.colors.success,
  },
  personCardNegative: {
    borderLeftColor: theme.colors.warning,
  },
  personCardPending: {
    borderLeftColor: PENDING_COLOR,
  },
  personCardCycle: {
    borderLeftColor: CIRCLE_COLOR,
  },
  personLeading: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  personCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  personTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  personMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  personTrailing: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
    maxWidth: 148,
  },
  personAmount: {
    flexShrink: 1,
    fontSize: theme.typography.callout,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'right',
  },
  filterStack: {
    marginTop: -theme.spacing.xs,
  },
  filterRail: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.lg,
  },
  filterPill: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  filterPillSelected: {
    backgroundColor: theme.colors.primaryGhost,
  },
  filterPillPressed: {
    opacity: 0.76,
  },
  filterPillIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  filterPillText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    minHeight: 52,
    paddingHorizontal: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
  },
  list: {
    gap: theme.spacing.sm,
  },
  requestsEntry: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: 62,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  requestsEntryIcon: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  requestsEntryCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  requestsEntryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 18,
  },
  requestsEntryDetail: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  requestsEntryCta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  requestsEntryCtaText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
  },
});
