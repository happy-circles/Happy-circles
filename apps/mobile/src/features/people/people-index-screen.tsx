import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  Animated,
  FlatList,
  type LayoutChangeEvent,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityItemDto, PersonCardDto } from '@happy-circles/application';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { AppTextInput } from '@/components/app-text-input';
import { BrandedRefreshControl } from '@/components/branded-refresh-control';
import { EmptyState } from '@/components/empty-state';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SurfaceCard } from '@/components/surface-card';
import { TransactionEventCard } from '@/components/transaction-event-card';
import { triggerAppSelectionHaptic } from '@/lib/app-haptics';
import { noActiveRelationshipsEmptyState } from '@/lib/empty-state-copy';
import { prefetchAvatarPaths } from '@/lib/avatar-prefetch';
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
  buildPeopleInsightRows,
  normalizePeopleInsightFilter,
  peopleInsightEmptyDescription,
  peopleInsightEmptyTitle,
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
const METRIC_CAROUSEL_ITEM_GAP = 10;
const METRIC_CAROUSEL_ITEM_WIDTH = 104;
const METRIC_CAROUSEL_STEP = METRIC_CAROUSEL_ITEM_WIDTH + METRIC_CAROUSEL_ITEM_GAP;
const PEOPLE_INSIGHT_FALLBACK_WIDTH = 344;
const PEOPLE_INSIGHT_BODY_HEIGHT = 202;
const PEOPLE_INSIGHT_LOOP_REPETITIONS = 9;
const PEOPLE_INSIGHT_LOOP_MIDDLE_REPEAT = Math.floor(PEOPLE_INSIGHT_LOOP_REPETITIONS / 2);
const PEOPLE_INSIGHT_HORIZONTAL_GESTURE_MIN_DX = 10;
const PEOPLE_INSIGHT_HORIZONTAL_GESTURE_LOCK_RATIO = 1.5;
const PEOPLE_INSIGHT_VERTICAL_TAKEOVER_RATIO = 1.25;
const PEOPLE_INSIGHT_PODIUM_SNAP_COMMIT_RATIO = 0.22;
const PEOPLE_INSIGHT_FILTER_SNAP_COMMIT_RATIO = 0.34;
const PEOPLE_INSIGHT_PODIUM_SNAP_VELOCITY_THRESHOLD = 0.24;
const PEOPLE_INSIGHT_FILTER_SNAP_VELOCITY_THRESHOLD = 0.36;
const PEOPLE_INSIGHT_VELOCITY_PROJECTION_MS = 180;
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

type PeopleInsightSwipeSource = 'filter' | 'podium';

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

  if (filter === 'movements') {
    return 'Movs.';
  }

  return PEOPLE_INSIGHT_OPTIONS.find((option) => option.value === filter)?.label ?? 'Balance';
}

function shouldClaimHorizontalPeopleGesture(gestureState: PanResponderGestureState): boolean {
  const absDx = Math.abs(gestureState.dx);
  const absDy = Math.abs(gestureState.dy);

  return (
    absDx >= PEOPLE_INSIGHT_HORIZONTAL_GESTURE_MIN_DX &&
    absDx > absDy * PEOPLE_INSIGHT_HORIZONTAL_GESTURE_LOCK_RATIO
  );
}

