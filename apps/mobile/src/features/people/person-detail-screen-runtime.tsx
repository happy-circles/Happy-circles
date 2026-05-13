import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter, type Href } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityItemDto } from '@happy-circles/application';

import { BrandedRefreshScrollView } from '@/components/branded-refresh-control';
import { DirectionPill } from '@/components/direction-pill';
import { EmptyState } from '@/components/empty-state';
import { AppAvatar } from '@/components/app-avatar';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PendingFinancialRequestCard } from '@/components/pending-financial-request-card';
import { PrimaryAction } from '@/components/primary-action';
import { Snackbar } from '@/components/snackbar';
import { SwipePager } from '@/components/swipe-pager';
import {
  showBlockedActionAlert,
  useActionFeedbackOverlay,
  useFeedbackSnackbar,
} from '@/lib/action-feedback';
import * as appHaptics from '@/lib/app-haptics';
import { formatCop } from '@/lib/data';
import {
  buildHistoryCases,
  friendlyHistoryStepLabel,
  historyAmountIsVoided,
  historyCardTitle,
  historyCaseAmountLabel,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyCaseVisualCategory,
  historyImpactLabel,
  historyImpactTone,
  historyTimelineStepCategory,
  historyTimelineStepDetailLabel,
  historyTimelineStepAmountLabel,
  historyTimelineStepMetaLabel,
  toHistoryFeedItem,
} from '@/lib/history-cases';
import {
  useAcceptFinancialRequestMutation,
  useAmendFinancialRequestMutation,
  useAppSnapshot,
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectFinancialRequestMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import { toneVisual } from '@/lib/direction-ui';
import { pushRoute } from '@/lib/navigation';
import { theme } from '@/lib/theme';
import { useSnapshotRefresh } from '@/lib/use-snapshot-refresh';
import { useAppTheme } from '@/providers/theme-provider';
import {
  DEFAULT_TRANSACTION_CATEGORY,
  type UserTransactionCategory,
  isUserTransactionCategory,
} from '@/lib/transaction-categories';
import {
  transactionContextLabel,
  transactionMetaLabel,
  transactionStatusLabel,
  transactionStatusTone,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';
import {
  PERSON_SEGMENT_KEYS,
  buildFinancialRequestPendingContent,
  buildFocusCandidates,
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
  PersonDetailErrorState,
  PersonDetailLoadingState,
  PersonDetailMissingState,
} from './person-detail-states';
import { personDetailScreenStyles as styles } from './person-detail-screen.styles';
import { AppText } from '@/components/app-text';

export interface PersonDetailScreenProps {
  readonly focusItemId?: string;
  readonly initialPanel?: PersonSegmentKey;
  readonly userId: string;
}
interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface AmendmentErrors {
  readonly amount?: string;
  readonly description?: string;
}

const FOCUS_HIGHLIGHT_DURATION_MS = 1800;

function CircleDetailLink({ color, href }: { readonly color: string; readonly href: Href }) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        onPressIn={appHaptics.triggerAppSelectionHaptic}
        style={({ pressed }) => [
          styles.circleDetailLink,
          pressed ? styles.circleDetailLinkPressed : null,
        ]}
      >
        <AppText numberOfLines={1} style={[styles.circleDetailLinkText, { color }]}>
          Ver detalle del Circle &gt;
        </AppText>
      </Pressable>
    </Link>
  );
}

function pendingCaseTone(item: ActivityItemDto): HistoryCaseTone {
  if (item.kind === 'settlement_proposal') {
    return 'cycle';
  }

  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'expired') {
    return 'danger';
  }

  if (item.tone === 'positive') {
    return 'positive';
  }

  if (item.tone === 'negative') {
    return 'negative';
  }

  return 'neutral';
}

