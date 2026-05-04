import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ActivityItemDto } from '@happy-circles/application';

import { BrandedRefreshScrollView } from '@/components/branded-refresh-control';
import { DirectionPill } from '@/components/direction-pill';
import { EmptyState } from '@/components/empty-state';
import { AppAvatar } from '@/components/app-avatar';
import { AvatarViewerModal } from '@/components/avatar-viewer-modal';
import { HappyCirclesMotion } from '@/components/happy-circles-motion';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { LoadingOverlay } from '@/components/loading-overlay';
import { MessageBanner } from '@/components/message-banner';
import { PendingFinancialRequestCard } from '@/components/pending-financial-request-card';
import { PendingSnippetCard } from '@/components/pending-snippet-card';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { Snackbar } from '@/components/snackbar';
import { SwipePager } from '@/components/swipe-pager';
import { showBlockedActionAlert, useDelayedBusy, useFeedbackSnackbar } from '@/lib/action-feedback';
import { formatCop } from '@/lib/data';
import {
  buildHistoryCases,
  friendlyHistoryStepLabel,
  historyCardTitle,
  historyCaseEyebrow,
  historyCaseMeta,
  historyCaseStatusLabel,
  historyCaseStatusTone,
  historyImpactLabel,
  historyImpactTone,
  historyStepAmountLabel,
  toHistoryFeedItem,
  type HistoryCaseItem,
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
import {
  DEFAULT_TRANSACTION_CATEGORY,
  type UserTransactionCategory,
  isUserTransactionCategory,
  transactionCategoryLabel,
} from '@/lib/transaction-categories';
import {
  transactionContextLabel,
  transactionMetaLabel,
  transactionStatusLabel,
  transactionStatusTone,
} from '@/lib/transaction-presentation';
import { useSession } from '@/providers/session-provider';

type PersonSegmentKey = 'pending' | 'history';
type PendingActionKey = 'accept' | 'reject' | 'approve' | 'execute';
const PERSON_SEGMENT_KEYS: readonly PersonSegmentKey[] = ['pending', 'history'];
const RESULT_OVERLAY_DURATION_MS = 2200;

export interface PersonDetailScreenProps {
  readonly focusItemId?: string;
  readonly initialPanel?: PersonSegmentKey;
  readonly userId: string;
}
interface BannerState {
  readonly message: string;
  readonly tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

interface ActionOverlayState {
  readonly message?: string;
  readonly title: string;
  readonly variant: 'success' | 'danger';
}

interface AmendmentErrors {
  readonly amount?: string;
  readonly description?: string;
}

function readResultStatus(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const status = (value as Record<string, unknown>)['status'];
  return typeof status === 'string' ? status : null;
}

function readNestedStatus(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return readResultStatus((value as Record<string, unknown>)[key]);
}

function splitSubtitleSegments(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function buildFinancialRequestPendingContent(item: ActivityItemDto): {
  readonly createdByLabel: string;
  readonly detail: string;
  readonly createdAtLabel: string;
} {
  const parts = splitSubtitleSegments(item.subtitle);
  const [createdByLabel, detail, createdAtLabel] = parts;

  return {
    createdByLabel: createdByLabel ?? 'Persona',
    detail: detail ?? item.subtitle,
    createdAtLabel: createdAtLabel ?? '',
  };
}

function isInviteHistoryStep(step: HistoryCaseItem): boolean {
  return step.detail === 'Invitacion de amistad' || step.detail === 'Acceso privado';
}

function historyStepMetaLabel(step: HistoryCaseItem): string {
  if (isInviteHistoryStep(step)) {
    return [step.happenedAtLabel, step.subtitle].filter(Boolean).join(' - ');
  }

  return step.happenedAtLabel
    ? `${step.happenedAtLabel} · ${transactionCategoryLabel(step.category)}`
    : transactionCategoryLabel(step.category);
}

function pendingSnippetTone(
  item: ActivityItemDto,
): 'primary' | 'success' | 'warning' | 'neutral' | 'danger' | 'cycle' {
  if (item.kind === 'settlement_proposal' && item.status === 'approved') {
    return 'cycle';
  }

  if (item.status === 'pending_approvals' || item.status === 'requires_you') {
    return 'warning';
  }

  if (item.status === 'approved') {
    return 'primary';
  }

  if (item.status === 'rejected') {
    return 'danger';
  }

  return 'neutral';
}

function pendingStatusLabel(status: string): string {
  if (status === 'pending_approvals') {
    return 'Pendiente';
  }

  if (status === 'approved') {
    return 'Aprobado';
  }

  if (status === 'waiting_other_side') {
    return 'En espera';
  }

  return status;
}

function buildFocusCandidates(value: string | undefined): Set<string> {
  const candidates = new Set<string>();
  if (!value) {
    return candidates;
  }

  candidates.add(value);
  try {
    candidates.add(decodeURIComponent(value));
  } catch {
    // The raw value is still usable if decoding fails.
  }

  return candidates;
}

function matchesFocusedTransaction(
  item: Pick<ActivityItemDto, 'id' | 'originRequestId' | 'originSettlementProposalId'>,
  candidates: ReadonlySet<string>,
): boolean {
  return (
    candidates.has(item.id) ||
    (item.originRequestId ? candidates.has(item.originRequestId) : false) ||
    (item.originSettlementProposalId ? candidates.has(item.originSettlementProposalId) : false)
  );
}

export function PersonDetailScreen({ focusItemId, initialPanel, userId }: PersonDetailScreenProps) {
  const router = useRouter();
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
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);
  const [panelSegment, setPanelSegment] = useState<PersonSegmentKey>(initialPanel ?? 'history');
  const [visualPanelSegment, setVisualPanelSegment] = useState<PersonSegmentKey>(panelSegment);
  const [actionOverlay, setActionOverlay] = useState<ActionOverlayState | null>(null);
  const [avatarViewerVisible, setAvatarViewerVisible] = useState(false);
  const { snackbar, showSnackbar } = useFeedbackSnackbar();
  const showBusyOverlay = useDelayedBusy(Boolean(busyKey));
  const resultOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItems = person?.pendingItems ?? [];
  const focusCandidates = useMemo(() => buildFocusCandidates(focusItemId), [focusItemId]);
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

  useEffect(
    () => () => {
      if (resultOverlayTimeoutRef.current) {
        clearTimeout(resultOverlayTimeoutRef.current);
      }
    },
    [],
  );

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

  useEffect(() => {
    if (!focusedHistoryCaseId) {
      return;
    }

    setExpandedCaseIds((current) =>
      current[0] === focusedHistoryCaseId ? current : [focusedHistoryCaseId],
    );
  }, [focusedHistoryCaseId]);

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) => (current[0] === caseId ? [] : [caseId]));
  }

  function changePanelSegment(segment: PersonSegmentKey) {
    setVisualPanelSegment(segment);
    setPanelSegment(segment);
  }

  function showActionOverlay(nextOverlay: ActionOverlayState) {
    if (resultOverlayTimeoutRef.current) {
      clearTimeout(resultOverlayTimeoutRef.current);
    }

    setActionOverlay(nextOverlay);

    return new Promise<void>((resolve) => {
      resultOverlayTimeoutRef.current = setTimeout(() => {
        setActionOverlay(null);
        resultOverlayTimeoutRef.current = null;
        resolve();
      }, RESULT_OVERLAY_DURATION_MS);
    });
  }

  function toggleAmendment(item: ActivityItemDto) {
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
      showSnackbar('Nuevo monto enviado.', 'success');
    } catch (error) {
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
    setBusyKey(key);
    setBanner(null);
    setActionOverlay(null);

    try {
      if (kind === 'financial_request') {
        if (action === 'accept') {
          const response = await acceptRequest.mutateAsync(itemId);
          const autoCycleStatus = readNestedStatus(response, 'autoCycleJob');
          await showActionOverlay({
            message:
              autoCycleStatus === 'queued'
                ? 'Estamos buscando Happy Circles en segundo plano.'
                : 'La transaccion quedo confirmada.',
            title: 'Propuesta aceptada',
            variant: 'success',
          });
        } else {
          await rejectRequest.mutateAsync(itemId);
          showSnackbar('Propuesta no aceptada.', 'neutral');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'pending_approvals') {
        if (action === 'approve') {
          const response = await approveSettlement.mutateAsync(itemId);
          const nextStatus = readResultStatus(response);
          if (nextStatus === 'stale') {
            setBanner({
              message: 'La propuesta quedo obsoleta porque el grafo cambio.',
              tone: 'warning',
            });
          } else {
            await showActionOverlay({
              message:
                nextStatus === 'approved'
                  ? 'Todos aceptaron. El Happy Circle quedo listo.'
                  : 'Tu aprobacion quedo registrada.',
              title: 'Decision guardada',
              variant: 'success',
            });
          }
        } else {
          await rejectSettlement.mutateAsync(itemId);
          showSnackbar('Happy Circle no aprobado.', 'neutral');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'approved' && action === 'execute') {
        const response = await executeSettlement.mutateAsync(itemId);
        const nextStatus = readNestedStatus(response, 'nextAutoCycleJob');
        await showActionOverlay({
          message:
            nextStatus === 'queued'
              ? 'Estamos buscando el siguiente en segundo plano.'
              : 'La transaccion quedo confirmada.',
          title: 'Happy Circle completado',
          variant: 'success',
        });
      }
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : 'No se pudo completar la accion.';
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

      await showActionOverlay({
        message: nextMessage,
        title: 'No se pudo completar',
        variant: 'danger',
      });
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
    Alert.alert(input.title, input.message, [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: input.confirmLabel,
        style: 'destructive',
        onPress: input.onConfirm,
      },
    ]);
  }

  function renderPendingItem(item: ActivityItemDto) {
    if (item.kind === 'financial_request') {
      const financialRequestContent = buildFinancialRequestPendingContent(item);
      return (
        <PendingFinancialRequestCard
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
          historySteps={item.pendingHistorySteps}
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
                    title: 'No aceptar propuesta',
                    message:
                      'Avisaremos que no aceptas este movimiento y seguira pendiente de otra resolucion.',
                    confirmLabel: 'No aceptar',
                    onConfirm: () =>
                      void handlePendingItemAction(item.id, item.kind, item.status, 'reject'),
                  })
          }
          onSubmitAmendment={busyKey ? undefined : () => void handleAmendment(item.id)}
          onToggleAmendment={busyKey ? undefined : () => toggleAmendment(item)}
          responseState={item.status === 'requires_you' ? 'requires_you' : 'waiting_other_side'}
          showAmendment={activeAmendmentItemId === item.id}
          title={item.title}
        />
      );
    }

    return (
      <PendingSnippetCard
        amountLabel={
          typeof item.amountMinor === 'number' && item.amountMinor > 0
            ? formatCop(item.amountMinor)
            : null
        }
        detail={
          item.kind === 'settlement_proposal'
            ? transactionContextLabel(item, person?.displayName ?? 'Persona')
            : (splitSubtitleSegments(item.subtitle)[0] ?? item.subtitle)
        }
        eyebrow={item.kind === 'settlement_proposal' ? 'Happy Circle' : 'Pendiente'}
        key={item.id}
        meta={
          item.kind === 'settlement_proposal'
            ? transactionMetaLabel(item)
            : splitSubtitleSegments(item.subtitle).slice(1).join(' | ') || null
        }
        onPress={
          item.href
            ? () => pushRoute(router, item.href as Parameters<typeof router.push>[0])
            : undefined
        }
        statusLabel={transactionStatusLabel(item) ?? pendingStatusLabel(item.status)}
        statusTone={transactionStatusTone(item)}
        tone={pendingSnippetTone(item)}
        title={
          item.kind === 'settlement_proposal'
            ? (transactionStatusLabel(item) ?? 'Happy Circle')
            : item.title
        }
        variant="default"
      >
        {item.kind === 'settlement_proposal' && item.status === 'pending_approvals' ? (
          <View style={styles.pendingActionStack}>
            <View style={styles.pendingActionSlot}>
              <PrimaryAction
                compact
                loading={busyKey === `${item.id}:approve`}
                label={busyKey === `${item.id}:approve` ? 'Aprobando...' : 'Aprobar Circle'}
                onPress={
                  busyKey
                    ? undefined
                    : () => void handlePendingItemAction(item.id, item.kind, item.status, 'approve')
                }
              />
            </View>
            <Pressable
              onPress={
                busyKey
                  ? undefined
                  : () =>
                      confirmPendingAction({
                        title: 'No aprobar Circle',
                        message:
                          'Tu respuesta dejara este Happy Circle como no aprobado para el resto del circulo.',
                        confirmLabel: 'No aprobar',
                        onConfirm: () =>
                          void handlePendingItemAction(item.id, item.kind, item.status, 'reject'),
                      })
              }
              style={({ pressed }) => [
                styles.inlineAction,
                pressed ? styles.inlineActionPressed : null,
              ]}
            >
              <Text style={[styles.inlineActionText, styles.inlineActionDangerText]}>
                {busyKey === `${item.id}:reject` ? 'Enviando...' : 'No aprobar'}
              </Text>
            </Pressable>
          </View>
        ) : item.kind === 'settlement_proposal' && item.status === 'approved' ? (
          <View style={styles.pendingActionStack}>
            <View style={styles.pendingActionSlot}>
              <PrimaryAction
                compact
                loading={busyKey === `${item.id}:execute`}
                label={busyKey === `${item.id}:execute` ? 'Completando...' : 'Completar Circle'}
                onPress={
                  busyKey
                    ? undefined
                    : () =>
                        Alert.alert(
                          'Completar Circle',
                          'Aplicaremos este Happy Circle al historial y ya no podras deshacerlo desde aqui.',
                          [
                            {
                              text: 'Cancelar',
                              style: 'cancel',
                            },
                            {
                              text: 'Completar',
                              style: 'destructive',
                              onPress: () =>
                                void handlePendingItemAction(
                                  item.id,
                                  item.kind,
                                  item.status,
                                  'execute',
                                ),
                            },
                          ],
                        )
                }
              />
            </View>
          </View>
        ) : null}
      </PendingSnippetCard>
    );
  }

  function renderPanelSegmentPage(segment: PersonSegmentKey) {
    return (
      <BrandedRefreshScrollView
        fillViewport
        contentContainerStyle={styles.sheetScrollContent}
        keyboardShouldPersistTaps="handled"
        refresh={refresh}
        refreshIndicatorStyle={styles.refreshIndicator}
        showsVerticalScrollIndicator={false}
      >
        {segment === 'pending' ? (
          orderedPendingItems.length > 0 ? (
            orderedPendingItems.map((item) => renderPendingItem(item))
          ) : (
            <EmptyState
              description="Cuando haya algo pendiente con esta persona, aparecera aqui."
              title="Nada pendiente"
            />
          )
        ) : historyCases.length === 0 ? (
          <EmptyState
            description="Cuando haya propuestas o movimientos confirmados con esta persona, apareceran aqui."
            title="Sin movimientos todavia"
          />
        ) : (
          historyCases.map((itemCase) => {
            const isExpanded = expandedCaseIds[0] === itemCase.id;
            const latest = itemCase.latest;
            const caseMeta = historyCaseMeta(itemCase) || null;
            const caseTone = historyImpactTone(latest) as HistoryCaseTone;
            const caseTitle = friendlyHistoryStepLabel(latest);
            const caseDescription = historyCardTitle(itemCase);

            return (
              <HistoryCaseCard
                amountLabel={historyStepAmountLabel(latest)}
                category={latest.category}
                description={caseDescription !== caseTitle ? caseDescription : null}
                eyebrow={historyCaseEyebrow(itemCase)}
                isCycleSnippet={itemCase.isCycleSnippet}
                isExpanded={isExpanded}
                key={itemCase.id}
                meta={caseMeta}
                onToggle={() => toggleHistoryCase(itemCase.id)}
                statusLabel={historyCaseStatusLabel(itemCase)}
                statusTone={historyCaseStatusTone(itemCase)}
                steps={itemCase.steps.map((step) => ({
                  id: step.id,
                  title: friendlyHistoryStepLabel(step),
                  amountLabel: historyStepAmountLabel(step),
                  impact: historyImpactLabel(step),
                  meta: historyStepMetaLabel(step),
                  tone: historyImpactTone(step) as HistoryCaseTone,
                }))}
                title={caseTitle}
                tone={caseTone}
              />
            );
          })
        )}
      </BrandedRefreshScrollView>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell
        headerVariant="plain"
        largeTitle={false}
        subtitle="Cargando esta relacion."
        title="Persona"
      >
        <HappyCirclesMotion size={108} variant="loading" />
        <Text style={styles.supportText}>Estamos leyendo el saldo y el historial real.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell
        headerVariant="plain"
        largeTitle={false}
        refresh={refresh}
        subtitle="No pudimos cargar esta relacion."
        title="Persona"
      >
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (!person) {
    return (
      <ScreenShell
        headerVariant="plain"
        largeTitle={false}
        refresh={refresh}
        subtitle="No encontramos esta relacion."
        title="Persona"
      >
        <EmptyState
          description="Prueba desde la lista principal de personas o confirma que la relacion exista en Supabase."
          title="Sin relacion activa"
        />
      </ScreenShell>
    );
  }

  const hasPendingItems = person.pendingCount > 0;
  const pendingLabel = `${person.pendingCount} pendiente${person.pendingCount > 1 ? 's' : ''}`;
  const isSettledBalance = person.netAmountMinor === 0;
  const balanceTone = isSettledBalance
    ? 'neutral'
    : person.direction === 'owes_me'
      ? 'positive'
      : 'negative';
  const balanceVisual = toneVisual(balanceTone);
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.layout}>
        <View style={styles.fixedTop}>
          <View style={styles.heroBlock}>
            <Pressable
              onPress={() => setAvatarViewerVisible(true)}
              style={({ pressed }) => [styles.avatarButton, pressed ? styles.pressed : null]}
            >
              <AppAvatar imageUrl={person.avatarUrl ?? null} label={person.displayName} size={80} />
            </Pressable>
            <Text style={styles.contactFlatName}>{person.displayName}</Text>
            {!isSettledBalance ? (
              <Text
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
              </Text>
            ) : !hasPendingItems ? (
              <Text
                style={[
                  styles.balanceSummary,
                  balanceSummaryColor ? { color: balanceSummaryColor } : null,
                ]}
                adjustsFontSizeToFit
                minimumFontScale={0.9}
                numberOfLines={1}
              >
                {balanceSummary}
              </Text>
            ) : null}
            {hasPendingItems ? (
              <View style={styles.pendingHeroBadge}>
                <Ionicons color={theme.colors.warning} name="alert-circle-outline" size={12} />
                <Text style={styles.pendingHeroBadgeText}>{pendingLabel}</Text>
              </View>
            ) : null}
            {heroMeta ? (
              <View style={styles.heroMetaRow}>
                {isSettledBalance && hasPendingItems ? (
                  <Ionicons color={theme.colors.muted} name="shield-checkmark-outline" size={14} />
                ) : null}
                <Text style={styles.heroMeta}>{heroMeta}</Text>
              </View>
            ) : null}
          </View>

          {canRegisterTransactions ? (
            <View style={styles.quickActionRowFlat}>
              <DirectionPill
                direction="i_owe"
                onPress={() =>
                  pushRoute(router, {
                    pathname: '/register',
                    params: {
                      personId: person.userId,
                      direction: 'i_owe',
                    },
                  })
                }
                style={styles.quickActionPill}
              />

              <DirectionPill
                direction="owes_me"
                onPress={() =>
                  pushRoute(router, {
                    pathname: '/register',
                    params: {
                      personId: person.userId,
                      direction: 'owes_me',
                    },
                  })
                }
                style={styles.quickActionPill}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.panelArea}>
          <View style={styles.tabBar}>
            <Pressable
              onPress={() => changePanelSegment('pending')}
              style={({ pressed }) => [
                styles.tabButton,
                visualPanelSegment === 'pending' ? styles.tabButtonActive : null,
                pressed ? styles.tabButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  visualPanelSegment === 'pending' ? styles.tabLabelActive : null,
                ]}
              >
                Pendientes
              </Text>
            </Pressable>
            <View style={styles.tabDivider} />
            <Pressable
              onPress={() => changePanelSegment('history')}
              style={({ pressed }) => [
                styles.tabButton,
                visualPanelSegment === 'history' ? styles.tabButtonActive : null,
                pressed ? styles.tabButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  visualPanelSegment === 'history' ? styles.tabLabelActive : null,
                ]}
              >
                Historial
              </Text>
            </Pressable>
          </View>

          {banner ? <MessageBanner message={banner.message} tone={banner.tone} /> : null}

          <SwipePager
            accessibilityLabel="Paneles de la relacion"
            onChange={changePanelSegment}
            onPreviewChange={setVisualPanelSegment}
            renderPage={(segment) => renderPanelSegmentPage(segment)}
            style={styles.sheetScrollWrap}
            value={panelSegment}
            values={PERSON_SEGMENT_KEYS}
          />
        </View>
      </View>
      <Snackbar message={snackbar.message} tone={snackbar.tone} visible={snackbar.visible} />
      <LoadingOverlay
        message={
          actionOverlay?.message ?? 'No cierres esta pantalla mientras registramos la respuesta.'
        }
        title={actionOverlay?.title ?? 'Procesando transaccion'}
        variant={actionOverlay?.variant ?? 'loading'}
        visible={showBusyOverlay || Boolean(actionOverlay)}
      />
      <AvatarViewerModal
        imageUrl={person.avatarUrl ?? null}
        label={person.displayName}
        onClose={() => setAvatarViewerVisible(false)}
        visible={avatarViewerVisible}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  layout: {
    alignSelf: 'center',
    flex: 1,
    gap: theme.spacing.lg,
    maxWidth: 560,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    width: '100%',
  },
  refreshIndicator: {
    top: theme.spacing.md,
  },
  fixedTop: {
    gap: theme.spacing.md,
  },
  heroBlock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    position: 'relative',
  },
  avatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
  contactFlatName: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  balanceSummary: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 2,
    maxWidth: '100%',
    textAlign: 'center',
  },
  balanceSummaryAmount: {
    fontSize: theme.typography.title2,
    lineHeight: 30,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  pendingHeroBadge: {
    alignItems: 'center',
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    gap: 4,
    position: 'absolute',
    right: 0,
    top: 0,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  pendingHeroBadgeText: {
    color: theme.colors.warning,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    lineHeight: 13,
  },
  heroMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
  },
  heroMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
    textAlign: 'center',
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  quickActionRowFlat: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'center',
  },
  quickActionPill: {
    flex: 1,
    maxWidth: 240,
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  tabBar: {
    alignItems: 'stretch',
    borderBottomColor: theme.colors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
    borderBottomWidth: 2,
  },
  tabButtonPressed: {
    opacity: 0.88,
  },
  tabDivider: {
    backgroundColor: theme.colors.hairline,
    marginBottom: theme.spacing.sm,
    width: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: theme.colors.text,
  },
  sheetScrollWrap: {
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
    position: 'relative',
  },
  sheetScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  pendingActionStack: {
    gap: theme.spacing.xs,
  },
  pendingActionSlot: {
    width: '100%',
  },
  inlineAction: {
    paddingVertical: 2,
  },
  inlineActionPressed: {
    opacity: 0.62,
  },
  inlineActionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlineActionDangerText: {
    color: theme.colors.danger,
  },
  neutral: {
    color: theme.colors.textMuted,
  },
  danger: {
    color: theme.colors.danger,
  },
});
