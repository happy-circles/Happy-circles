import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import type { ActiveSettlementPreviewDto, ActivityItemDto } from '@happy-circles/application';

import { AppText } from '@/components/app-text';
import {
  HappyCircleRing,
  standardHappyCircleParticipants,
  type HappyCircleRingParticipant,
} from '@/components/happy-circle-ring';
import { PrimaryAction } from '@/components/primary-action';
import { StatusChip } from '@/components/status-chip';
import { formatCop } from '@/lib/data';
import { resolveHappyCirclePresentation } from '@/lib/happy-circle-presentation';
import {
  triggerAppEmphasisHaptic,
  triggerAppSelectionHaptic,
  triggerAppSuccessHaptic,
} from '@/lib/app-haptics';
import {
  circleDiscoveryViewKeyForProposalId,
  markNotificationViewsViewed,
  type NotificationViewDescriptor,
  notificationItemStartsViewed,
  notificationViewedKeysWithLocalCache,
  notificationViewDescriptorForItem,
  notificationViewKeyForItem,
  type SettlementDetailDto,
  useAppSnapshot,
} from '@/lib/live-data';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session-provider';
import { useAppTheme } from '@/providers/theme-provider';

const SHOULD_USE_NATIVE_DRIVER = Platform.OS !== 'web';
const SELF_CREATED_DISCOVERY_WINDOW_MS = 30 * 60 * 1000;
const BLOCKED_ROOT_SEGMENTS = new Set([
  'activity',
  'invite',
  'join',
  'profile',
  'register',
  'reset-password',
  'setup-account',
  'settlements',
]);