function shouldReleasePeopleGestureToVerticalScroll(
  gestureState: PanResponderGestureState,
): boolean {
  const absDx = Math.abs(gestureState.dx);
  const absDy = Math.abs(gestureState.dy);

  return (
    absDy > PEOPLE_INSIGHT_HORIZONTAL_GESTURE_MIN_DX &&
    absDy > absDx * PEOPLE_INSIGHT_VERTICAL_TAKEOVER_RATIO
  );
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

function PeopleInsightSwitcher({
  activeFilter,
  onChange,
  renderPage,
}: {
  readonly activeFilter: PeopleInsightFilter;
  readonly onChange: (filter: PeopleInsightFilter) => void;
  readonly renderPage: (filter: PeopleInsightFilter) => ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [podiumWidth, setPodiumWidth] = useState(0);
  const [filterWidth, setFilterWidth] = useState(0);
  const [visualFilter, setVisualFilter] = useState<PeopleInsightFilter>(activeFilter);
  const activeFilterRef = useRef(activeFilter);
  const onChangeRef = useRef(onChange);
  const hasAlignedRef = useRef(false);
  const hasMeasuredWidthsRef = useRef(false);
  const visualFilterRef = useRef(activeFilter);
  const activeIndex = Math.max(0, PEOPLE_INSIGHT_FILTER_VALUES.indexOf(activeFilter));
  const centerLoopBaseIndex =
    PEOPLE_INSIGHT_LOOP_MIDDLE_REPEAT * PEOPLE_INSIGHT_FILTER_VALUES.length;
  const activeLoopIndex = centerLoopBaseIndex + activeIndex;
  const currentLoopPositionRef = useRef(activeLoopIndex);
  const gestureStartLoopPositionRef = useRef(activeLoopIndex);
  const podiumPanResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const filterPanResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const skipNextActiveScrollRef = useRef(false);
  const positionProgress = useRef(new Animated.Value(activeLoopIndex)).current;
  const measuredWindowWidth = windowWidth > 0 ? windowWidth : PEOPLE_INSIGHT_FALLBACK_WIDTH;
  const fallbackSwitcherWidth = Math.max(300, measuredWindowWidth - theme.spacing.sm * 2);
  const resolvedPodiumWidth = podiumWidth > 0 ? podiumWidth : fallbackSwitcherWidth;
  const resolvedFilterWidth = filterWidth > 0 ? filterWidth : fallbackSwitcherWidth;
  const resolvedPodiumWidthRef = useRef(resolvedPodiumWidth);
  const hasMeasuredWidths = podiumWidth > 0 && filterWidth > 0;
  const filterSidePadding = Math.max(
    0,
    (resolvedFilterWidth - METRIC_CAROUSEL_ITEM_WIDTH) / 2,
  );
  const filterOptions = useMemo(() => {
    return Array.from({ length: PEOPLE_INSIGHT_LOOP_REPETITIONS }, (_, repeatIndex) =>
      PEOPLE_INSIGHT_OPTIONS.map((option, optionIndex) => ({
        ...option,
        carouselKey: `metric-${repeatIndex}-${option.value}`,
        loopIndex: repeatIndex * PEOPLE_INSIGHT_FILTER_VALUES.length + optionIndex,
      })),
    ).flat();
  }, []);
  const podiumFilters = useMemo(() => {
    return Array.from({ length: PEOPLE_INSIGHT_LOOP_REPETITIONS }, () => [
      ...PEOPLE_INSIGHT_FILTER_VALUES,
    ]).flat();
  }, []);
  const podiumTrackStyle = {
    transform: [{ translateX: Animated.multiply(positionProgress, -resolvedPodiumWidth) }],
  };
  const filterTrackWidth =
    filterSidePadding * 2 +
    filterOptions.length * METRIC_CAROUSEL_ITEM_WIDTH +
    Math.max(0, filterOptions.length - 1) * METRIC_CAROUSEL_ITEM_GAP;
  const filterTrackStyle = {
    paddingLeft: filterSidePadding,
    paddingRight: filterSidePadding,
    transform: [{ translateX: Animated.multiply(positionProgress, -METRIC_CAROUSEL_STEP) }],
    width: filterTrackWidth,
  };

  onChangeRef.current = onChange;
  resolvedPodiumWidthRef.current = resolvedPodiumWidth;

  useEffect(() => {
    if (resolvedPodiumWidth <= 0 || resolvedFilterWidth <= 0) {
      return undefined;
    }

    if (skipNextActiveScrollRef.current) {
      skipNextActiveScrollRef.current = false;
      activeFilterRef.current = activeFilter;
      updateVisualFilter(activeFilter);
      return undefined;
    }

    const targetLoopIndex = loopIndexForFilter(activeFilter);
    activeFilterRef.current = activeFilter;
    updateVisualFilter(activeFilter);

    const frame = requestAnimationFrame(() => {
      const shouldAnimate = hasAlignedRef.current && hasMeasuredWidthsRef.current;

      snapToLoopIndex(targetLoopIndex, shouldAnimate, false);
      hasAlignedRef.current = true;
      hasMeasuredWidthsRef.current = hasMeasuredWidthsRef.current || hasMeasuredWidths;
    });

    return () => cancelAnimationFrame(frame);
  }, [
    activeFilter,
    activeIndex,
    activeLoopIndex,
    hasMeasuredWidths,
    resolvedFilterWidth,
    resolvedPodiumWidth,
  ]);

  useEffect(() => {
    const listenerId = positionProgress.addListener(({ value }) => {
      currentLoopPositionRef.current = value;
    });

    return () => {
      positionProgress.removeListener(listenerId);
    };
  }, [positionProgress]);

  function valueIndexForLoopIndex(loopIndex: number): number {
    const valueCount = PEOPLE_INSIGHT_FILTER_VALUES.length;

    if (valueCount === 0) {
      return 0;
    }

    return ((loopIndex % valueCount) + valueCount) % valueCount;
  }

  function loopIndexForFilter(filter: PeopleInsightFilter): number {
    const valueCount = PEOPLE_INSIGHT_FILTER_VALUES.length;
    const valueIndex = PEOPLE_INSIGHT_FILTER_VALUES.indexOf(filter);

    if (valueCount === 0 || valueIndex < 0) {
      return Math.round(currentLoopPositionRef.current);
    }

    const preferredRepeat = Math.round((currentLoopPositionRef.current - valueIndex) / valueCount);
    const clampedRepeat = Math.min(
      Math.max(preferredRepeat, 0),
      PEOPLE_INSIGHT_LOOP_REPETITIONS - 1,
    );
    const candidateRepeats = Array.from(
      new Set([
        PEOPLE_INSIGHT_LOOP_MIDDLE_REPEAT,
        clampedRepeat - 1,
        clampedRepeat,
        clampedRepeat + 1,
      ]),
    ).filter((repeat) => repeat >= 0 && repeat < PEOPLE_INSIGHT_LOOP_REPETITIONS);

    return candidateRepeats
      .map((repeat) => repeat * valueCount + valueIndex)
      .reduce((closestIndex, candidateIndex) =>
        Math.abs(candidateIndex - currentLoopPositionRef.current) <
        Math.abs(closestIndex - currentLoopPositionRef.current)
          ? candidateIndex
          : closestIndex,
      );
  }

  function resolveLoopIndex(rawLoopIndex: number) {
    const valueCount = PEOPLE_INSIGHT_FILTER_VALUES.length;
    const maxLoopIndex = valueCount * PEOPLE_INSIGHT_LOOP_REPETITIONS - 1;
    const loopIndex = Math.min(Math.max(rawLoopIndex, 0), Math.max(maxLoopIndex, 0));
    const valueIndex = valueIndexForLoopIndex(loopIndex);
    const resolvedLoopIndex = centerLoopBaseIndex + valueIndex;

    return { loopIndex, resolvedLoopIndex, valueIndex };
  }

  function centerLoopPosition(loopPosition: number): number {
    const valueCount = PEOPLE_INSIGHT_FILTER_VALUES.length;

    if (valueCount === 0) {
      return centerLoopBaseIndex;
    }

    const valueProgress = ((loopPosition % valueCount) + valueCount) % valueCount;

    return centerLoopBaseIndex + valueProgress;
  }

  function updateVisualFilter(nextFilter: PeopleInsightFilter) {
    if (visualFilterRef.current === nextFilter) {
      return;
    }

    visualFilterRef.current = nextFilter;
    setVisualFilter(nextFilter);
  }

  function commitLoopIndex(loopIndex: number) {
    const { valueIndex } = resolveLoopIndex(Math.round(loopIndex));
    const nextFilter = PEOPLE_INSIGHT_FILTER_VALUES[valueIndex];

    if (!nextFilter) {
      return;
    }

    updateVisualFilter(nextFilter);

    if (nextFilter === activeFilterRef.current) {
      return;
    }

    skipNextActiveScrollRef.current = true;
    activeFilterRef.current = nextFilter;
    onChangeRef.current(nextFilter);
  }

  function normalizePosition(loopIndex: number) {
    const centeredLoopIndex = centerLoopBaseIndex + valueIndexForLoopIndex(Math.round(loopIndex));

    if (Math.abs(centeredLoopIndex - currentLoopPositionRef.current) <= 0.001) {
      return;
    }

    currentLoopPositionRef.current = centeredLoopIndex;
    positionProgress.setValue(centeredLoopIndex);
  }

  function snapToLoopIndex(
    loopIndex: number,
    animated: boolean,
    shouldCommit: boolean,
    velocity = 0,
  ) {
    const targetLoopIndex = resolveLoopIndex(loopIndex).loopIndex;

    positionProgress.stopAnimation();

    if (!animated) {
      currentLoopPositionRef.current = targetLoopIndex;
      positionProgress.setValue(targetLoopIndex);
      normalizePosition(targetLoopIndex);

      if (shouldCommit) {
        commitLoopIndex(targetLoopIndex);
      }

      return;
    }

    Animated.spring(positionProgress, {
      damping: 23,
      mass: 0.9,
      stiffness: 230,
      toValue: targetLoopIndex,
      useNativeDriver: true,
      velocity,
    }).start(({ finished }) => {
      if (finished) {
        normalizePosition(targetLoopIndex);

        if (shouldCommit) {
          commitLoopIndex(targetLoopIndex);
        }
      }
    });
  }

  function handlePodiumLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;

    if (nextWidth > 0 && Math.abs(nextWidth - podiumWidth) > 0.5) {
      setPodiumWidth(nextWidth);
    }
  }

  function handleFilterLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;

    if (nextWidth > 0 && Math.abs(nextWidth - filterWidth) > 0.5) {
      setFilterWidth(nextWidth);
    }
  }

  function stepForSource(source: PeopleInsightSwipeSource) {
    if (source === 'filter') {
      return METRIC_CAROUSEL_STEP;
    }

    return resolvedPodiumWidthRef.current;
  }

  function snapCommitRatioForSource(source: PeopleInsightSwipeSource) {
    return source === 'filter'
      ? PEOPLE_INSIGHT_FILTER_SNAP_COMMIT_RATIO
      : PEOPLE_INSIGHT_PODIUM_SNAP_COMMIT_RATIO;
  }

  function snapVelocityThresholdForSource(source: PeopleInsightSwipeSource) {
    return source === 'filter'
      ? PEOPLE_INSIGHT_FILTER_SNAP_VELOCITY_THRESHOLD
      : PEOPLE_INSIGHT_PODIUM_SNAP_VELOCITY_THRESHOLD;
  }

  function handleGestureGrant() {
    const fallbackCenteredPosition = centerLoopPosition(currentLoopPositionRef.current);

    currentLoopPositionRef.current = fallbackCenteredPosition;
    gestureStartLoopPositionRef.current = fallbackCenteredPosition;
    positionProgress.setValue(fallbackCenteredPosition);

    positionProgress.stopAnimation((value) => {
      const centeredPosition = centerLoopPosition(value);

      currentLoopPositionRef.current = centeredPosition;
      gestureStartLoopPositionRef.current = centeredPosition;
      positionProgress.setValue(centeredPosition);
    });
  }

  function handleGestureMove(
    source: PeopleInsightSwipeSource,
    gestureState: PanResponderGestureState,
  ) {
    const step = stepForSource(source);

    if (step <= 0) {
      return;
    }

    const nextPosition = gestureStartLoopPositionRef.current - gestureState.dx / step;
    const clampedPosition = resolveLoopIndex(nextPosition).loopIndex;

    currentLoopPositionRef.current = clampedPosition;
    positionProgress.setValue(clampedPosition);
  }

  function handleGestureEnd(
    source: PeopleInsightSwipeSource,
    gestureState: PanResponderGestureState,
  ) {
    const step = stepForSource(source);

    if (step <= 0) {
      return;
    }

    const dragDeltaItems = -gestureState.dx / step;
    const velocityDeltaItems =
      (-gestureState.vx * PEOPLE_INSIGHT_VELOCITY_PROJECTION_MS) / step;
    const projectedDeltaItems = dragDeltaItems + velocityDeltaItems;
    const shouldAdvance =
      Math.abs(dragDeltaItems) >= snapCommitRatioForSource(source) ||
      Math.abs(gestureState.vx) >= snapVelocityThresholdForSource(source);
    const direction =
      projectedDeltaItems === 0 ? Math.sign(dragDeltaItems) : Math.sign(projectedDeltaItems);
    const targetLoopIndex = shouldAdvance
      ? Math.round(gestureStartLoopPositionRef.current) +
        direction * Math.max(1, Math.round(Math.abs(projectedDeltaItems)))
      : Math.round(gestureStartLoopPositionRef.current);
    const velocityInItems = Math.max(-8, Math.min(8, (-gestureState.vx * 1000) / step));

    snapToLoopIndex(targetLoopIndex, true, true, velocityInItems);
  }

  function handleGestureCancel() {
    snapToLoopIndex(Math.round(gestureStartLoopPositionRef.current), true, false);
  }

  function createPanResponder(source: PeopleInsightSwipeSource) {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        shouldClaimHorizontalPeopleGesture(gestureState),
      onPanResponderGrant: handleGestureGrant,
      onPanResponderMove: (_, gestureState) => handleGestureMove(source, gestureState),
      onPanResponderRelease: (_, gestureState) => handleGestureEnd(source, gestureState),
      onPanResponderTerminate: handleGestureCancel,
      onPanResponderTerminationRequest: (_, gestureState) =>
        shouldReleasePeopleGestureToVerticalScroll(gestureState),
      onShouldBlockNativeResponder: () => false,
    });
  }

  function handleFilterPress(filter: PeopleInsightFilter, loopIndex: number) {
    if (filter === activeFilterRef.current) {
      snapToLoopIndex(loopIndex, true, false);
      return;
    }

    snapToLoopIndex(loopIndex, true, true);
  }

  if (!podiumPanResponderRef.current) {
    podiumPanResponderRef.current = createPanResponder('podium');
  }

  if (!filterPanResponderRef.current) {
    filterPanResponderRef.current = createPanResponder('filter');
  }

  const podiumPanResponder = podiumPanResponderRef.current;
  const filterPanResponder = filterPanResponderRef.current;

  return (
    <>
      <View
        onLayout={handlePodiumLayout}
        style={styles.podiumPager}
        {...podiumPanResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.syncedPodiumTrack,
            { width: resolvedPodiumWidth * podiumFilters.length },
            podiumTrackStyle,
          ]}
        >
          {podiumFilters.map((pageFilter, pageIndex) => (
            <View
              key={`${pageIndex}:${pageFilter}`}
              style={[
                styles.syncedPodiumPage,
                styles.podiumPagerPage,
                { width: resolvedPodiumWidth },
              ]}
            >
              {renderPage(pageFilter)}
            </View>
          ))}
        </Animated.View>
      </View>

      <View onLayout={handleFilterLayout} style={styles.filterStack}>
        <View style={styles.filterViewport} {...filterPanResponder.panHandlers}>
          <Animated.View style={[styles.filterRail, filterTrackStyle]}>
            {filterOptions.map((option) => {
              const selected = option.value === visualFilter;
              const tone = insightFilterTone(option.value);
              const color = insightToneColor(tone);
              const focusStyle = {
                opacity: positionProgress.interpolate({
                  extrapolate: 'clamp',
                  inputRange: [option.loopIndex - 1, option.loopIndex, option.loopIndex + 1],
                  outputRange: [0.44, 1, 0.44],
                }),
                transform: [
                  {
                    scale: positionProgress.interpolate({
                      extrapolate: 'clamp',
                      inputRange: [option.loopIndex - 1, option.loopIndex, option.loopIndex + 1],
                      outputRange: [0.96, 1.04, 0.96],
                    }),
                  },
                ],
              };
              const shadowStyle = {
                opacity: positionProgress.interpolate({
                  extrapolate: 'clamp',
                  inputRange: [option.loopIndex - 1, option.loopIndex, option.loopIndex + 1],
                  outputRange: [0, 0.48, 0],
                }),
              };

              return (
                <Animated.View
                  key={option.carouselKey}
                  style={[styles.metricCarouselItem, focusStyle]}
                >
                  <Pressable
                    accessibilityLabel={`Ver podio por ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => handleFilterPress(option.value, option.loopIndex)}
                    style={({ pressed }) => [
                      styles.metricCarouselButton,
                      pressed ? styles.metricCarouselItemPressed : null,
                    ]}
                  >
                    <Ionicons
                      color={color}
                      name={insightFilterIcon(option.value)}
                      size={18}
                    />
                    <AppText
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      numberOfLines={1}
                      style={[
                        styles.metricCarouselText,
                        { color },
                      ]}
                    >
                      {compactPeopleInsightLabel(option.value)}
                    </AppText>
                    <Animated.View
                      style={[
                        styles.metricCarouselShadow,
                        { backgroundColor: color },
                        shadowStyle,
                      ]}
                    />
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        </View>
      </View>
    </>
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
            const color = person ? insightToneColor(person.tone) : theme.colors.textMuted;
            const softColor = person
              ? insightToneSoftColor(person.tone)
              : theme.colors.surfaceMuted;
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
                        { borderColor: theme.colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.emptyPodiumAvatar,
                          visualPlace === 1 ? styles.emptyPodiumAvatarFirst : null,
                        ]}
                      >
                        <Ionicons
                          color={theme.colors.textMuted}
                          name="hourglass-outline"
                          size={visualPlace === 1 ? 21 : 18}
                        />
                      </View>
                    </View>
                  </View>
                  <View style={[styles.podiumStep, styles.podiumStepEmpty, stepStyle]}>
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
  const color = insightToneColor(person.tone);
  const softColor = insightToneSoftColor(person.tone);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <SurfaceCard
        padding="md"
        style={styles.personCard}
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
  const insets = useSafeAreaInsets();
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
    () => {
      const nextRows = {} as Record<PeopleInsightFilter, readonly PeopleInsightPerson[]>;

      for (const option of PEOPLE_INSIGHT_OPTIONS) {
        nextRows[option.value] = buildPeopleInsightRows({
          activeCircleProposals: analyticsAllPeriod?.settlements.activeProposals ?? [],
          analyticsPeople: analyticsAllPeriod?.people ?? [],
          filter: option.value,
          historyItems: historySection?.items ?? [],
          pendingItems: pendingSection?.items ?? [],
          people,
        });
      }

      return nextRows;
    },
    [
      analyticsAllPeriod?.people,
      analyticsAllPeriod?.settlements.activeProposals,
      historySection?.items,
      pendingSection?.items,
      people,
    ],
  );
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
                    style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
                  >
                    <Ionicons color={theme.colors.text} name="person-add-outline" size={18} />
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
        style={styles.virtualizedPeopleList}
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
    paddingHorizontal: theme.spacing.sm,
  },
  podiumPager: {
    height: PEOPLE_INSIGHT_BODY_HEIGHT + 12,
    overflow: 'hidden',
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
    position: 'relative',
  },
  podiumRankMedal: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1.5,
    height: 25,
    justifyContent: 'center',
    marginBottom: -6,
    minWidth: 25,
    paddingHorizontal: 7,
    zIndex: 2,
  },
  podiumRankMedalFirst: {
    height: 29,
    marginBottom: -7,
    minWidth: 29,
    paddingHorizontal: 8,
  },
  podiumRankMedalEmpty: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  podiumRankMedalText: {
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 15,
    textAlign: 'center',
  },
  podiumRankMedalTextFilter: {
    fontSize: 10,
    lineHeight: 12,
  },
  podiumRankMedalTextEmpty: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    fontWeight: '900',
    lineHeight: 15,
    textAlign: 'center',
  },
  podiumAvatarRing: {
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    padding: 3,
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
    backgroundColor: 'rgba(248, 250, 252, 0.86)',
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
    height: 102,
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
    backgroundColor: 'rgba(248, 250, 252, 0.76)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
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
    marginHorizontal: -theme.spacing.sm,
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
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
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
