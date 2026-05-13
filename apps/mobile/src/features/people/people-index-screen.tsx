import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Animated, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BrandedRefreshControl } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { LoopingInsightSwitcher } from '@/components/looping-insight-switcher';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SurfaceCard } from '@/components/surface-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { prefetchAvatarPaths } from '@/lib/avatar-prefetch';
import { useAppSnapshot } from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { theme, type AppTheme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';
import {
  isCycleTransactionItem,
  transactionAmountIsVoided,
  transactionAmountLabel,
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
import {
  inviteRequestPersonHrefAfterSuccessfulAction,
  type InviteRequestAction,
  type InviteRequestItem,
} from '@/features/home/dashboard-helpers';
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
  buildPeopleInsightRowsByFilter,
  normalizePeopleInsightFilter,
  peopleInsightEmptyDescription,
  peopleInsightEmptyTitle,
  personIdFromActivityHref,
  type PeopleInsightFilter,
  type PeopleInsightPerson,
  type PeopleInsightTone,
} from './people-insights';

const METRIC_CAROUSEL_ITEM_GAP = 10;
const METRIC_CAROUSEL_ITEM_WIDTH = 104;
const PEOPLE_INSIGHT_FALLBACK_WIDTH = 344;
const PEOPLE_INSIGHT_BODY_HEIGHT = 202;
const PODIUM_VISUAL_ORDER = [2, 1, 3] as const;
const PEOPLE_INSIGHT_FILTER_VALUES = PEOPLE_INSIGHT_OPTIONS.map((option) => option.value);
const PEOPLE_SCREEN_VISIBLE_AVATAR_PREFETCH_LIMIT = 12;

type PodiumRank = (typeof PODIUM_VISUAL_ORDER)[number];

type PodiumVisualItem = {
  readonly displayRank: PodiumRank | null;
  readonly isDimmed: boolean;
  readonly isFocused: boolean;
  readonly isOutsideRanking: boolean;
  readonly key: string;
  readonly person: PeopleInsightPerson | null;
  readonly visualPlace: PodiumRank;
};

function PeopleListSeparator() {
  return <View style={styles.peopleListSeparator} />;
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

function compactPeopleInsightLabel(filter: PeopleInsightFilter): string {
  if (filter === 'pending') {
    return 'Pend.';
  }

  if (filter === 'rejected') {
    return 'Rech.';
  }

  if (filter === 'movements') {
    return 'Movs.';
  }

  return PEOPLE_INSIGHT_OPTIONS.find((option) => option.value === filter)?.label ?? 'Balance';
}

function podiumVisualItems(
  ranking: readonly PeopleInsightPerson[],
  selectedPerson: PeopleInsightPerson | null,
): readonly PodiumVisualItem[] {
  const peopleByRank = new Map<PodiumRank, PeopleInsightPerson>();

  ranking.slice(0, 3).forEach((person, index) => {
    peopleByRank.set((index + 1) as PodiumRank, person);
  });

  if (!selectedPerson) {
    return PODIUM_VISUAL_ORDER.map((rank) => ({
      displayRank: rank,
      isDimmed: false,
      isFocused: false,
      isOutsideRanking: false,
      key: peopleByRank.get(rank)?.userId ?? `empty-${rank}`,
      person: peopleByRank.get(rank) ?? null,
      visualPlace: rank,
    }));
  }

  const selectedRank =
    PODIUM_VISUAL_ORDER.find((rank) => peopleByRank.get(rank)?.userId === selectedPerson.userId) ??
    null;
  const contextItems = ([1, 2, 3] as const)
    .filter((rank) => rank !== selectedRank)
    .map((rank) => ({ displayRank: rank, person: peopleByRank.get(rank) ?? null }))
    .filter((item) => item.person?.userId !== selectedPerson.userId);
  const leftContext = contextItems[0] ?? null;
  const rightContext = contextItems[1] ?? null;

  return [
    {
      displayRank: leftContext?.displayRank ?? 2,
      isDimmed: true,
      isFocused: false,
      isOutsideRanking: false,
      key: leftContext?.person?.userId ?? 'empty-left',
      person: leftContext?.person ?? null,
      visualPlace: 2,
    },
    {
      displayRank: selectedRank,
      isDimmed: false,
      isFocused: true,
      isOutsideRanking: selectedRank === null,
      key: selectedPerson.userId,
      person: selectedPerson,
      visualPlace: 1,
    },
    {
      displayRank: rightContext?.displayRank ?? 3,
      isDimmed: true,
      isFocused: false,
      isOutsideRanking: false,
      key: rightContext?.person?.userId ?? 'empty-right',
      person: rightContext?.person ?? null,
      visualPlace: 3,
    },
  ];
}

function inviteRequestsSummary(receivedCount: number, sentCount: number): string {
  if (receivedCount > 0) {
    return receivedCount === 1
      ? '1 solicitud por revisar'
      : `${receivedCount} solicitudes por revisar`;
  }

  return sentCount === 1 ? '1 solicitud enviada' : `${sentCount} solicitudes enviadas`;
}

function insightToneColor(tone: PeopleInsightTone, activeTheme: AppTheme = theme): string {
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

function insightToneSoftColor(tone: PeopleInsightTone, activeTheme: AppTheme = theme): string {
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

  if (filter === 'rejected') {
    return 'danger';
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

  if (filter === 'rejected') {
    return 'close-circle-outline';
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

  if (filter === 'rejected') {
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

function initialsBackgroundColor(
  person: Pick<PersonCardDto, 'userId' | 'displayName'>,
  activeTheme: AppTheme = theme,
): string {
  const source = `${person.userId}:${person.displayName}`;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return (
    activeTheme.palette.avatar[hash % activeTheme.palette.avatar.length] ??
    activeTheme.colors.primary
  );
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
  const activeTheme = useAppTheme();
  const totalCount = receivedCount + sentCount;

  if (totalCount === 0) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={`Solicitudes. ${inviteRequestsSummary(receivedCount, sentCount)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.requestsEntry,
        {
          backgroundColor: activeTheme.colors.surface,
          borderColor: activeTheme.colors.border,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.requestsEntryIcon, { backgroundColor: activeTheme.colors.primarySoft }]}>
        <Ionicons color={activeTheme.colors.primary} name="person-add-outline" size={19} />
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
        <Ionicons color={activeTheme.colors.textMuted} name="chevron-forward" size={16} />
      </View>
    </Pressable>
  );
}

function PeopleInsightSwitcher({
  activeFilter,
  onChange,
  renderPage,
}: {
  readonly activeFilter: PeopleInsightFilter;
  readonly onChange: (filter: PeopleInsightFilter) => void;
  readonly renderPage: (filter: PeopleInsightFilter) => ReactNode;
}) {
  const activeTheme = useAppTheme();
  return (
    <LoopingInsightSwitcher
      activeValue={activeFilter}
      colorForValue={(value) => insightToneColor(insightFilterTone(value), activeTheme)}
      compactLabelForValue={compactPeopleInsightLabel}
      fallbackWidth={PEOPLE_INSIGHT_FALLBACK_WIDTH}
      iconForValue={insightFilterIcon}
      itemGap={METRIC_CAROUSEL_ITEM_GAP}
      itemWidth={METRIC_CAROUSEL_ITEM_WIDTH}
      onChange={onChange}
      options={PEOPLE_INSIGHT_OPTIONS}
      renderPage={renderPage}
      styles={styles}
      values={PEOPLE_INSIGHT_FILTER_VALUES}
    />
  );
}

function PeopleInsightPodiumCard({
  activeFilter,
  onSelectPerson,
  ranking,
  selectedPerson,
  selectedPersonId,
}: {
  readonly activeFilter: PeopleInsightFilter;
  readonly onSelectPerson: (personId: string) => void;
  readonly ranking: readonly PeopleInsightPerson[];
  readonly selectedPerson: PeopleInsightPerson | null;
  readonly selectedPersonId: string | null;
}) {
  const activeTheme = useAppTheme();
  const bodyProgress = useRef(new Animated.Value(1)).current;
  const podiumItems = useMemo(
    () => podiumVisualItems(ranking, selectedPerson),
    [ranking, selectedPerson],
  );
  const bodyTransitionKey = selectedPerson
    ? `person:${selectedPerson.userId}:${activeFilter}`
    : `top:${activeFilter}:${ranking.map((person) => person.userId).join('|')}`;

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
            const { displayRank, isDimmed, isFocused, isOutsideRanking, key, person, visualPlace } =
              item;
            const color = person
              ? insightToneColor(person.tone, activeTheme)
              : activeTheme.colors.textMuted;
            const softColor = person
              ? insightToneSoftColor(person.tone, activeTheme)
              : activeTheme.colors.surfaceMuted;
            const selected = person?.userId === selectedPersonId;
            const stepStyle = podiumStepStyleForPlace(visualPlace);
            const rankLabel = displayRank === null ? 'Filtro' : String(displayRank);

            if (!person) {
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
                  <View style={styles.podiumAvatarWrap}>
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
                        styles.podiumAvatarRing,
                        styles.podiumAvatarRingEmpty,
                        { borderColor: activeTheme.colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.emptyPodiumAvatar,
                          visualPlace === 1 ? styles.emptyPodiumAvatarFirst : null,
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

            return (
              <Pressable
                accessibilityLabel={`Filtrar movimientos de ${person.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={key}
                onPress={() => {
                  triggerAppSelectionHaptic();
                  onSelectPerson(person.userId);
                }}
                style={({ pressed }) => [
                  styles.podiumSlot,
                  visualPlace === 1 ? styles.podiumSlotFirst : null,
                  isFocused ? styles.podiumSlotFocused : null,
                  isDimmed ? styles.podiumSlotDimmed : null,
                  selected && !isFocused ? styles.podiumSlotSelected : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={styles.podiumAvatarWrap}>
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
                      styles.podiumAvatarRing,
                      isFocused ? styles.podiumAvatarRingFocused : null,
                      { borderColor: color },
                    ]}
                  >
                    <AppAvatar
                      fallbackBackgroundColor={softColor}
                      fallbackTextColor={color}
                      imageUrl={person.avatarUrl ?? null}
                      label={person.label}
                      size={visualPlace === 1 ? 62 : 50}
                    />
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
                    {firstName(person.label)}
                  </AppText>
                  <AppText
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={[styles.podiumStepMetric, { color }]}
                  >
                    {person.metricLabel}
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
  const activeTheme = useAppTheme();
  const color = insightToneColor(person.tone, activeTheme);
  const softColor = insightToneSoftColor(person.tone, activeTheme);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <SurfaceCard
        padding="md"
        style={[
          styles.personCard,
          {
            backgroundColor: activeTheme.colors.surface,
            borderColor: activeTheme.colors.hairline,
          },
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
          <Ionicons color={activeTheme.colors.textMuted} name={actionIcon} size={15} />
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
  const activeTheme = useAppTheme();
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
        isSystemTransaction
          ? transactionToneColor(item)
          : initialsBackgroundColor(fallbackPerson, activeTheme)
      }
      actorLabel={actorLabel}
      amountColor={transactionToneColor(item)}
      amountLabel={transactionAmountLabel(item)}
      amountStruckThrough={transactionAmountIsVoided(item)}
      category={transactionVisualCategory(item)}
      categoryPlacement="none"
      compact
      compactMetaLayout="inline"
      context=""
      href={transactionDetailHref(people, item, 'history')}
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

export function PeopleIndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeTheme = useAppTheme();
  const topInset = Math.max(0, insets.top);
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
  const personRowsByFilter = useMemo(
    () =>
      buildPeopleInsightRowsByFilter({
        activeCircleProposals: analyticsAllPeriod?.settlements.activeProposals ?? [],
        analyticsPeople: analyticsAllPeriod?.people ?? [],
        historyItems: historySection?.items ?? [],
        pendingItems: pendingSection?.items ?? [],
        people,
      }),
    [
      analyticsAllPeriod?.people,
      analyticsAllPeriod?.settlements.activeProposals,
      historySection?.items,
      pendingSection?.items,
      people,
    ],
  );

  function openInviteRequestPerson(href: Href) {
    inviteRequests.close();
    pushRoute(router, href);
  }

  async function handleInviteRequestAction(item: InviteRequestItem, action: InviteRequestAction) {
    const didCreateConnection = await inviteRequests.handleAction(item, action);
    const href = didCreateConnection
      ? inviteRequestPersonHrefAfterSuccessfulAction(item, action)
      : null;
    if (href) {
      openInviteRequestPerson(href);
    }
  }
  const personRows = personRowsByFilter[activeFilter];
  const rankingsByFilter = useMemo(() => {
    const nextRankings = {} as Record<PeopleInsightFilter, readonly PeopleInsightPerson[]>;

    for (const option of PEOPLE_INSIGHT_OPTIONS) {
      nextRankings[option.value] = personRowsByFilter[option.value].slice(0, 3);
    }

    return nextRankings;
  }, [personRowsByFilter]);
  const selectedRawPerson = selectedPersonId
    ? (people.find((person) => person.userId === selectedPersonId) ?? null)
    : null;
  const selectedPersonByFilter = useMemo(() => {
    const nextSelected = {} as Record<PeopleInsightFilter, PeopleInsightPerson | null>;

    for (const option of PEOPLE_INSIGHT_OPTIONS) {
      nextSelected[option.value] =
        personRowsByFilter[option.value].find((person) => person.userId === selectedPersonId) ??
        (selectedRawPerson ? emptyPersonInsight(selectedRawPerson, option.value) : null);
    }

    return nextSelected;
  }, [personRowsByFilter, selectedPersonId, selectedRawPerson]);
  const selectedPerson = selectedPersonByFilter[activeFilter];
  const selectedActivityPersonId = selectedPerson?.userId ?? null;
  const normalizedPeopleQuery = query.trim().toLocaleLowerCase('es-CO');
  const visiblePersonRows = useMemo(
    () =>
      personRows.filter((person) =>
        normalizedPeopleQuery.length === 0
          ? true
          : person.label.toLocaleLowerCase('es-CO').includes(normalizedPeopleQuery),
      ),
    [normalizedPeopleQuery, personRows],
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
  const selectedPendingSectionTitle = activeFilter === 'circles' ? 'Circles activos' : 'Pendientes';
  const selectedHistorySectionTitle =
    activeFilter === 'circles'
      ? 'Historial de Circles'
      : activeFilter === 'rejected'
        ? 'Rechazadas'
        : 'Historial';
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
  const peopleListRows =
    !hasSelectedPerson && hasAnyRelationshipContext && visiblePersonRows.length > 0
      ? visiblePersonRows
      : [];

  function renderPersonInsightRow({ item }: { readonly item: PeopleInsightPerson }) {
    return (
      <View style={styles.containedListItem}>
        <PersonInsightRow
          onPress={() => {
            triggerAppSelectionHaptic();
            setSelectedPersonId(item.userId);
          }}
          person={item}
        />
      </View>
    );
  }

  useEffect(() => {
    if (hasSelectedPerson || visiblePersonRows.length === 0) {
      return;
    }

    void prefetchAvatarPaths(
      visiblePersonRows
        .slice(0, PEOPLE_SCREEN_VISIBLE_AVATAR_PREFETCH_LIMIT)
        .map((person) => person.avatarUrl),
      {
        maxPaths: PEOPLE_SCREEN_VISIBLE_AVATAR_PREFETCH_LIMIT,
        timeoutMs: 900,
      },
    ).catch(() => undefined);
  }, [hasSelectedPerson, visiblePersonRows]);

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
      contentContainerStyle={styles.peopleScreenRoot}
      contentMode="full"
      headerVisible={false}
      safeAreaEdges={['left', 'right']}
      scrollEnabled={false}
      title="Personas"
    >
      <FlatList
        ItemSeparatorComponent={PeopleListSeparator}
        ListFooterComponent={<View style={styles.peopleListFooter} />}
        ListHeaderComponent={
          <>
            <View style={[styles.peopleTopChrome, { paddingTop: topInset + theme.spacing.md }]}>
              <View style={styles.containedContent}>
                <View style={styles.peopleHeader}>
                  <AppText style={styles.peopleHeaderTitle}>Personas</AppText>
                  <Pressable
                    onPress={() => setAddPersonSheetVisible(true)}
                    style={({ pressed }) => [
                      styles.addButton,
                      {
                        backgroundColor: activeTheme.colors.primarySoft,
                        borderColor: activeTheme.colors.border,
                      },
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Ionicons color={activeTheme.colors.text} name="person-add-outline" size={18} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.topVisualBand}>
                <PeopleInsightSwitcher
                  activeFilter={activeFilter}
                  onChange={changePeopleFilter}
                  renderPage={(pageFilter) => (
                    <PeopleInsightPodiumCard
                      activeFilter={pageFilter}
                      onSelectPerson={(personId) => {
                        setSelectedPersonId((currentPersonId) =>
                          currentPersonId === personId ? null : personId,
                        );
                      }}
                      ranking={rankingsByFilter[pageFilter]}
                      selectedPerson={selectedPersonByFilter[pageFilter]}
                      selectedPersonId={selectedPersonByFilter[pageFilter]?.userId ?? null}
                    />
                  )}
                />
              </View>
            </View>

            <View style={styles.containedContent}>
              <View
                style={[
                  styles.searchWrap,
                  {
                    backgroundColor: activeTheme.colors.surfaceMuted,
                    borderColor: activeTheme.colors.border,
                  },
                ]}
              >
                <Ionicons color={activeTheme.colors.textMuted} name="search-outline" size={18} />
                <AppTextInput
                  autoCapitalize="sentences"
                  clearButtonMode="while-editing"
                  chrome="plain"
                  density="compact"
                  onChangeText={setQuery}
                  placeholder={hasSelectedPerson ? 'Buscar movimiento' : 'Buscar persona'}
                  placeholderTextColor={activeTheme.colors.muted}
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
              ) : null}
            </View>

            {peopleListRows.length > 0 ? <View style={styles.peopleListHeaderGap} /> : null}
          </>
        }
        contentContainerStyle={styles.peopleScreenContent}
        data={peopleListRows}
        keyExtractor={(person) => person.userId}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={<BrandedRefreshControl refresh={refresh} />}
        renderItem={renderPersonInsightRow}
        showsVerticalScrollIndicator={false}
        style={[styles.virtualizedPeopleList, { backgroundColor: activeTheme.colors.background }]}
      />

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
        onAction={(item, action) => void handleInviteRequestAction(item, action)}
        onChangeTab={inviteRequests.setActiveTab}
        onClose={inviteRequests.close}
        onOpenPerson={openInviteRequestPerson}
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
  peopleScreenRoot: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  peopleScreenContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  peopleTopChrome: {
    gap: theme.spacing.lg,
    width: '100%',
  },
  containedContent: {
    alignSelf: 'center',
    gap: theme.spacing.lg,
    maxWidth: 560,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
  },
  peopleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
  },
  peopleHeaderTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 28,
  },
  topVisualBand: {
    gap: theme.spacing.sm,
    width: '100%',
  },
  podiumPager: {
    height: PEOPLE_INSIGHT_BODY_HEIGHT + 12,
    overflow: 'hidden',
    width: '100%',
  },
  syncedPodiumTrack: {
    flexDirection: 'row',
    height: '100%',
  },
  syncedPodiumPage: {
    height: '100%',
  },
  podiumPagerPage: {
    paddingHorizontal: 2,
  },
  insightModule: {
    gap: 0,
    paddingHorizontal: 2,
    paddingTop: 0,
  },
  insightBody: {
    height: PEOPLE_INSIGHT_BODY_HEIGHT,
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
    height: PEOPLE_INSIGHT_BODY_HEIGHT,
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
    gap: 6,
    height: PEOPLE_INSIGHT_BODY_HEIGHT,
    justifyContent: 'space-between',
  },
  podiumSlot: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: theme.radius.large,
    flex: 1,
    gap: 8,
    height: PEOPLE_INSIGHT_BODY_HEIGHT,
    justifyContent: 'flex-end',
    minWidth: 0,
    paddingHorizontal: 6,
    paddingTop: theme.spacing.xs,
  },
  podiumSlotFirst: {
    paddingTop: 0,
  },
  podiumSlotDimmed: {
    opacity: 0.36,
  },
  podiumSlotFocused: {
    opacity: 1,
  },
  podiumSlotSelected: {
    opacity: 0.9,
  },
  podiumAvatarWrap: {
    alignItems: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  podiumRankMedal: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    elevation: 2,
    height: 28,
    justifyContent: 'center',
    marginBottom: -6,
    minWidth: 28,
    overflow: 'visible',
    paddingHorizontal: 8,
    position: 'relative',
    zIndex: 2,
  },
  podiumRankMedalFirst: {
    height: 30,
    marginBottom: -7,
    minWidth: 30,
    paddingHorizontal: 9,
  },
  podiumRankMedalEmpty: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  podiumRankMedalText: {
    fontSize: theme.typography.caption,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  podiumRankMedalTextFilter: {
    fontSize: 10,
    lineHeight: 14,
  },
  podiumRankMedalTextEmpty: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 18,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  podiumAvatarRing: {
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    padding: 3,
    zIndex: 1,
  },
  podiumAvatarRingFocused: {
    borderWidth: 2.5,
    padding: 4,
  },
  podiumAvatarRingEmpty: {
    borderStyle: 'dashed',
  },
  emptyPodiumAvatar: {
    alignItems: 'center',
    backgroundColor: theme.colors.floatingSurface,
    borderRadius: theme.radius.pill,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  emptyPodiumAvatarFirst: {
    height: 58,
    width: 58,
  },
  podiumStep: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
    width: '84%',
  },
  podiumStepFocused: {
    borderWidth: 1.5,
  },
  podiumStepFirst: {
    height: 94,
    width: '92%',
  },
  podiumStepSecond: {
    height: 74,
    width: '80%',
  },
  podiumStepThird: {
    height: 54,
    width: '72%',
  },
  podiumStepEmpty: {
    backgroundColor: theme.colors.inputGlass,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  podiumName: {
    color: theme.colors.text,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
    maxWidth: '100%',
    textAlign: 'center',
  },
  podiumNameEmpty: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 15,
    maxWidth: '100%',
    textAlign: 'center',
  },
  podiumStepMetric: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 15,
    maxWidth: '100%',
    textAlign: 'center',
  },
  selectedPersonHero: {
    alignItems: 'center',
    backgroundColor: theme.glass.flatMutedBackground,
    borderColor: theme.colors.hairline,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: 7,
    height: PEOPLE_INSIGHT_BODY_HEIGHT,
    justifyContent: 'center',
    padding: theme.spacing.md,
    position: 'relative',
  },
  selectedPersonAvatarRing: {
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    padding: 3,
  },
  selectedPersonHeroCopy: {
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    width: '100%',
  },
  selectedPersonHeroName: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontWeight: '900',
    lineHeight: 21,
  },
  selectedPersonMetricPill: {
    alignSelf: 'center',
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
  personCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.hairline,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
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
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: theme.spacing.xs,
    justifyContent: 'flex-end',
    maxWidth: 148,
    minWidth: 0,
  },
  personAmount: {
    flexShrink: 1,
    fontSize: theme.typography.callout,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'right',
  },
  filterStack: {
    marginTop: -4,
    overflow: 'visible',
  },
  filterViewport: {
    overflow: 'hidden',
  },
  filterRail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: METRIC_CAROUSEL_ITEM_GAP,
    paddingVertical: 4,
  },
  metricCarouselItem: {
    backgroundColor: 'transparent',
    minHeight: 52,
    position: 'relative',
    width: METRIC_CAROUSEL_ITEM_WIDTH,
  },
  metricCarouselButton: {
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 4,
    paddingVertical: 6,
    width: '100%',
  },
  metricCarouselItemPressed: {
    opacity: 0.76,
  },
  metricCarouselText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 16,
    minWidth: 0,
    textAlign: 'center',
  },
  metricCarouselShadow: {
    backgroundColor: theme.colors.pressedOverlay,
    borderRadius: theme.radius.pill,
    bottom: -1,
    height: 7,
    left: 29,
    opacity: 0.48,
    position: 'absolute',
    right: 29,
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
  containedListItem: {
    alignSelf: 'center',
    maxWidth: 560,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
  },
  peopleListHeaderGap: {
    height: theme.spacing.lg,
  },
  peopleListSeparator: {
    height: theme.spacing.sm,
  },
  peopleListFooter: {
    height: theme.spacing.xl,
  },
  virtualizedPeopleList: {
    flex: 1,
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