interface CircleDiscovery {
  readonly discoveryKey: string;
  readonly item: ActivityItemDto;
  readonly notificationKey: string;
  readonly proposalId: string;
  readonly proposal: ActiveSettlementPreviewDto;
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReducedMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

function rootRouteAllowsDiscovery(segments: readonly string[]): boolean {
  const rootSegment = String(segments[0] ?? '');
  return !BLOCKED_ROOT_SEGMENTS.has(rootSegment);
}

function proposalIdForItem(item: ActivityItemDto): string {
  return item.originSettlementProposalId ?? item.id;
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim().length > 0 ? field : null;
}

function itemWasRecentlyCreated(item: ActivityItemDto, nowMs: number): boolean {
  const createdAt = readStringField(item, 'createdAt');
  const createdAtMs = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(createdAtMs) && nowMs - createdAtMs <= SELF_CREATED_DISCOVERY_WINDOW_MS;
}

function fallbackParticipantDecisions(
  item: ActivityItemDto,
  currentUserId: string | null,
): ActiveSettlementPreviewDto['participantDecisions'] {
  const participantUserIds = item.participantUserIds?.length
    ? item.participantUserIds
    : currentUserId
      ? [currentUserId]
      : [];

  return participantUserIds.map((userId, index) => ({
    decision: 'pending',
    label: userId === currentUserId ? 'Tú' : index === 0 ? 'Persona' : `Persona ${index + 1}`,
    userId,
  }));
}

function previewFromSettlementDetail(
  settlement: SettlementDetailDto,
  item: ActivityItemDto,
): ActiveSettlementPreviewDto {
  return {
    approvalsPending: settlement.approvalsPending,
    happyCircleCaseId: settlement.happyCircleCaseId,
    incomingConnection: null,
    isCurrentVersion: settlement.isCurrentVersion,
    movementCount: settlement.personalMovementCount || settlement.movementCount || 1,
    outgoingConnection: null,
    participantCount: settlement.participantCount,
    participantDecisions: settlement.participantDecisions,
    participantLabels: settlement.participantDecisions.map((participant) => participant.label),
    participantUserIds: settlement.participants,
    personalAmountMinor: settlement.personalAmountMinor || item.amountMinor || 0,
    proposalId: settlement.id,
    replacedByProposalId: settlement.replacedByProposalId,
    replacesProposalId: settlement.replacesProposalId,
    savedMovementsCount:
      settlement.personalSavedMovementsCount || settlement.savedMovementsCount || 1,
    staleReason: settlement.staleReason,
    status: settlement.status === 'approved' ? 'approved' : 'pending_approvals',
    subtitle: item.subtitle,
    title: item.title,
    totalAmountMinor: settlement.totalAmountMinor,
    versionNumber: settlement.versionNumber,
  };
}

function fallbackPreviewFromItem(
  item: ActivityItemDto,
  proposalId: string,
  currentUserId: string | null,
): ActiveSettlementPreviewDto {
  const participantDecisions = fallbackParticipantDecisions(item, currentUserId);
  const participantUserIds = participantDecisions.map((participant) => participant.userId);
  const participantCount = Math.max(
    2,
    item.participantUserIds?.length ?? participantUserIds.length,
  );

  return {
    approvalsPending: Math.max(1, participantCount - 1),
    happyCircleCaseId: item.happyCircleCaseId ?? null,
    incomingConnection: null,
    isCurrentVersion: true,
    movementCount: 1,
    outgoingConnection: null,
    participantCount,
    participantDecisions,
    participantLabels: participantDecisions.map((participant) => participant.label),
    participantUserIds,
    personalAmountMinor: item.amountMinor ?? 0,
    proposalId,
    replacedByProposalId: item.replacedByProposalId ?? null,
    replacesProposalId: item.replacesProposalId ?? null,
    savedMovementsCount: 1,
    staleReason: item.staleReason ?? null,
    status: 'pending_approvals',
    subtitle: item.subtitle,
    title: item.title,
    totalAmountMinor: item.amountMinor ?? 0,
    versionNumber: null,
  };
}

function discoveryPreviewForItem(input: {
  readonly currentUserId: string | null;
  readonly item: ActivityItemDto;
  readonly proposalById: ReadonlyMap<string, ActiveSettlementPreviewDto>;
  readonly proposalId: string;
  readonly settlementsById: Readonly<Record<string, SettlementDetailDto>>;
}): ActiveSettlementPreviewDto {
  return (
    input.proposalById.get(input.proposalId) ??
    (input.settlementsById[input.proposalId]
      ? previewFromSettlementDetail(input.settlementsById[input.proposalId], input.item)
      : fallbackPreviewFromItem(input.item, input.proposalId, input.currentUserId))
  );
}

function findCircleDiscovery(input: {
  readonly currentUserId: string | null;
  readonly items: readonly ActivityItemDto[];
  readonly nowMs: number;
  readonly proposalById: ReadonlyMap<string, ActiveSettlementPreviewDto>;
  readonly settlementsById: Readonly<Record<string, SettlementDetailDto>>;
  readonly shownKeys: ReadonlySet<string>;
  readonly viewedKeys: ReadonlySet<string>;
}): CircleDiscovery | null {
  for (const item of input.items) {
    if (
      item.kind !== 'settlement_proposal' ||
      item.status !== 'pending_approvals' ||
      item.category !== 'cycle'
    ) {
      continue;
    }

    const proposalId = proposalIdForItem(item);
    const notificationKey = notificationViewKeyForItem(item);
    const discoveryKey = circleDiscoveryViewKeyForProposalId(proposalId);
    if (input.shownKeys.has(discoveryKey) || input.viewedKeys.has(discoveryKey)) {
      continue;
    }

    const startsViewed = notificationItemStartsViewed(item);
    if (input.viewedKeys.has(notificationKey) && !startsViewed) {
      continue;
    }

    if (startsViewed && !itemWasRecentlyCreated(item, input.nowMs)) {
      continue;
    }

    const proposal = discoveryPreviewForItem({
      currentUserId: input.currentUserId,
      item,
      proposalById: input.proposalById,
      proposalId,
      settlementsById: input.settlementsById,
    });

    return {
      discoveryKey,
      item,
      notificationKey,
      proposalId,
      proposal,
    };
  }

  return null;
}

function discoveryParticipants(
  proposal: ActiveSettlementPreviewDto,
  currentUserId: string | null,
): readonly HappyCircleRingParticipant[] {
  return standardHappyCircleParticipants(proposal.participantDecisions, currentUserId, 'pending');
}

function HappyCircleDiscoveryOverlay({
  currentUserId,
  discovery,
  onClose,
  onOpen,
}: {
  readonly currentUserId: string | null;
  readonly discovery: CircleDiscovery;
  readonly onClose: () => void;
  readonly onOpen: () => void;
}) {
  const activeTheme = useAppTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const cardTranslateY = useRef(new Animated.Value(18)).current;
  const ringScale = useRef(new Animated.Value(0.86)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const proposal = discovery.proposal;
  const myDecision = proposal.participantDecisions.find(
    (participant) => participant.userId === currentUserId,
  )?.decision;
  const presentation = resolveHappyCirclePresentation({
    approvalsPending: proposal.approvalsPending,
    myDecision,
    status: proposal.status,
  });
  const participants = useMemo(
    () => discoveryParticipants(proposal, currentUserId),
    [currentUserId, proposal],
  );
  const amountLabel = formatCop(Math.abs(proposal.personalAmountMinor));
  const movementCount = Math.max(1, proposal.savedMovementsCount);
  const movementCopy = movementCount > 1 ? `${movementCount} movimientos` : '1 movimiento';
  const orbitRotation = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', reducedMotion ? '0deg' : '14deg'],
  });
  const nodeCounterRotation = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', reducedMotion ? '0deg' : '-14deg'],
  });

  useEffect(() => {
    opacity.setValue(0);
    cardScale.setValue(0.94);
    cardTranslateY.setValue(18);
    ringScale.setValue(0.86);
    ringRotation.setValue(0);
    triggerAppEmphasisHaptic();

    const successTimeout = setTimeout(
      () => {
        triggerAppSuccessHaptic();
      },
      reducedMotion ? 180 : 520,
    );

    const enter = Animated.parallel([
      Animated.timing(opacity, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.spring(cardScale, {
        damping: 16,
        mass: 0.76,
        stiffness: 178,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(cardTranslateY, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.spring(ringScale, {
        damping: 13,
        mass: 0.8,
        stiffness: 160,
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
      Animated.timing(ringRotation, {
        duration: reducedMotion ? 1 : 720,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: SHOULD_USE_NATIVE_DRIVER,
      }),
    ]);

    enter.start();

    return () => {
      clearTimeout(successTimeout);
      enter.stop();
    };
  }, [cardScale, cardTranslateY, opacity, reducedMotion, ringRotation, ringScale]);

  return (
    <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <Animated.View style={[styles.scrim, { backgroundColor: activeTheme.colors.scrim, opacity }]}>
        <Animated.View
          accessibilityLabel={`Nuevo Happy Circle. ${proposal.title}. ${presentation.summary}`}
          accessibilityRole="summary"
          accessibilityViewIsModal
          accessible
          style={[
            styles.card,
            {
              backgroundColor: activeTheme.colors.floatingSurface,
              borderColor: activeTheme.colors.hairline,
              ...activeTheme.shadow.floating,
              transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
            },
          ]}
        >
          <Pressable
            accessibilityLabel="Cerrar descubrimiento de Happy Circle"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: activeTheme.colors.surfaceMuted,
                borderColor: activeTheme.colors.hairline,
              },
              pressed ? styles.closeButtonPressed : null,
            ]}
          >
            <Ionicons color={activeTheme.colors.textMuted} name="close" size={17} />
          </Pressable>

          <View style={styles.eyebrowRow}>
            <View
              style={[
                styles.eyebrowIcon,
                {
                  backgroundColor: activeTheme.colors.cycleSoft,
                  borderColor: activeTheme.colors.cycle,
                },
              ]}
            >
              <Ionicons color={activeTheme.colors.cycle} name="sparkles" size={18} />
            </View>
            <AppText style={[styles.eyebrowText, { color: activeTheme.colors.cycle }]}>
              Nuevo Happy Circle
            </AppText>
          </View>

          <View style={styles.copy}>
            <AppText
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              numberOfLines={2}
              style={[styles.title, { color: activeTheme.colors.text }]}
            >
              Encontramos una ruta para cerrar saldos
            </AppText>
            <AppText style={[styles.message, { color: activeTheme.colors.textMuted }]}>
              Revisa este Circle antes de aprobarlo.
            </AppText>
          </View>

          <Animated.View style={[styles.ringStage, { transform: [{ scale: ringScale }] }]}>
            <HappyCircleRing
              animatePendingFaces
              centerColor={activeTheme.colors.cycle}
              centerLabel={amountLabel}
              centerSubLabel="a revisar"
              decisions={participants}
              nodeCounterRotation={nodeCounterRotation}
              orbitRotation={orbitRotation}
              ringSize={224}
              style={styles.discoveryRing}
            />
          </Animated.View>

          <View style={styles.metricsRow}>
            <View
              style={[
                styles.metricPill,
                {
                  backgroundColor: activeTheme.colors.cycleSoft,
                  borderColor: activeTheme.colors.cycle,
                },
              ]}
            >
              <AppText style={[styles.metricValue, { color: activeTheme.colors.cycle }]}>
                {movementCopy}
              </AppText>
              <AppText style={[styles.metricLabel, { color: activeTheme.colors.textMuted }]}>
                conectados
              </AppText>
            </View>
            <View
              style={[
                styles.metricPill,
                {
                  backgroundColor: activeTheme.colors.surface,
                  borderColor: activeTheme.colors.border,
                },
              ]}
            >
              <AppText style={[styles.metricValue, { color: activeTheme.colors.text }]}>
                {proposal.participantCount}
              </AppText>
              <AppText style={[styles.metricLabel, { color: activeTheme.colors.textMuted }]}>
                personas
              </AppText>
            </View>
          </View>

          <View style={styles.statusRow}>
            <StatusChip compact label={presentation.label} tone={presentation.tone} />
            <AppText
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              numberOfLines={1}
              style={[styles.statusText, { color: activeTheme.colors.textMuted }]}
            >
              {presentation.summary}
            </AppText>
          </View>

          <View style={styles.actions}>
            <PrimaryAction
              color={activeTheme.colors.cycle}
              icon="arrow-forward"
              label="Revisar Circle"
              onPress={onOpen}
              style={styles.primaryAction}
            />
            <Pressable
              accessibilityLabel="Ver despues"
              accessibilityRole="button"
              onPress={() => {
                triggerAppSelectionHaptic();
                onClose();
              }}
              style={({ pressed }) => [styles.secondaryAction, pressed ? styles.pressed : null]}
            >
              <AppText
                style={[styles.secondaryActionText, { color: activeTheme.colors.textMuted }]}
              >
                Luego
              </AppText>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function HappyCircleDiscoveryBridge({ disabled = false }: { readonly disabled?: boolean }) {
  const router = useRouter();
  const segments = useSegments();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const shownKeysRef = useRef<Set<string>>(new Set());
  const [activeDiscovery, setActiveDiscovery] = useState<CircleDiscovery | null>(null);
  const snapshot = snapshotQuery.data ?? null;
  const routeAllowsDiscovery = rootRouteAllowsDiscovery(segments);
  const pendingItems = useMemo(
    () => snapshot?.activitySections.find((section) => section.key === 'pending')?.items ?? [],
    [snapshot?.activitySections],
  );
  const proposalById = useMemo(
    () =>
      new Map(
        (snapshot?.balanceOverview.resolution.activeProposals ?? []).map((proposal) => [
          proposal.proposalId,
          proposal,
        ]),
      ),
    [snapshot?.balanceOverview.resolution.activeProposals],
  );
  const viewedKeys = useMemo(
    () => notificationViewedKeysWithLocalCache(session.userId, snapshot?.notificationViewedKeys),
    [session.userId, snapshot?.notificationViewedKeys],
  );
  const canShowDiscovery =
    !disabled &&
    routeAllowsDiscovery &&
    session.status === 'signed_in_unlocked' &&
    session.accountAccessState === 'active' &&
    session.profileCompletionState === 'complete' &&
    !session.setupState.requiredComplete &&
    !snapshotQuery.isRestoringCache;

  useEffect(() => {
    shownKeysRef.current.clear();
  }, [session.userId]);

  useEffect(() => {
    if (!canShowDiscovery || activeDiscovery || !snapshot) {
      return;
    }

    const nextDiscovery = findCircleDiscovery({
      currentUserId: session.userId,
      items: pendingItems,
      nowMs: Date.now(),
      proposalById,
      settlementsById: snapshot.settlementsById,
      shownKeys: shownKeysRef.current,
      viewedKeys,
    });

    if (!nextDiscovery) {
      return;
    }

    shownKeysRef.current.add(nextDiscovery.discoveryKey);
    setActiveDiscovery(nextDiscovery);
  }, [
    activeDiscovery,
    canShowDiscovery,
    pendingItems,
    proposalById,
    session.userId,
    snapshot,
    viewedKeys,
  ]);

  const markDiscoveryViewed = useCallback(
    (discovery: CircleDiscovery) => {
      if (!session.userId) {
        return;
      }

      const views: readonly NotificationViewDescriptor[] = [
        notificationViewDescriptorForItem(discovery.item),
        {
          notificationKey: discovery.discoveryKey,
          notificationKind: 'circle_discovery',
          notificationStatus: 'discovered',
          sourceItemId: discovery.proposalId,
        },
      ];

      void markNotificationViewsViewed(session.userId, views).catch(() => undefined);
    },
    [session.userId],
  );

  const closeDiscovery = useCallback(() => {
    if (activeDiscovery) {
      markDiscoveryViewed(activeDiscovery);
    }

    setActiveDiscovery(null);
  }, [activeDiscovery, markDiscoveryViewed]);

  const openDiscovery = useCallback(() => {
    if (!activeDiscovery) {
      return;
    }

    markDiscoveryViewed(activeDiscovery);
    setActiveDiscovery(null);
    pushRoute(router, `/settlements/${activeDiscovery.proposal.proposalId}` as Href);
  }, [activeDiscovery, markDiscoveryViewed, router]);

  if (!activeDiscovery) {
    return null;
  }

  return (
    <HappyCircleDiscoveryOverlay
      currentUserId={session.userId}
      discovery={activeDiscovery}
      onClose={closeDiscovery}
      onOpen={openDiscovery}
    />
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    alignItems: 'center',
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxWidth: 390,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    position: 'relative',
    width: '100%',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: theme.spacing.md,
    top: theme.spacing.md,
    width: 34,
    zIndex: 5,
  },
  closeButtonPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  eyebrowRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingRight: 44,
  },
  eyebrowIcon: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  eyebrowText: {
    fontSize: theme.typography.footnote,
    fontWeight: '900',
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  copy: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.typography.title2,
    fontWeight: '900',
    lineHeight: 29,
    textAlign: 'center',
  },
  message: {
    fontSize: theme.typography.callout,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  ringStage: {
    alignItems: 'center',
    height: 236,
    justifyContent: 'center',
    width: 236,
  },
  discoveryRing: {
    marginRight: 0,
  },
  metricsRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  metricPill: {
    alignItems: 'center',
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  metricValue: {
    fontSize: theme.typography.callout,
    fontWeight: '900',
    lineHeight: 19,
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  statusRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
    minHeight: 30,
  },
  statusText: {
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.spacing.xs,
  },
  primaryAction: {
    minHeight: 52,
  },
  secondaryAction: {
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.72,
  },
});
