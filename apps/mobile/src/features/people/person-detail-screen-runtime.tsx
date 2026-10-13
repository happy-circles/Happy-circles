import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ActivityItemDto } from '@happy-circles/application';

import { HistoryVirtualizedList } from '@/components/history-virtualized-list';
import { DirectionPill } from '@/components/direction-pill';
import { EmptyState } from '@/components/empty-state';
import { AppAvatar } from '@/components/app-avatar';
import { AppHeaderBackButton } from '@/components/app-header-back-button';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import {
  CircleActionFeedbackOverlay,
  type CircleActionFeedbackAction,
} from '@/components/circle-action-feedback-overlay';
import { HistoryCaseCard } from '@/components/history-case-card';
import { standardHappyCircleParticipants } from '@/components/happy-circle-ring';
import { MessageBanner } from '@/components/message-banner';
import {
  assertCancellationAcknowledged,
  pendingFinancialRequestActionRole,
} from '@/components/pending-financial-request-actions';
import { PrimaryAction } from '@/components/primary-action';
import { Snackbar } from '@/components/snackbar';
import { SwipePager } from '@/components/swipe-pager';
import { TransactionActionFeedbackOverlay } from '@/components/transaction-action-feedback-overlay';
import {
  showBlockedActionAlert,
  useActionFeedbackOverlay,
  useFeedbackSnackbar,
} from '@/lib/action-feedback';
import * as appHaptics from '@/lib/app-haptics';
import { isIdentityConfirmationCancelled } from '@/lib/live-data/mutations/sensitive-action-check';
import { formatCop } from '@/lib/data';
import { buildHistoryCases, toHistoryFeedItem } from '@/lib/history-cases';
import {
  markNotificationItemsViewed,
  notificationItemCanAlert,
  notificationViewKeyForItem,
  notificationViewedKeysWithLocalCache,
  useAcceptFinancialRequestMutation,
  useAppSnapshot,
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectFinancialRequestMutation,
  useRejectSettlementMutation,
  useCancelFinancialRequestMutation,
  isFinancialRequestConflict,
} from '@/lib/live-data';
import { toneVisual, type LedgerDirection } from '@/lib/direction-ui';
import { backOrReturnTo, pushRoute } from '@/lib/navigation';
import {
  pendingNotificationDotColor,
  pendingNotificationSurfaceColor,
} from '@/lib/pending-notification-visuals';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useAppTheme } from '@/providers/theme-provider';
import { DEFAULT_TRANSACTION_CATEGORY } from '@/lib/transaction-categories';
import {
  transactionContextLabel,
  transactionMetaLabel,
  transactionStatusLabel,
  transactionStatusTone,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';
import {
  PERSON_SEGMENT_KEYS,
  buildFocusCandidates,
  buildPersonCorrectionHref,
  buildPersonRegisterHref,
  matchesFocusedTransaction,
  pendingStatusLabel,
  readNestedStatus,
  readResultStatus,
  splitSubtitleSegments,
  type PendingActionKey,
  type PersonSegmentKey,
} from './person-detail-helpers';
import { PersonDetailSegmentTabs } from './person-detail-segment-tabs';
import {
  confirmPendingAction,
  PersonPendingFinancialRequestCard,
} from './person-pending-financial-request-card';
import {
  PersonDetailErrorState,
  PersonDetailLoadingState,
  PersonDetailMissingState,
} from './person-detail-states';
import { CircleDetailLink } from './person-detail-circle-link';
import {
  buildPersonPanelHref,
  fallbackCircleFeedbackParticipants,
  pendingCaseTone,
  pendingCurrentStatusDetail,
  pendingCurrentStatusTone,
  PERSON_DETAIL_FOCUS_HIGHLIGHT_DURATION_MS,
  type PersonDetailBannerState,
  type PersonDetailScreenProps,
} from './person-detail-runtime-utils';
import { personDetailScreenStyles as styles } from './person-detail-screen.styles';
import { AppText } from '@/components/app-text';
import { PersonHistoryCaseCard } from './person-history-case-card';

export type { PersonDetailScreenProps } from './person-detail-runtime-utils';

export function PersonDetailScreen({ focusItemId, initialPanel, userId }: PersonDetailScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeTheme = useAppTheme();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const acceptRequest = useAcceptFinancialRequestMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const cancelRequest = useCancelFinancialRequestMutation();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();
  const person = snapshotQuery.data?.peopleById[userId] ?? null;
  const [banner, setBanner] = useState<PersonDetailBannerState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pendingActionInFlightRef = useRef(false);
  const financialFeedbackItemRef = useRef<ActivityItemDto | null>(null);
  const [expandedPendingItemIds, setExpandedPendingItemIds] = useState<string[]>([]);
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);
  const [optimisticNotificationViewedKeys, setOptimisticNotificationViewedKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [panelSegment, setPanelSegment] = useState<PersonSegmentKey>(initialPanel ?? 'history');
  const [hasVisitedHistory, setHasVisitedHistory] = useState(initialPanel !== 'pending');
  const [visualPanelSegment, setVisualPanelSegment] = useState<PersonSegmentKey>(panelSegment);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [focusedLandingActive, setFocusedLandingActive] = useState(false);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const actionFeedback = useActionFeedbackOverlay();
  const topInset = Math.max(0, insets.top);
  const handleBack = useCallback(() => {
    backOrReturnTo(router, '/people');
  }, [router]);
  const screenBackgroundStyle = useMemo(
    () => ({ backgroundColor: activeTheme.colors.background }),
    [activeTheme],
  );
  const screenContentStyle = useMemo(
    () => [
      styles.screenContent,
      screenBackgroundStyle,
      {
        paddingTop: topInset + theme.spacing.xs,
      },
    ],
    [screenBackgroundStyle, topInset],
  );
  const pendingItems = person?.pendingItems ?? [];
  const notificationViewedKeys = useMemo(() => {
    const keys = new Set(
      notificationViewedKeysWithLocalCache(
        session.userId,
        snapshotQuery.data?.notificationViewedKeys ?? [],
      ),
    );
    for (const key of optimisticNotificationViewedKeys) {
      keys.add(key);
    }

    return keys;
  }, [
    optimisticNotificationViewedKeys,
    session.userId,
    snapshotQuery.data?.notificationViewedKeys,
  ]);
  const focusCandidates = useMemo(() => buildFocusCandidates(focusItemId), [focusItemId]);
  const focusedPendingItemId = useMemo(() => {
    if (focusCandidates.size === 0) {
      return null;
    }

    return (
      pendingItems.find((item) => matchesFocusedTransaction(item, focusCandidates))?.id ?? null
    );
  }, [focusCandidates, pendingItems]);
  const orderedPendingItems = useMemo(() => {
    if (focusCandidates.size === 0) {
      return pendingItems;
    }

    const focusedItems = pendingItems.filter((item) =>
      matchesFocusedTransaction(item, focusCandidates),
    );
    if (focusedItems.length === 0) {
      return pendingItems;
    }

    const focusedIds = new Set(focusedItems.map((item) => item.id));
    return [...focusedItems, ...pendingItems.filter((item) => !focusedIds.has(item.id))];
  }, [focusCandidates, pendingItems]);
  const pendingItemsToMarkViewed = useMemo(() => {
    const candidates =
      focusCandidates.size > 0
        ? orderedPendingItems.filter((item) => matchesFocusedTransaction(item, focusCandidates))
        : panelSegment === 'pending'
          ? orderedPendingItems
          : [];

    return candidates.filter(
      (item) =>
        notificationItemCanAlert(item) &&
        !notificationViewedKeys.has(notificationViewKeyForItem(item)),
    );
  }, [focusCandidates, notificationViewedKeys, orderedPendingItems, panelSegment]);
  const activeCircleFeedback = useMemo(() => {
    if (!busyKey) {
      return null;
    }

    const separatorIndex = busyKey.lastIndexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }

    const itemId = busyKey.slice(0, separatorIndex);
    const actionValue = busyKey.slice(separatorIndex + 1);
    if (actionValue !== 'approve' && actionValue !== 'execute') {
      return null;
    }

    const action: CircleActionFeedbackAction = actionValue;
    const pendingItem = pendingItems.find((item) => item.id === itemId);
    if (!pendingItem || pendingItem.kind !== 'settlement_proposal') {
      return null;
    }

    const settlement = snapshotQuery.data?.settlementsById[itemId] ?? null;
    const amountMinor =
      typeof pendingItem.amountMinor === 'number' && pendingItem.amountMinor > 0
        ? pendingItem.amountMinor
        : settlement?.personalAmountMinor;
    const participants =
      settlement && settlement.participantDecisions.length > 0
        ? standardHappyCircleParticipants(
            settlement.participantDecisions,
            session.userId,
            action === 'execute' ? 'approved' : 'pending',
          )
        : fallbackCircleFeedbackParticipants({
            action,
            counterpartyLabel: person?.displayName,
            currentUserId: session.userId,
            participantUserIds: pendingItem.participantUserIds,
          });

    return {
      action,
      amountLabel:
        typeof amountMinor === 'number' && amountMinor > 0 ? formatCop(amountMinor) : null,
      participants,
    };
  }, [
    busyKey,
    pendingItems,
    person?.displayName,
    session.userId,
    snapshotQuery.data?.settlementsById,
  ]);
  const activeFinancialFeedback = useMemo(() => {
    if (!busyKey) {
      return null;
    }

    const separatorIndex = busyKey.lastIndexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }

    const itemId = busyKey.slice(0, separatorIndex);
    const actionValue = busyKey.slice(separatorIndex + 1);
    if (actionValue !== 'accept') {
      return null;
    }

    const pendingItem =
      pendingItems.find((item) => item.id === itemId) ?? financialFeedbackItemRef.current;
    if (!pendingItem || pendingItem.kind !== 'financial_request') {
      return null;
    }

    return {
      amountLabel:
        typeof pendingItem.amountMinor === 'number' && pendingItem.amountMinor > 0
          ? formatCop(pendingItem.amountMinor)
          : formatCop(0),
      category: pendingItem.category ?? DEFAULT_TRANSACTION_CATEGORY,
      direction: (pendingItem.tone === 'positive' ? 'owes_me' : 'i_owe') as LedgerDirection,
      personLabel: person?.displayName ?? pendingItem.counterpartyLabel ?? null,
    };
  }, [busyKey, pendingItems, person?.displayName]);

  useLayoutEffect(() => {
    setVisualPanelSegment(panelSegment);
  }, [panelSegment]);

  useLayoutEffect(() => {
    const nextPanel = initialPanel ?? 'history';

    setVisualPanelSegment((current) => (current === nextPanel ? current : nextPanel));
    setPanelSegment((current) => (current === nextPanel ? current : nextPanel));
  }, [initialPanel]);

  useEffect(() => {
    setOptimisticNotificationViewedKeys(new Set());
  }, [session.userId]);

  useEffect(() => {
    if (panelSegment === 'history') setHasVisitedHistory(true);
  }, [panelSegment]);

  useEffect(() => {
    if (!session.userId || pendingItemsToMarkViewed.length === 0) {
      return;
    }

    const nextKeys = pendingItemsToMarkViewed.map((item) => notificationViewKeyForItem(item));
    const nextKeySet = new Set(nextKeys);
    setOptimisticNotificationViewedKeys((current) => {
      const merged = new Set(current);
      for (const key of nextKeys) {
        merged.add(key);
      }

      return merged;
    });

    void markNotificationItemsViewed(session.userId, pendingItemsToMarkViewed).catch(() => {
      setOptimisticNotificationViewedKeys((current) => {
        const next = new Set(current);
        for (const key of nextKeySet) {
          next.delete(key);
        }

        return next;
      });
    });
  }, [pendingItemsToMarkViewed, session.userId]);

  const shouldBuildHistory =
    hasVisitedHistory ||
    panelSegment === 'history' ||
    (focusCandidates.size > 0 && !focusedPendingItemId);
  const personTimeline = person?.timeline;
  const personDisplayName = person?.displayName;
  const historyItems = useMemo(
    () =>
      shouldBuildHistory && personTimeline && personDisplayName
        ? personTimeline.map((item) => toHistoryFeedItem(item, personDisplayName))
        : [],
    [personDisplayName, personTimeline, shouldBuildHistory],
  );
  const historyCases = useMemo(() => buildHistoryCases(historyItems), [historyItems]);
  const focusedHistoryCaseId = useMemo(() => {
    if (focusCandidates.size === 0) {
      return null;
    }

    return (
      historyCases.find(
        (itemCase) =>
          focusCandidates.has(itemCase.id) ||
          itemCase.steps.some((step) => matchesFocusedTransaction(step, focusCandidates)),
      )?.id ?? null
    );
  }, [focusCandidates, historyCases]);
  const focusedLandingKey = focusedPendingItemId
    ? `pending:${focusedPendingItemId}`
    : focusedHistoryCaseId
      ? `history:${focusedHistoryCaseId}`
      : null;

  useLayoutEffect(() => {
    if (focusedPendingItemId) {
      setVisualPanelSegment('pending');
      setPanelSegment('pending');
      return;
    }

    if (focusedHistoryCaseId) {
      setVisualPanelSegment('history');
      setPanelSegment('history');
    }
  }, [focusedHistoryCaseId, focusedPendingItemId]);

  useEffect(() => {
    if (!focusedHistoryCaseId) {
      return;
    }

    setExpandedCaseIds((current) =>
      current[0] === focusedHistoryCaseId ? current : [focusedHistoryCaseId],
    );
  }, [focusedHistoryCaseId]);

  useEffect(() => {
    if (!focusedPendingItemId) {
      return;
    }

    setExpandedPendingItemIds((current) =>
      current[0] === focusedPendingItemId ? current : [focusedPendingItemId],
    );
  }, [focusedPendingItemId]);

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) => (current[0] === caseId ? [] : [caseId]));
  }

  function togglePendingItem(itemId: string) {
    setExpandedPendingItemIds((current) => (current[0] === itemId ? [] : [itemId]));
  }

  const changePanelSegment = useCallback((segment: PersonSegmentKey) => {
    setVisualPanelSegment(segment);
    setPanelSegment((current) => {
      if (current !== segment) {
        appHaptics.triggerAppSelectionHaptic();
      }

      return segment;
    });
  }, []);

  useEffect(() => {
    if (!focusItemId || !focusedLandingKey) {
      setFocusedLandingActive(false);
      return;
    }

    setFocusedLandingActive(true);
    appHaptics.triggerAppSelectionHaptic();

    const timeout = setTimeout(() => {
      setFocusedLandingActive(false);
    }, PERSON_DETAIL_FOCUS_HIGHLIGHT_DURATION_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [focusItemId, focusedLandingKey]);

  async function handlePendingItemAction(
    itemId: string,
    kind: string,
    status: string,
    action: PendingActionKey,
  ) {
    if (pendingActionInFlightRef.current) return;
    const request = pendingItems.find((item) => item.id === itemId);
    if (
      action === 'cancel' &&
      (!request ||
        pendingFinancialRequestActionRole({
          createdByCurrentUser: request.createdByCurrentUser,
          responseState: request.status,
        }) !== 'sender')
    ) {
      setBanner({ message: 'Esta solicitud ya cambió. Revisa su estado actual.', tone: 'warning' });
      await snapshotQuery.refetch();
      return;
    }
    pendingActionInFlightRef.current = true;
    // Retain the confirmed action's presentation after its pending row is removed.
    financialFeedbackItemRef.current =
      kind === 'financial_request' && action === 'accept' ? (request ?? null) : null;
    const key = `${itemId}:${action}`;
    const blockingActionKey =
      kind === 'financial_request' && action === 'accept'
        ? 'acceptFinancialRequest'
        : kind === 'settlement_proposal' && status === 'pending_approvals' && action === 'approve'
          ? 'approveSettlement'
          : kind === 'settlement_proposal' && status === 'approved' && action === 'execute'
            ? 'executeSettlement'
            : null;
    setBusyKey(key);
    setBanner(null);
    actionFeedback.clear();

    try {
      if (kind === 'financial_request') {
        if (action === 'cancel') {
          const response = await cancelRequest.mutateAsync({
            requestId: itemId,
            expectedVersion: request?.versionNumber,
          });
          assertCancellationAcknowledged(itemId, response);
          appHaptics.triggerAppWarningHaptic();
          showSnackbar('Solicitud cancelada.', 'neutral');
          pushRoute(router, buildPersonPanelHref({ focusId: itemId, panel: 'history', userId }));
        } else if (action === 'accept') {
          const response = await actionFeedback.runBlockingAction('acceptFinancialRequest', () =>
            acceptRequest.mutateAsync(itemId),
          );
          const autoCycleStatus = readNestedStatus(response, 'autoCycleJob');
          await actionFeedback.showResult({
            message: autoCycleStatus === 'queued' ? 'Buscando Circle' : 'Propuesta aceptada',
            title: 'Listo',
            variant: 'success',
          });
          pushRoute(
            router,
            buildPersonPanelHref({
              focusId: itemId,
              panel: 'history',
              userId,
            }),
          );
        } else {
          await rejectRequest.mutateAsync(itemId);
          appHaptics.triggerAppWarningHaptic();
          showSnackbar('Propuesta no aceptada.', 'neutral');
          pushRoute(
            router,
            buildPersonPanelHref({
              focusId: itemId,
              panel: 'history',
              userId,
            }),
          );
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'pending_approvals') {
        if (action === 'approve') {
          const response = await actionFeedback.runBlockingAction('approveSettlement', () =>
            approveSettlement.mutateAsync(itemId),
          );
          const nextStatus = readResultStatus(response);
          if (nextStatus === 'stale') {
            appHaptics.triggerAppWarningHaptic();
            setBanner({
              message: 'Esta versión fue reemplazada porque los saldos cambiaron.',
              tone: 'warning',
            });
          } else if (nextStatus === 'executed') {
            await actionFeedback.showResult({
              message: 'Tesoro listo en el detalle',
              title: 'Circle completado',
              variant: 'success',
            });
          } else {
            await actionFeedback.showResult({
              message: nextStatus === 'approved' ? 'Happy Circle listo' : 'Decision guardada',
              title: 'Listo',
              variant: 'success',
            });
          }
        } else {
          await rejectSettlement.mutateAsync(itemId);
          appHaptics.triggerAppWarningHaptic();
          showSnackbar('Happy Circle no aprobado.', 'neutral');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'approved' && action === 'execute') {
        const response = await actionFeedback.runBlockingAction('executeSettlement', () =>
          executeSettlement.mutateAsync(itemId),
        );
        const nextStatus = readNestedStatus(response, 'nextAutoCycleJob');
        await actionFeedback.showResult({
          message:
            nextStatus === 'queued'
              ? 'Tesoro listo y otro Circle en camino'
              : 'Tesoro listo en el detalle',
          title: 'Circle completado',
          variant: 'success',
        });
      }
    } catch (error) {
      if (isIdentityConfirmationCancelled(error)) return;
      if (kind === 'financial_request' && isFinancialRequestConflict(error)) {
        setBanner({
          message: 'La solicitud ya fue respondida o reemplazada. Revisa el estado actualizado.',
          tone: 'warning',
        });
        await snapshotQuery.refetch();
        return;
      }
      const nextMessage =
        error instanceof Error ? error.message : 'No se pudo completar la acción.';
      if (
        showBlockedActionAlert(nextMessage, router, {
          hasEmailPassword: session.linkedMethods.hasEmailPassword,
          profile: {
            displayName: session.profile?.display_name ?? null,
            avatarPath: session.profile?.avatar_path ?? null,
            phoneE164: session.profile?.phone_e164 ?? null,
          },
        })
      ) {
        return;
      }

      if (blockingActionKey) {
        await actionFeedback.showResult({
          message: 'Intenta nuevamente',
          title: 'No se pudo',
          variant: 'danger',
        });
      } else {
        appHaptics.triggerAppErrorHaptic();
        setBanner({
          message: nextMessage,
          tone: 'danger',
        });
      }
    } finally {
      pendingActionInFlightRef.current = false;
      financialFeedbackItemRef.current = null;
      setBusyKey(null);
    }
  }

  function renderPendingItem(item: ActivityItemDto) {
    const isFocused = focusedLandingActive && matchesFocusedTransaction(item, focusCandidates);
    const unread =
      notificationItemCanAlert(item) &&
      !notificationViewedKeys.has(notificationViewKeyForItem(item));

    if (item.kind === 'financial_request') {
      return (
        <PersonPendingFinancialRequestCard
          actorAvatarUrl={person?.avatarUrl ?? null}
          busyKey={busyKey}
          counterpartyName={person?.displayName ?? 'Persona'}
          expanded={expandedPendingItemIds[0] === item.id}
          focused={isFocused}
          item={item}
          key={item.id}
          onAction={(action) =>
            void handlePendingItemAction(item.id, item.kind, item.status, action)
          }
          onCorrection={(mode) =>
            pushRoute(router, buildPersonCorrectionHref(userId, item.id, mode))
          }
          onToggle={() => togglePendingItem(item.id)}
          unread={unread}
        />
      );
    }

    const statusLabel = transactionStatusLabel(item) ?? pendingStatusLabel(item.status);
    const statusTone = transactionStatusTone(item);
    const amountLabel =
      typeof item.amountMinor === 'number' && item.amountMinor > 0
        ? formatCop(item.amountMinor)
        : null;
    const detail =
      item.kind === 'settlement_proposal'
        ? transactionContextLabel(item, person?.displayName ?? 'Persona')
        : (splitSubtitleSegments(item.subtitle)[0] ?? item.subtitle);
    const meta =
      item.kind === 'settlement_proposal'
        ? transactionMetaLabel(item)
        : splitSubtitleSegments(item.subtitle).slice(1).join(' | ') || null;
    const isExpanded = expandedPendingItemIds[0] === item.id;
    const cardTitle = item.title;

    return (
      <HistoryCaseCard
        attentionDot
        attentionDotColor={pendingNotificationDotColor(activeTheme)}
        actorAvatarUrl={item.kind === 'settlement_proposal' ? null : (person?.avatarUrl ?? null)}
        amountLabel={amountLabel}
        description={null}
        eyebrow={
          item.kind === 'settlement_proposal' ? 'Happy Circle' : (person?.displayName ?? null)
        }
        focused={isFocused}
        highlightSurface={unread}
        highlightSurfaceColor={pendingNotificationSurfaceColor(activeTheme)}
        isCycleSnippet={item.kind === 'settlement_proposal'}
        isExpanded={isExpanded}
        key={item.id}
        meta={meta}
        onToggle={() => togglePendingItem(item.id)}
        statusLabel={statusLabel}
        statusTone={statusTone}
        stepPresentation="conversation"
        steps={[
          {
            actorLabel:
              item.kind === 'settlement_proposal'
                ? 'Happy Circle'
                : (person?.displayName ?? 'Persona'),
            amountLabel,
            category: item.category ?? (item.kind === 'settlement_proposal' ? 'cycle' : null),
            conversationSide: item.kind === 'settlement_proposal' ? 'system' : 'other',
            detail,
            id: `${item.id}:context`,
            meta,
            title: item.title,
            tone: pendingCaseTone(item),
          },
          {
            actorLabel: 'Sistema',
            conversationSide: 'system',
            detail: pendingCurrentStatusDetail(item),
            id: `${item.id}:status`,
            meta: null,
            title: 'Estado actual',
            tone: pendingCurrentStatusTone(item),
          },
        ]}
        title={cardTitle}
        tone={pendingCaseTone(item)}
      >
        {item.kind === 'settlement_proposal' && item.status === 'pending_approvals' ? (
          <View style={styles.pendingActionStack}>
            <View style={styles.pendingActionRow}>
              <PrimaryAction
                color={activeTheme.colors.danger}
                compact
                disabled={busyKey !== null}
                fullWidth={false}
                icon="close"
                label={busyKey === `${item.id}:reject` ? 'Enviando...' : 'Rechazar'}
                loading={busyKey === `${item.id}:reject`}
                onPress={
                  busyKey
                    ? undefined
                    : () =>
                        confirmPendingAction({
                          title: 'Rechazar Circle',
                          message: 'No se aplicara este Circle.',
                          confirmLabel: 'Rechazar',
                          onConfirm: () =>
                            void handlePendingItemAction(item.id, item.kind, item.status, 'reject'),
                        })
                }
                style={[
                  styles.circlePanelAction,
                  styles.circlePanelDanger,
                  {
                    backgroundColor: `${activeTheme.colors.danger}12`,
                    borderColor: `${activeTheme.colors.danger}2E`,
                  },
                ]}
                variant="secondary"
              />
              <PrimaryAction
                color={activeTheme.colors.cycle}
                compact
                disabled={busyKey !== null}
                fullWidth={false}
                icon="checkmark"
                loading={busyKey === `${item.id}:approve`}
                label={busyKey === `${item.id}:approve` ? 'Aprobando...' : 'Aprobar'}
                onPress={
                  busyKey
                    ? undefined
                    : () => {
                        appHaptics.triggerAppActionHaptic();
                        void handlePendingItemAction(item.id, item.kind, item.status, 'approve');
                      }
                }
                style={styles.circlePanelAction}
              />
            </View>
            {item.href ? (
              <CircleDetailLink color={activeTheme.colors.cycle} href={item.href as Href} />
            ) : null}
          </View>
        ) : item.kind === 'settlement_proposal' && item.status === 'approved' ? (
          <View style={styles.pendingActionStack}>
            <View style={styles.pendingActionRow}>
              <PrimaryAction
                color={activeTheme.colors.cycle}
                compact
                disabled={busyKey !== null}
                fullWidth={false}
                icon="checkmark-done"
                loading={busyKey === `${item.id}:execute`}
                label={busyKey === `${item.id}:execute` ? 'Completando...' : 'Completar'}
                onPress={
                  busyKey
                    ? undefined
                    : () => {
                        appHaptics.triggerAppSelectionHaptic();
                        Alert.alert('Completar Circle', 'Se movera al historial.', [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Completar',
                            style: 'destructive',
                            onPress: () => {
                              appHaptics.triggerAppActionHaptic();
                              void handlePendingItemAction(
                                item.id,
                                item.kind,
                                item.status,
                                'execute',
                              );
                            },
                          },
                        ]);
                      }
                }
                style={styles.circlePanelAction}
              />
            </View>
            {item.href ? (
              <CircleDetailLink color={activeTheme.colors.cycle} href={item.href as Href} />
            ) : null}
          </View>
        ) : item.kind === 'settlement_proposal' && item.href ? (
          <View style={styles.pendingActionStack}>
            <CircleDetailLink color={activeTheme.colors.cycle} href={item.href as Href} />
          </View>
        ) : null}
      </HistoryCaseCard>
    );
  }

  function renderPanelSegmentPage(segment: PersonSegmentKey) {
    if (segment === 'pending') {
      return (
        <HistoryVirtualizedList
          contentContainerStyle={styles.panelScrollContent}
          data={orderedPendingItems}
          emptyComponent={
            <EmptyState
              description="Cuando haya algo pendiente con esta persona, aparecerá aquí."
              title="Nada pendiente"
            />
          }
          extraData={{
            busyKey,
            expandedPendingItemIds,
            focusedLandingActive,
            notificationViewedKeys,
          }}
          focusedId={focusedPendingItemId}
          refresh={refresh}
          renderItem={({ item }) => renderPendingItem(item)}
          style={[styles.panelPageScroll, screenBackgroundStyle]}
        />
      );
    }

    return (
      <HistoryVirtualizedList
        contentContainerStyle={styles.panelScrollContent}
        data={historyCases}
        emptyComponent={
          <EmptyState
            description="Cuando haya propuestas o movimientos confirmados con esta persona, aparecerán aquí."
            title="Sin movimientos todavía"
          />
        }
        extraData={{ expandedCaseIds, focusedLandingActive }}
        focusedId={focusedHistoryCaseId}
        refresh={refresh}
        renderItem={({ item }) => (
          <PersonHistoryCaseCard
            avatarUrl={person?.avatarUrl ?? null}
            counterpartyLabel={person?.displayName ?? 'Persona'}
            focused={focusedLandingActive && focusedHistoryCaseId === item.id}
            isExpanded={expandedCaseIds[0] === item.id}
            itemCase={item}
            onToggle={() => toggleHistoryCase(item.id)}
          />
        )}
        style={[styles.panelPageScroll, screenBackgroundStyle]}
      />
    );
  }

  if ((snapshotQuery.isRestoringCache || snapshotQuery.isLoading) && !snapshotQuery.data) {
    return <PersonDetailLoadingState onBack={handleBack} />;
  }

  if (snapshotQuery.error && !snapshotQuery.data) {
    return (
      <PersonDetailErrorState
        message={snapshotQuery.error.message}
        onBack={handleBack}
        refresh={refresh}
      />
    );
  }

  if (!person) {
    return <PersonDetailMissingState onBack={handleBack} refresh={refresh} />;
  }

  const activePerson = person;
  const hasPendingItems = person.pendingCount > 0;
  const pendingLabel = `${person.pendingCount} pendiente${person.pendingCount > 1 ? 's' : ''}`;
  const isSettledBalance = person.netAmountMinor === 0;
  const balanceTone = isSettledBalance
    ? 'neutral'
    : person.direction === 'owes_me'
      ? 'positive'
      : 'negative';
  const balanceVisual = toneVisual(balanceTone, activeTheme);
  const balanceSummary = isSettledBalance
    ? 'Están al día'
    : person.direction === 'owes_me'
      ? `Te debe ${formatCop(person.netAmountMinor)}`
      : `Debes ${formatCop(person.netAmountMinor)}`;
  const balanceSummaryColor = balanceVisual?.accentColor;
  const heroMeta = hasPendingItems
    ? isSettledBalance
      ? 'Saldo confirmado en cero'
      : undefined
    : person.supportText;
  const relationshipStatus = (person as { readonly relationshipStatus?: string })
    .relationshipStatus;
  const canRegisterTransactions = relationshipStatus !== 'pending_invite';

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, screenBackgroundStyle]}>
      <View style={screenContentStyle}>
        <View style={[styles.fixedTop, screenBackgroundStyle]}>
          <View style={styles.detailHeader}>
            <View style={styles.detailHeaderSide}>
              <AppHeaderBackButton onPress={handleBack} style={styles.detailHeaderBackButton} />
            </View>
            <AppText style={styles.detailHeaderTitle}>Persona</AppText>
            <View style={styles.detailHeaderSide} />
          </View>

          <View style={styles.heroBlock}>
            <Pressable
              onPress={() => setAvatarViewerVisible(true)}
              style={({ pressed }) => [styles.avatarButton, pressed ? styles.pressed : null]}
            >
              <AppAvatar
                imageUrl={activePerson.avatarUrl ?? null}
                label={activePerson.displayName}
                size={80}
              />
            </Pressable>
            <AppText style={styles.contactFlatName}>{activePerson.displayName}</AppText>
            {!isSettledBalance ? (
              <AppText
                style={[
                  styles.balanceSummary,
                  styles.balanceSummaryAmount,
                  balanceSummaryColor ? { color: balanceSummaryColor } : null,
                ]}
                adjustsFontSizeToFit
                minimumFontScale={0.86}
                numberOfLines={1}
              >
                {balanceSummary}
              </AppText>
            ) : !hasPendingItems ? (
              <AppText
                style={[
                  styles.balanceSummary,
                  balanceSummaryColor ? { color: balanceSummaryColor } : null,
                ]}
                adjustsFontSizeToFit
                minimumFontScale={0.9}
                numberOfLines={1}
              >
                {balanceSummary}
              </AppText>
            ) : null}
            {hasPendingItems ? (
              <View
                style={[
                  styles.pendingHeroBadge,
                  { backgroundColor: activeTheme.colors.warningSoft },
                ]}
              >
                <Ionicons
                  color={activeTheme.colors.warning}
                  name="alert-circle-outline"
                  size={12}
                />
                <AppText
                  style={[styles.pendingHeroBadgeText, { color: activeTheme.colors.warning }]}
                >
                  {pendingLabel}
                </AppText>
              </View>
            ) : null}
            {heroMeta ? (
              <View style={styles.heroMetaRow}>
                {isSettledBalance && hasPendingItems ? (
                  <Ionicons
                    color={activeTheme.colors.muted}
                    name="shield-checkmark-outline"
                    size={14}
                  />
                ) : null}
                <AppText style={styles.heroMeta}>{heroMeta}</AppText>
              </View>
            ) : null}
          </View>

          {canRegisterTransactions ? (
            <View style={styles.quickActionRowFlat}>
              <DirectionPill
                direction="i_owe"
                onPress={() =>
                  pushRoute(router, buildPersonRegisterHref(activePerson.userId, 'i_owe'))
                }
                style={styles.quickActionPill}
              />

              <DirectionPill
                direction="owes_me"
                onPress={() =>
                  pushRoute(router, buildPersonRegisterHref(activePerson.userId, 'owes_me'))
                }
                style={styles.quickActionPill}
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.panelArea, screenBackgroundStyle]}>
          <PersonDetailSegmentTabs
            onChange={changePanelSegment}
            visualSegment={visualPanelSegment}
          />

          {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

          <SwipePager
            accessibilityLabel="Paneles de la relación"
            animateProgrammaticTransitions={false}
            lazy
            offscreenPageLimit={1}
            onChange={changePanelSegment}
            pageStyle={[styles.panelPage, screenBackgroundStyle]}
            renderPage={(segment) => renderPanelSegmentPage(segment)}
            scrollEnabled={false}
            style={[styles.panelPager, screenBackgroundStyle]}
            value={panelSegment}
            values={PERSON_SEGMENT_KEYS}
          />
        </View>
      </View>
      <Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />
      {activeFinancialFeedback ? (
        <TransactionActionFeedbackOverlay
          amountLabel={activeFinancialFeedback.amountLabel}
          category={activeFinancialFeedback.category}
          direction={activeFinancialFeedback.direction}
          message={actionFeedback.overlayProps.message}
          personLabel={activeFinancialFeedback.personLabel}
          title={actionFeedback.overlayProps.title}
          variant={actionFeedback.overlayProps.variant}
          visible={actionFeedback.overlayProps.visible}
        />
      ) : null}
      {activeCircleFeedback ? (
        <CircleActionFeedbackOverlay
          action={activeCircleFeedback.action}
          amountLabel={activeCircleFeedback.amountLabel}
          message={actionFeedback.overlayProps.message}
          participants={activeCircleFeedback.participants}
          title={actionFeedback.overlayProps.title}
          variant={actionFeedback.overlayProps.variant}
          visible={actionFeedback.overlayProps.visible}
        />
      ) : null}
      <AvatarViewerModal
        imageUrl={person.avatarUrl ?? null}
        label={person.displayName}
        onClose={() => setAvatarViewerVisible(false)}
        visible={avatarViewerVisible}
      />
    </SafeAreaView>
  );
}
