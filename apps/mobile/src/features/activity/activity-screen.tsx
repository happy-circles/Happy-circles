import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ActivityItemDto } from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { MessageBanner } from '@/components/message-banner';
import { PendingFinancialRequestCard } from '@/components/pending-financial-request-card';
import { PendingSnippetCard } from '@/components/pending-snippet-card';
import { PrimaryAction } from '@/components/primary-action';
import { SectionBlock } from '@/components/section-block';
import { formatCop } from '@/lib/data';
import {
  buildHistoryCases,
  friendlyHistoryStepLabel,
  historyCardTitle,
  historyCaseEyebrow,
  historyCaseImpactLabel,
  historyCaseMeta,
  historyImpactLabel,
  historyImpactTone,
  isHistoryCaseItem,
  historyStatusLabel,
  historyStatusTone,
} from '@/lib/history-cases';
import {
  useAcceptFinancialRequestMutation,
  useAcceptRelationshipInviteMutation,
  useAmendFinancialRequestMutation,
  useAppSnapshot,
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectFinancialRequestMutation,
  useRejectRelationshipInviteMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';

type AlertLane = 'urgent' | 'resolve' | 'follow_up';
type ActivitySegmentKey = 'pending' | 'history';
type PendingActionKey = 'accept' | 'reject' | 'approve' | 'execute';

interface PendingCardPresentation {
  readonly eyebrow: string;
  readonly primaryAction?: {
    readonly key: PendingActionKey;
    readonly label: string;
  };
  readonly secondaryAction?: {
    readonly key: 'reject';
    readonly label: string;
  };
}

interface PendingSnippetContent {
  readonly detail?: string;
  readonly meta?: string;
  readonly variant: 'default' | 'accent';
}

interface FinancialRequestPendingContent {
  readonly createdByLabel: string;
  readonly detail: string;
  readonly createdAtLabel: string;
}

interface PendingGroup {
  readonly key: AlertLane;
  readonly title: string;
  readonly items: readonly ActivityItemDto[];
}

function isUrgentAlert(item: ActivityItemDto): boolean {
  return (
    item.kind === 'settlement_proposal' &&
    (item.status === 'pending_approvals' || item.status === 'approved')
  );
}

function classifyAlertLane(item: ActivityItemDto): AlertLane {
  if (isUrgentAlert(item)) {
    return 'urgent';
  }

  if (item.status === 'requires_you') {
    return 'resolve';
  }

  return 'follow_up';
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

function readNestedProposalId(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const nested = (value as Record<string, unknown>)[key];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) {
    return null;
  }

  const proposalId = (nested as Record<string, unknown>)['proposalId'];
  return typeof proposalId === 'string' ? proposalId : null;
}

function actionLabel(
  itemId: string,
  busyKey: string | null,
  action: PendingActionKey,
  idleLabel: string,
  busyLabel: string,
): string {
  return busyKey === `${itemId}:${action}` ? busyLabel : idleLabel;
}

function buildPendingCardPresentation(
  item: ActivityItemDto,
  busyKey: string | null,
): PendingCardPresentation {
  if (item.kind === 'financial_request' && item.status === 'requires_you') {
    return {
      eyebrow: 'Decision inmediata',
      primaryAction: {
        key: 'accept',
        label: actionLabel(item.id, busyKey, 'accept', 'Aceptar', 'Aceptando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'No aceptar', 'Enviando...'),
      },
    };
  }

  if (item.kind === 'financial_request' && item.status === 'waiting_other_side') {
    return {
      eyebrow: 'Esperando respuesta',
    };
  }

  if (item.kind === 'settlement_proposal' && item.status === 'pending_approvals') {
    return {
      eyebrow: 'Revision compartida',
      primaryAction: {
        key: 'approve',
        label: actionLabel(item.id, busyKey, 'approve', 'Aprobar cierre', 'Aprobando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'No aprobar', 'Enviando...'),
      },
    };
  }

  if (item.kind === 'settlement_proposal' && item.status === 'waiting_other_side') {
    return {
      eyebrow: 'Esperando a otros',
    };
  }

  if (item.kind === 'settlement_proposal' && item.status === 'approved') {
    return {
      eyebrow: 'Listo para cerrar',
      primaryAction: {
        key: 'execute',
        label: actionLabel(item.id, busyKey, 'execute', 'Ejecutar cierre', 'Ejecutando...'),
      },
    };
  }

  if (item.kind === 'relationship_invite' && item.status === 'requires_you') {
    return {
      eyebrow: 'Nueva invitacion',
      primaryAction: {
        key: 'accept',
        label: actionLabel(item.id, busyKey, 'accept', 'Aceptar invitacion', 'Aceptando...'),
      },
      secondaryAction: {
        key: 'reject',
        label: actionLabel(item.id, busyKey, 'reject', 'Rechazar', 'Rechazando...'),
      },
    };
  }

  if (item.kind === 'relationship_invite' && item.status === 'waiting_other_side') {
    return {
      eyebrow: 'Esperando respuesta',
    };
  }

  return {
    eyebrow: 'Seguimiento',
  };
}

function splitSubtitleSegments(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function buildPendingSnippetContent(
  item: ActivityItemDto,
  lane: AlertLane,
): PendingSnippetContent {
  const parts = splitSubtitleSegments(item.subtitle);

  if (item.kind === 'financial_request') {
    const [creatorLabel, detail, createdAtLabel] = parts;
    const createdByLabel =
      creatorLabel === 'Tu' ? 'Creado por ti' : creatorLabel ? `Creado por ${creatorLabel}` : null;

    return {
      detail: detail ?? item.subtitle,
      meta: [createdByLabel, createdAtLabel ?? null].filter(Boolean).join(' | '),
      variant: 'default',
    };
  }

  if (item.kind === 'settlement_proposal') {
    const [detail, meta] = parts;
    return {
      detail: detail ?? item.subtitle,
      meta: meta ?? null,
      variant: 'default',
    };
  }

  if (item.kind === 'relationship_invite') {
    const [detail, meta] = parts;
    return {
      detail: detail ?? item.subtitle,
      meta: meta ?? null,
      variant: 'default',
    };
  }

  const [detail, meta] = parts;
  return {
    detail: detail ?? item.subtitle,
    meta: meta ?? null,
    variant: 'default',
  };
}

function pendingSnippetTone(
  item: ActivityItemDto,
): 'primary' | 'success' | 'warning' | 'neutral' | 'danger' {
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

function pendingDetailHref(
  item: ActivityItemDto,
): Parameters<ReturnType<typeof useRouter>['push']>[0] | null {
  if (!item.href) {
    return null;
  }

  return item.href as Parameters<ReturnType<typeof useRouter>['push']>[0];
}

function buildFinancialRequestPendingContent(
  item: ActivityItemDto,
): FinancialRequestPendingContent {
  const parts = splitSubtitleSegments(item.subtitle);
  const [createdByLabel, detail, createdAtLabel] = parts;

  return {
    createdByLabel: createdByLabel ?? 'Persona',
    detail: detail ?? item.subtitle,
    createdAtLabel: createdAtLabel ?? '',
  };
}

export function ActivityScreen() {
  const router = useRouter();
  const snapshotQuery = useAppSnapshot();
  const acceptRequest = useAcceptFinancialRequestMutation();
  const amendRequest = useAmendFinancialRequestMutation();
  const acceptInvite = useAcceptRelationshipInviteMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const rejectInvite = useRejectRelationshipInviteMutation();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();

  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);
  const [activeAmendmentItemId, setActiveAmendmentItemId] = useState<string | null>(null);
  const [amendmentAmount, setAmendmentAmount] = useState('');
  const [amendmentDescription, setAmendmentDescription] = useState('');
  const [panelSegment, setPanelSegment] = useState<ActivitySegmentKey>('pending');

  const sections = snapshotQuery.data?.activitySections ?? [];
  const pendingSection = useMemo(
    () => sections.find((item) => item.key === 'pending'),
    [sections],
  );
  const historySection = useMemo(
    () => sections.find((item) => item.key === 'history'),
    [sections],
  );
  const pendingItems = pendingSection?.items ?? [];
  const historyCases = useMemo(
    () => buildHistoryCases((historySection?.items ?? []).filter(isHistoryCaseItem)),
    [historySection?.items],
  );
  const urgentItems = useMemo(
    () => pendingItems.filter((item) => classifyAlertLane(item) === 'urgent'),
    [pendingItems],
  );
  const resolveItems = useMemo(
    () => pendingItems.filter((item) => classifyAlertLane(item) === 'resolve'),
    [pendingItems],
  );
  const followUpItems = useMemo(
    () => pendingItems.filter((item) => classifyAlertLane(item) === 'follow_up'),
    [pendingItems],
  );
  const alertCount = pendingItems.length;
  const pendingGroups = useMemo<PendingGroup[]>(
    () => {
      const groups: PendingGroup[] = [];

      if (urgentItems.length > 0) {
        groups.push({ key: 'urgent', title: 'Urgentes', items: urgentItems });
      }

      if (resolveItems.length > 0) {
        groups.push({ key: 'resolve', title: 'Por resolver', items: resolveItems });
      }

      if (followUpItems.length > 0) {
        groups.push({ key: 'follow_up', title: 'En seguimiento', items: followUpItems });
      }

      return groups;
    },
    [followUpItems, resolveItems, urgentItems],
  );

  useEffect(() => {
    setPanelSegment(alertCount > 0 ? 'pending' : 'history');
  }, [alertCount]);

  useEffect(() => {
    if (
      activeAmendmentItemId &&
      !pendingItems.some((item) => item.id === activeAmendmentItemId)
    ) {
      setActiveAmendmentItemId(null);
      setAmendmentAmount('');
      setAmendmentDescription('');
    }
  }, [activeAmendmentItemId, pendingItems]);

  function showAutoCyclePrompt(proposalId: string | null, status: string | null) {
    if (status !== 'pending_approvals' && status !== 'approved') {
      return;
    }

    Alert.alert(
      status === 'approved' ? 'Cierre listo para ejecutar' : 'Cierre de circulo pendiente',
      status === 'approved'
        ? 'Todos ya aprobaron este cierre. Quieres abrirlo ahora para ejecutarlo?'
        : 'Se detecto un cierre automatico en tu circulo. Quieres revisarlo ahora?',
      [
        {
          text: 'Luego',
          style: 'cancel',
        },
        {
          text: 'Abrir',
          onPress: () => {
            router.push(proposalId ? `/settlements/${proposalId}` : '/activity');
          },
        },
      ],
    );
  }

  function renderPendingCard(item: ActivityItemDto, lane: AlertLane) {
    if (item.kind === 'financial_request') {
      const financialRequestContent = buildFinancialRequestPendingContent(item);
      const detailHref = pendingDetailHref(item);
      return (
        <PendingFinancialRequestCard
          amendmentAmount={amendmentAmount}
          amendmentDescription={amendmentDescription}
          amountMinor={item.amountMinor ?? 0}
          amountTone={
            item.tone === 'positive' || item.tone === 'negative'
              ? item.tone
              : 'neutral'
          }
          busyAccept={busyKey === `${item.id}:accept`}
          busyAmendment={busyKey === `${item.id}:amendment`}
          busyReject={busyKey === `${item.id}:reject`}
          counterpartyName={item.counterpartyLabel ?? 'Persona'}
          createdAtLabel={financialRequestContent.createdAtLabel}
          createdByLabel={financialRequestContent.createdByLabel}
          description={financialRequestContent.detail}
          key={item.id}
          onAccept={
            busyKey
              ? undefined
              : () => void handlePendingAction(item.id, item.kind, item.status, 'accept')
          }
          onChangeAmendmentAmount={setAmendmentAmount}
          onChangeAmendmentDescription={setAmendmentDescription}
          onPress={
            detailHref
              ? () => router.push(detailHref)
              : undefined
          }
          onReject={
            busyKey
              ? undefined
              : () => void handlePendingAction(item.id, item.kind, item.status, 'reject')
          }
          onSubmitAmendment={
            busyKey
              ? undefined
              : () => void handleAmendment(item.id)
          }
          onToggleAmendment={
            busyKey
              ? undefined
              : () => toggleAmendment(item)
          }
          responseState={
            item.status === 'requires_you' ? 'requires_you' : 'waiting_other_side'
          }
          showAmendment={activeAmendmentItemId === item.id}
          title={item.title}
        />
      );
    }

    const cardPresentation = buildPendingCardPresentation(item, busyKey);
    const snippetContent = buildPendingSnippetContent(item, lane);
    const hasInlineActions = Boolean(cardPresentation.primaryAction || cardPresentation.secondaryAction);
    const detailHref = pendingDetailHref(item);

    return (
      <PendingSnippetCard
        amountLabel={
          typeof item.amountMinor === 'number' && item.amountMinor > 0
            ? formatCop(item.amountMinor)
            : null
        }
        detail={snippetContent.detail}
        eyebrow={cardPresentation.eyebrow}
        key={item.id}
        meta={snippetContent.meta}
        onPress={
          detailHref
            ? () => router.push(detailHref)
            : undefined
        }
        statusLabel={historyStatusLabel(item.status)}
        statusTone={historyStatusTone(item.status)}
        tone={pendingSnippetTone(item)}
        title={item.title}
        variant={snippetContent.variant}
      >
        {hasInlineActions ? (
          <View style={styles.cardActionStack}>
            {cardPresentation.primaryAction ? (
              <View style={styles.primaryActionSlot}>
                <PrimaryAction
                  compact
                  label={cardPresentation.primaryAction.label}
                  onPress={
                    busyKey
                      ? undefined
                      : () =>
                          void handlePendingAction(
                            item.id,
                            item.kind,
                            item.status,
                            cardPresentation.primaryAction!.key,
                          )
                  }
                />
              </View>
            ) : null}

            {cardPresentation.secondaryAction ? (
              <Pressable
                onPress={
                  busyKey
                    ? undefined
                    : () =>
                        void handlePendingAction(
                          item.id,
                          item.kind,
                          item.status,
                          cardPresentation.secondaryAction!.key,
                        )
                }
                style={({ pressed }) => [
                  styles.inlineAction,
                  styles.inlineActionDanger,
                  pressed ? styles.inlineActionPressed : null,
                ]}
              >
                <Text style={[styles.inlineActionText, styles.inlineActionDangerText]}>
                  {cardPresentation.secondaryAction.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </PendingSnippetCard>
    );
  }

  function toggleAmendment(item: ActivityItemDto) {
    if (activeAmendmentItemId === item.id) {
      setActiveAmendmentItemId(null);
      return;
    }

    const financialRequestContent = buildFinancialRequestPendingContent(item);
    setActiveAmendmentItemId(item.id);
    setAmendmentAmount(String(Math.max(1, Math.round((item.amountMinor ?? 0) / 100))));
    setAmendmentDescription(financialRequestContent.detail);
  }

  async function handleAmendment(requestId: string) {
    const amountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);
    const trimmedDescription = amendmentDescription.trim();

    if (amountMinor <= 0 || trimmedDescription.length === 0) {
      setMessage('Define un monto valido y escribe un concepto para proponer otro monto.');
      return;
    }

    setBusyKey(`${requestId}:amendment`);
    setMessage(null);

    try {
      await amendRequest.mutateAsync({
        requestId,
        amountMinor,
        description: trimmedDescription,
      });
      setActiveAmendmentItemId(null);
      setAmendmentAmount('');
      setAmendmentDescription('');
      setMessage('Nuevo monto enviado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar el nuevo monto.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePendingAction(
    itemId: string,
    kind: string,
    status: string,
    action: PendingActionKey,
  ) {
    const key = `${itemId}:${action}`;
    setBusyKey(key);
    setMessage(null);

    try {
      if (kind === 'financial_request') {
        if (action === 'accept') {
          const response = await acceptRequest.mutateAsync(itemId);
          const autoCycleStatus = readNestedStatus(response, 'autoCycleProposal');
          const autoCycleProposalId = readNestedProposalId(response, 'autoCycleProposal');
          setMessage(
            autoCycleStatus === 'pending_approvals'
              ? 'Propuesta aceptada. Tambien quedo un cierre de ciclo listo para revisar.'
              : 'Propuesta aceptada.',
          );
          showAutoCyclePrompt(autoCycleProposalId, autoCycleStatus);
        } else {
          await rejectRequest.mutateAsync(itemId);
          setMessage('Propuesta no aceptada.');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'pending_approvals') {
        if (action === 'approve') {
          const response = await approveSettlement.mutateAsync(itemId);
          const nextStatus = readResultStatus(response);
          setMessage(
            nextStatus === 'approved'
              ? 'Todos aceptaron. El cierre quedo aprobado.'
              : nextStatus === 'stale'
                ? 'La propuesta quedo obsoleta porque el grafo cambio.'
                : 'Tu aprobacion quedo registrada.',
          );
        } else {
          await rejectSettlement.mutateAsync(itemId);
          setMessage('Cierre no aprobado.');
        }
        return;
      }

      if (kind === 'settlement_proposal' && status === 'approved' && action === 'execute') {
        const response = await executeSettlement.mutateAsync(itemId);
        const nextStatus = readNestedStatus(response, 'nextAutoCycleProposal');
        const nextProposalId = readNestedProposalId(response, 'nextAutoCycleProposal');
        setMessage(
          nextStatus === 'pending_approvals'
            ? 'Cierre ejecutado. Ya quedo otro cierre de ciclo pendiente.'
            : 'Cierre ejecutado.',
        );
        showAutoCyclePrompt(nextProposalId, nextStatus);
        return;
      }

      if (kind === 'relationship_invite' && status === 'requires_you') {
        if (action === 'accept') {
          await acceptInvite.mutateAsync(itemId);
          setMessage('Invitacion aceptada.');
        } else {
          await rejectInvite.mutateAsync(itemId);
          setMessage('Invitacion rechazada.');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) =>
      current.includes(caseId)
        ? current.filter((item) => item !== caseId)
        : [...current, caseId],
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <Text style={styles.supportText}>Estamos leyendo las acciones reales desde Supabase.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (snapshotQuery.error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.layout}>
        <View style={styles.fixedTop}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>Alertas</Text>
          </View>
        </View>

        <View style={styles.panelArea}>
          <View style={styles.tabBar}>
            <Pressable
              onPress={() => setPanelSegment('pending')}
              style={({ pressed }) => [
                styles.tabButton,
                panelSegment === 'pending' ? styles.tabButtonActive : null,
                pressed ? styles.tabButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  panelSegment === 'pending' ? styles.tabLabelActive : null,
                ]}
              >
                Pendientes
              </Text>
            </Pressable>
            <View style={styles.tabDivider} />
            <Pressable
              onPress={() => setPanelSegment('history')}
              style={({ pressed }) => [
                styles.tabButton,
                panelSegment === 'history' ? styles.tabButtonActive : null,
                pressed ? styles.tabButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  panelSegment === 'history' ? styles.tabLabelActive : null,
                ]}
              >
                Historial
              </Text>
            </Pressable>
          </View>

          {message ? <MessageBanner message={message} /> : null}

          <View style={styles.sheetScrollWrap}>
            <ScrollView
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {panelSegment === 'pending' ? (
                alertCount === 0 ? (
                  <EmptyState
                    description={
                      pendingSection?.emptyMessage ??
                      'Cuando haya algo por responder o seguir, aparecera aqui.'
                    }
                    title="Nada pendiente"
                  />
                ) : (
                  pendingGroups.length === 1 ? (
                    pendingGroups[0]!.items.map((item) =>
                      renderPendingCard(item, pendingGroups[0]!.key),
                    )
                  ) : (
                    pendingGroups.map((group) => (
                      <SectionBlock key={group.key} title={group.title}>
                        {group.items.map((item) => renderPendingCard(item, group.key))}
                      </SectionBlock>
                    ))
                  )
                )
              ) : historyCases.length === 0 ? (
                <EmptyState
                  description={
                    historySection?.emptyMessage ??
                    'Cuando haya actividad registrada, aparecera aqui.'
                  }
                  title="Sin historial reciente"
                />
              ) : (
                historyCases.map((itemCase) => {
                  const isExpanded = expandedCaseIds.includes(itemCase.id);
                  const latest = itemCase.latest;
                  const caseMeta = historyCaseMeta(itemCase) || null;
                  const caseImpact = historyCaseImpactLabel(itemCase);
                  const caseTone = historyImpactTone(latest) as HistoryCaseTone;

                  return (
                    <HistoryCaseCard
                      eyebrow={historyCaseEyebrow(itemCase)}
                      impact={caseImpact}
                      isCycleSnippet={itemCase.isCycleSnippet}
                      isExpanded={isExpanded}
                      key={itemCase.id}
                      meta={caseMeta}
                      onToggle={() => toggleHistoryCase(itemCase.id)}
                      statusLabel={historyStatusLabel(latest.status)}
                      statusTone={historyStatusTone(latest.status)}
                      steps={itemCase.steps.map((step) => ({
                        id: step.id,
                        title: friendlyHistoryStepLabel(step),
                        amountLabel:
                          typeof step.amountMinor === 'number' && step.amountMinor > 0
                            ? formatCop(step.amountMinor)
                            : null,
                        impact: historyImpactLabel(step),
                        meta: step.happenedAtLabel ?? null,
                        tone: historyImpactTone(step) as HistoryCaseTone,
                      }))}
                      title={historyCardTitle(itemCase)}
                      tone={caseTone}
                    />
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </View>
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
    gap: theme.spacing.sm,
    maxWidth: 560,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    width: '100%',
  },
  fixedTop: {
    gap: theme.spacing.xs,
  },
  heroBlock: {
    paddingBottom: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title1,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  panelArea: {
    flex: 1,
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
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
    fontSize: theme.typography.callout,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  sheetScrollWrap: {
    flex: 1,
  },
  sheetScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  loadingState: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  cardActionStack: {
    gap: theme.spacing.xs,
  },
  primaryActionSlot: {
    width: '100%',
  },
  inlineAction: {
    paddingVertical: 4,
  },
  inlineActionPressed: {
    opacity: 0.62,
  },
  inlineActionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  inlineActionDanger: {
    backgroundColor: 'transparent',
  },
  inlineActionDangerText: {
    color: theme.colors.danger,
  },
});