function pendingCurrentStatusTone(item: ActivityItemDto): HistoryCaseTone {
  if (item.status === 'rejected' || item.status === 'canceled' || item.status === 'expired') {
    return 'danger';
  }

  if (item.status === 'approved') {
    return 'positive';
  }

  if (item.status === 'pending_approvals' || item.status === 'requires_you') {
    return 'negative';
  }

  if (item.kind === 'settlement_proposal') {
    return 'cycle';
  }

  return pendingCaseTone(item);
}

function pendingCurrentStatusDetail(item: ActivityItemDto): string {
  if (item.kind === 'settlement_proposal') {
    if (item.status === 'pending_approvals') {
      return 'Falta tu aprobacion.';
    }

    if (item.status === 'approved') {
      return 'Aprobado. Puedes completarlo.';
    }

    if (item.status === 'waiting_other_side') {
      return 'Faltan aprobaciones.';
    }

    if (item.status === 'rejected') {
      return 'No fue aprobado.';
    }

    if (item.status === 'expired') {
      return 'Expirado.';
    }

    if (item.status === 'stale') {
      return item.staleReason ?? 'Reemplazado por cambios en el balance.';
    }
  }

  return transactionStatusLabel(item) ?? pendingStatusLabel(item.status);
}

export function PersonDetailScreen({ focusItemId, initialPanel, userId }: PersonDetailScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeTheme = useAppTheme();
  const session = useSession();
  const snapshotQuery = useAppSnapshot();
  const refresh = useSnapshotRefresh(snapshotQuery);
  const acceptRequest = useAcceptFinancialRequestMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const amendRequest = useAmendFinancialRequestMutation();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();
  const person = snapshotQuery.data?.peopleById[userId] ?? null;
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeAmendmentItemId, setActiveAmendmentItemId] = useState<string | null>(null);
  const [amendmentAmount, setAmendmentAmount] = useState('');
  const [amendmentDescription, setAmendmentDescription] = useState('');
  const [amendmentCategory, setAmendmentCategory] = useState<UserTransactionCategory>(
    DEFAULT_TRANSACTION_CATEGORY,
  );
  const [amendmentErrors, setAmendmentErrors] = useState<AmendmentErrors>({});
  const [expandedPendingItemIds, setExpandedPendingItemIds] = useState<string[]>([]);
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);
  const [panelSegment, setPanelSegment] = useState<PersonSegmentKey>(initialPanel ?? 'history');
  const [visualPanelSegment, setVisualPanelSegment] = useState<PersonSegmentKey>(panelSegment);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const [focusedLandingActive, setFocusedLandingActive] = useState(false);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const actionFeedback = useActionFeedbackOverlay();
  const topInset = Math.max(0, insets.top);
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

  useEffect(() => {
    setVisualPanelSegment(panelSegment);
  }, [panelSegment]);

  useEffect(() => {
    if (!activeAmendmentItemId || !pendingItems.some((item) => item.id === activeAmendmentItemId)) {
      setActiveAmendmentItemId(null);
      setAmendmentAmount('');
      setAmendmentDescription('');
      setAmendmentCategory(DEFAULT_TRANSACTION_CATEGORY);
      setAmendmentErrors({});
    }
  }, [activeAmendmentItemId, pendingItems]);

  useEffect(() => {
    if (initialPanel) {
      setPanelSegment(initialPanel);
      return;
    }

    if (pendingItems.length > 0) {
      setPanelSegment('pending');
      return;
    }

    setPanelSegment('history');
  }, [initialPanel, pendingItems.length]);

  const amendmentAmountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);
  const historyItems = useMemo(
    () =>
      person ? person.timeline.map((item) => toHistoryFeedItem(item, person.displayName)) : [],
    [person],
  );
  const historyCases = useMemo(() => {
    if (!person) {
      return [];
    }

    return buildHistoryCases(historyItems);
  }, [historyItems, person]);
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

  useEffect(() => {
    if (focusedPendingItemId) {
      setPanelSegment('pending');
      return;
    }

    if (focusedHistoryCaseId) {
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
    setPanelSegment(segment);
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
    }, FOCUS_HIGHLIGHT_DURATION_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [focusItemId, focusedLandingKey]);

  function toggleAmendment(item: ActivityItemDto) {
    appHaptics.triggerAppSelectionHaptic();
    if (activeAmendmentItemId === item.id) {
      setActiveAmendmentItemId(null);
      setAmendmentCategory(DEFAULT_TRANSACTION_CATEGORY);
      setAmendmentErrors({});
      return;
    }

    const financialRequestContent = buildFinancialRequestPendingContent(item);
    const category = isUserTransactionCategory(item.category)
      ? item.category
      : DEFAULT_TRANSACTION_CATEGORY;
    setActiveAmendmentItemId(item.id);
    setExpandedPendingItemIds([item.id]);
    setAmendmentAmount(String(Math.max(1, Math.round((item.amountMinor ?? 0) / 100))));
    setAmendmentDescription(financialRequestContent.detail);
    setAmendmentCategory(category);
    setAmendmentErrors({});
  }

  async function handleAmendment(requestId: string) {
    const nextErrors: AmendmentErrors = {
      amount: amendmentAmountMinor > 0 ? undefined : 'Ingresa un monto mayor a 0.',
      description:
        amendmentDescription.trim().length > 0 ? undefined : 'Explica el concepto del nuevo monto.',
    };
    const errorCount = Object.values(nextErrors).filter(Boolean).length;
    if (errorCount > 0) {
      appHaptics.triggerAppWarningHaptic();
      setAmendmentErrors(nextErrors);
      setBanner({
        message:
          errorCount === 1
            ? 'Te falta 1 dato para enviar el nuevo monto.'
            : `Te faltan ${errorCount} datos para enviar el nuevo monto.`,
        tone: 'danger',
      });
      return;
    }

    setBusyKey(`${requestId}:amendment`);
    setBanner(null);

    try {
      await amendRequest.mutateAsync({
        requestId,
        amountMinor: amendmentAmountMinor,
        description: amendmentDescription.trim(),
        category: amendmentCategory,
      });
      setActiveAmendmentItemId(null);
      setAmendmentAmount('');
      setAmendmentDescription('');
      setAmendmentCategory(DEFAULT_TRANSACTION_CATEGORY);
      setAmendmentErrors({});
      appHaptics.triggerAppSuccessHaptic();
      showSnackbar('Nuevo monto enviado.', 'success');
    } catch (error) {
      appHaptics.triggerAppErrorHaptic();
      const nextMessage =
        error instanceof Error ? error.message : 'No se pudo enviar el nuevo monto.';
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

      setBanner({
        message: nextMessage,
        tone: 'danger',
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePendingItemAction(
    itemId: string,
    kind: string,
    status: string,
    action: PendingActionKey,
  ) {
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
        if (action === 'accept') {
          const response = await actionFeedback.runBlockingAction('acceptFinancialRequest', () =>
            acceptRequest.mutateAsync(itemId),
          );
          const autoCycleStatus = readNestedStatus(response, 'autoCycleJob');
          await actionFeedback.showResult({
            message: autoCycleStatus === 'queued' ? 'Buscando Circle' : 'Propuesta aceptada',
            title: 'Listo',
            variant: 'success',
          });
        } else {
          await rejectRequest.mutateAsync(itemId);
          appHaptics.triggerAppWarningHaptic();
          showSnackbar('Propuesta no aceptada.', 'neutral');
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
          message: nextStatus === 'queued' ? 'Siguiente Circle' : 'Happy Circle completado',
          title: 'Listo',
          variant: 'success',
        });
      }
    } catch (error) {
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
      setBusyKey(null);
    }
  }

  function confirmPendingAction(input: {
    readonly title: string;
    readonly message: string;
    readonly confirmLabel: string;
    readonly onConfirm: () => void;
  }) {
    appHaptics.triggerAppSelectionHaptic();
    Alert.alert(input.title, input.message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: input.confirmLabel,
        style: 'destructive',
        onPress: input.onConfirm,
      },
    ]);
  }

  function renderPendingItem(item: ActivityItemDto) {
    const isFocused = focusedLandingActive && matchesFocusedTransaction(item, focusCandidates);

    if (item.kind === 'financial_request') {
      const financialRequestContent = buildFinancialRequestPendingContent(item);
      return (
        <PendingFinancialRequestCard
          actorAvatarUrl={person?.avatarUrl ?? null}
          amendmentAmount={amendmentAmount}
          amendmentCategory={amendmentCategory}
          amendmentDescription={amendmentDescription}
          amountMinor={item.amountMinor ?? 0}
          amountTone={item.tone === 'positive' || item.tone === 'negative' ? item.tone : 'neutral'}
          busyAccept={busyKey === `${item.id}:accept`}
          busyAmendment={busyKey === `${item.id}:amendment`}
          busyReject={busyKey === `${item.id}:reject`}
          counterpartyName={person?.displayName ?? 'Persona'}
          category={item.category}
          createdAtLabel={financialRequestContent.createdAtLabel}
          createdByLabel={financialRequestContent.createdByLabel}
          description={financialRequestContent.detail}
          focused={isFocused}
          historySteps={item.pendingHistorySteps}
          isExpanded={expandedPendingItemIds[0] === item.id}
          key={item.id}
          amendmentAmountError={
            activeAmendmentItemId === item.id ? (amendmentErrors.amount ?? null) : null
          }
          amendmentDescriptionError={
            activeAmendmentItemId === item.id ? (amendmentErrors.description ?? null) : null
          }
          onAccept={
            busyKey
              ? undefined
              : () => void handlePendingItemAction(item.id, item.kind, item.status, 'accept')
          }
          onChangeAmendmentAmount={(value) => {
            setAmendmentAmount(value);
            setAmendmentErrors((current) => ({
              ...current,
              amount: undefined,
            }));
          }}
          onChangeAmendmentDescription={(value) => {
            setAmendmentDescription(value);
            setAmendmentErrors((current) => ({
              ...current,
              description: undefined,
            }));
          }}
          onChangeAmendmentCategory={setAmendmentCategory}
          onReject={
            busyKey
              ? undefined
              : () =>
                  confirmPendingAction({
                    title: 'No aceptar',
                    message: 'No se aplicara este movimiento.',
                    confirmLabel: 'No aceptar',
                    onConfirm: () =>
                      void handlePendingItemAction(item.id, item.kind, item.status, 'reject'),
                  })
          }
          onSubmitAmendment={busyKey ? undefined : () => void handleAmendment(item.id)}
          onToggleAmendment={busyKey ? undefined : () => toggleAmendment(item)}
          onToggle={() => togglePendingItem(item.id)}
          responseState={item.status === 'requires_you' ? 'requires_you' : 'waiting_other_side'}
          showAmendment={activeAmendmentItemId === item.id}
          title={item.title}
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
        actorAvatarUrl={item.kind === 'settlement_proposal' ? null : (person?.avatarUrl ?? null)}
        amountLabel={amountLabel}
        description={null}
        eyebrow={item.kind === 'settlement_proposal' ? 'Happy Circle' : (person?.displayName ?? null)}
        focused={isFocused}
        isCycleSnippet={item.kind === 'settlement_proposal'}
        isExpanded={isExpanded}
        key={item.id}
        meta={meta}
        onToggle={() => togglePendingItem(item.id)}
        statusLabel={statusLabel}
        statusTone={statusTone}
        steps={[
          {
            amountLabel,
            category: item.category ?? (item.kind === 'settlement_proposal' ? 'cycle' : null),
            detail,
            id: `${item.id}:context`,
            meta,
            title: item.title,
            tone: pendingCaseTone(item),
          },
          {
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
                        Alert.alert(
                          'Completar Circle',
                          'Se movera al historial.',
                          [
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
                          ],
                        );
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

  function renderPanelSegmentContent(segment: PersonSegmentKey) {
    if (segment === 'pending') {
      return orderedPendingItems.length > 0 ? (
        orderedPendingItems.map((item) => renderPendingItem(item))
      ) : (
        <EmptyState
          description="Cuando haya algo pendiente con esta persona, aparecerá aquí."
          title="Nada pendiente"
        />
      );
    }

    if (historyCases.length === 0) {
      return (
        <EmptyState
          description="Cuando haya propuestas o movimientos confirmados con esta persona, aparecerán aquí."
          title="Sin movimientos todavía"
        />
      );
    }

    return historyCases.map((itemCase) => {
      const isExpanded = expandedCaseIds[0] === itemCase.id;
      const isFocused = focusedLandingActive && focusedHistoryCaseId === itemCase.id;
      const latest = itemCase.latest;
      const caseAmountLabel = historyCaseAmountLabel(latest);
      const caseTone = historyImpactTone(latest) as HistoryCaseTone;
      const caseTitle = friendlyHistoryStepLabel(latest);
      const caseDescription = historyCardTitle(itemCase);

      return (
        <HistoryCaseCard
          actorAvatarUrl={person?.avatarUrl ?? null}
          amountLabel={caseAmountLabel}
          amountStruckThrough={historyAmountIsVoided(latest)}
          category={historyCaseVisualCategory(itemCase)}
          description={null}
          eyebrow={person?.displayName ?? null}
          focused={isFocused}
          isCycleSnippet={itemCase.isCycleSnippet}
          isExpanded={isExpanded}
          key={itemCase.id}
          meta={historyCaseMeta(itemCase)}
          onToggle={() => toggleHistoryCase(itemCase.id)}
          statusLabel={historyCaseStatusLabel(itemCase)}
          statusTone={historyCaseStatusTone(itemCase)}
          steps={itemCase.steps.map((step, index) => {
            const amountLabel = historyTimelineStepAmountLabel(itemCase, step, index);
            const impact = historyImpactLabel(step);

            return {
              id: step.id,
              title: friendlyHistoryStepLabel(step),
              category: historyTimelineStepCategory(itemCase, step, index),
              detail: historyTimelineStepDetailLabel(step),
              amountLabel,
              impact:
                !amountLabel && caseAmountLabel && impact?.includes(caseAmountLabel)
                  ? null
                  : impact,
              meta: historyTimelineStepMetaLabel(itemCase, step),
              tone: historyImpactTone(step) as HistoryCaseTone,
            };
          })}
          title={caseDescription || caseTitle}
          tone={caseTone}
        />
      );
    });
  }

  function renderPanelSegmentPage(segment: PersonSegmentKey) {
    return (
      <BrandedRefreshScrollView
        fillViewport
        contentContainerStyle={styles.panelScrollContent}
        keyboardShouldPersistTaps="handled"
        refresh={refresh}
        showsVerticalScrollIndicator={false}
        style={[styles.panelPageScroll, screenBackgroundStyle]}
      >
        {renderPanelSegmentContent(segment)}
      </BrandedRefreshScrollView>
    );
  }

  if (snapshotQuery.isLoading) {
    return <PersonDetailLoadingState />;
  }

  if (snapshotQuery.error) {
    return <PersonDetailErrorState message={snapshotQuery.error.message} refresh={refresh} />;
  }

  if (!person) {
    return <PersonDetailMissingState refresh={refresh} />;
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
    ? 'Estan al dia'
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
            onChange={changePanelSegment}
            onPreviewChange={setVisualPanelSegment}
            pageStyle={[styles.panelPage, screenBackgroundStyle]}
            renderPage={(segment) => renderPanelSegmentPage(segment)}
            style={[styles.panelPager, screenBackgroundStyle]}
            value={panelSegment}
            values={PERSON_SEGMENT_KEYS}
          />
        </View>
      </View>
      <Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />
      <LoadingOverlay {...actionFeedback.overlayProps} />
      <AvatarViewerModal
        imageUrl={person.avatarUrl ?? null}
        label={person.displayName}
        onClose={() => setAvatarViewerVisible(false)}
        visible={avatarViewerVisible}
      />
    </SafeAreaView>
  );
}
