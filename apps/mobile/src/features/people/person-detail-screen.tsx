import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ActivityItemDto } from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { AppAvatar } from '@/components/app-avatar';
import { HistoryCaseCard, type HistoryCaseTone } from '@/components/history-case-card';
import { MessageBanner } from '@/components/message-banner';
import { PendingFinancialRequestCard } from '@/components/pending-financial-request-card';
import { PendingSnippetCard } from '@/components/pending-snippet-card';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
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
  historyStatusLabel,
  historyStatusTone,
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
import { theme } from '@/lib/theme';

export interface PersonDetailScreenProps {
  readonly userId: string;
}

type PersonSegmentKey = 'pending' | 'history';
type PendingActionKey = 'accept' | 'reject' | 'approve' | 'execute';

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

export function PersonDetailScreen({ userId }: PersonDetailScreenProps) {
  const router = useRouter();
  const snapshotQuery = useAppSnapshot();
  const acceptRequest = useAcceptFinancialRequestMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const amendRequest = useAmendFinancialRequestMutation();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();
  const person = snapshotQuery.data?.peopleById[userId] ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeAmendmentItemId, setActiveAmendmentItemId] = useState<string | null>(null);
  const [amendmentAmount, setAmendmentAmount] = useState('');
  const [amendmentDescription, setAmendmentDescription] = useState('');
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);
  const [panelSegment, setPanelSegment] = useState<PersonSegmentKey>('history');
  const pendingItems = person?.pendingItems ?? [];

  useEffect(() => {
    if (!activeAmendmentItemId || !pendingItems.some((item) => item.id === activeAmendmentItemId)) {
      setActiveAmendmentItemId(null);
      setAmendmentAmount('');
      setAmendmentDescription('');
    }
  }, [activeAmendmentItemId, pendingItems]);

  useEffect(() => {
    if (pendingItems.length > 0) {
      setPanelSegment('pending');
      return;
    }

    setPanelSegment('history');
  }, [pendingItems.length]);

  const amendmentAmountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);
  const historyItems = useMemo(
    () => (person ? person.timeline.map((item) => toHistoryFeedItem(item, person.displayName)) : []),
    [person],
  );
  const historyCases = useMemo(() => {
    if (!person) {
      return [];
    }

    return buildHistoryCases(historyItems);
  }, [historyItems, person]);

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) =>
      current.includes(caseId) ? current.filter((item) => item !== caseId) : [...current, caseId],
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
    if (amendmentAmountMinor <= 0 || amendmentDescription.trim().length === 0) {
      setMessage('Define un monto valido y escribe un concepto para proponer otro monto.');
      return;
    }

    setBusyKey(`${requestId}:amendment`);
    setMessage(null);

    try {
      await amendRequest.mutateAsync({
        requestId,
        amountMinor: amendmentAmountMinor,
        description: amendmentDescription.trim(),
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

  function showAutoCyclePrompt(proposalId: string | null, status: string | null) {
    if (status !== 'pending_approvals' && status !== 'approved') {
      return;
    }

    Alert.alert(
      status === 'approved' ? 'Cierre listo para ejecutar' : 'Cierre de circulo pendiente',
      status === 'approved'
        ? 'Todos ya aprobaron este cierre. Quieres abrirlo ahora para ejecutarlo?'
        : 'Se detecto otro cierre automatico en tu circulo. Quieres revisarlo ahora?',
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

  async function handlePendingItemAction(
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
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }

  function renderPendingItem(item: ActivityItemDto) {
    if (item.kind === 'financial_request') {
      const financialRequestContent = buildFinancialRequestPendingContent(item);
      return (
        <PendingFinancialRequestCard
          amendmentAmount={amendmentAmount}
          amendmentDescription={amendmentDescription}
          amountMinor={item.amountMinor ?? 0}
          amountTone={item.tone === 'positive' || item.tone === 'negative' ? item.tone : 'neutral'}
          busyAccept={busyKey === `${item.id}:accept`}
          busyAmendment={busyKey === `${item.id}:amendment`}
          busyReject={busyKey === `${item.id}:reject`}
          counterpartyName={person?.displayName ?? 'Persona'}
          createdAtLabel={financialRequestContent.createdAtLabel}
          createdByLabel={financialRequestContent.createdByLabel}
          description={financialRequestContent.detail}
          key={item.id}
          onAccept={busyKey ? undefined : () => void handlePendingItemAction(item.id, item.kind, item.status, 'accept')}
          onChangeAmendmentAmount={setAmendmentAmount}
          onChangeAmendmentDescription={setAmendmentDescription}
          onReject={busyKey ? undefined : () => void handlePendingItemAction(item.id, item.kind, item.status, 'reject')}
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
        amountLabel={typeof item.amountMinor === 'number' && item.amountMinor > 0 ? formatCop(item.amountMinor) : null}
        detail={splitSubtitleSegments(item.subtitle)[0] ?? item.subtitle}
        eyebrow={item.kind === 'settlement_proposal' ? 'Cierre de ciclo' : 'Pendiente'}
        key={item.id}
        meta={splitSubtitleSegments(item.subtitle).slice(1).join(' | ') || null}
        onPress={item.href ? () => router.push(item.href as Parameters<typeof router.push>[0]) : undefined}
        statusLabel={pendingStatusLabel(item.status)}
        statusTone={pendingSnippetTone(item)}
        tone={pendingSnippetTone(item)}
        title={item.title}
        variant="default"
      >
        {item.kind === 'settlement_proposal' && item.status === 'pending_approvals' ? (
          <View style={styles.pendingActionStack}>
            <View style={styles.pendingActionSlot}>
              <PrimaryAction
                compact
                label={busyKey === `${item.id}:approve` ? 'Aprobando...' : 'Aprobar cierre'}
                onPress={busyKey ? undefined : () => void handlePendingItemAction(item.id, item.kind, item.status, 'approve')}
              />
            </View>
            <Pressable
              onPress={busyKey ? undefined : () => void handlePendingItemAction(item.id, item.kind, item.status, 'reject')}
              style={({ pressed }) => [styles.inlineAction, pressed ? styles.inlineActionPressed : null]}
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
                label={busyKey === `${item.id}:execute` ? 'Ejecutando...' : 'Ejecutar cierre'}
                onPress={busyKey ? undefined : () => void handlePendingItemAction(item.id, item.kind, item.status, 'execute')}
              />
            </View>
          </View>
        ) : null}
      </PendingSnippetCard>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} subtitle="Cargando esta relacion." title="Persona">
        <Text style={styles.supportText}>Estamos leyendo el saldo y el historial real.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} subtitle="No pudimos cargar esta relacion." title="Persona">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  if (!person) {
    return (
      <ScreenShell headerVariant="plain" largeTitle={false} subtitle="No encontramos esta relacion." title="Persona">
        <EmptyState
          description="Prueba desde la lista principal de personas o confirma que la relacion exista en Supabase."
          title="Sin relacion activa"
        />
      </ScreenShell>
    );
  }

  const balanceTone =
    person.netAmountMinor === 0 ? 'neutral' : person.direction === 'owes_me' ? 'positive' : 'negative';
  const balanceSummary =
    person.netAmountMinor === 0
      ? 'Estan al dia'
      : person.direction === 'owes_me'
        ? `Te debe ${formatCop(person.netAmountMinor)}`
        : `Debes ${formatCop(person.netAmountMinor)}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.layout}>
        <View style={styles.fixedTop}>
          <View style={styles.heroBlock}>
            <AppAvatar imageUrl={person.avatarUrl ?? null} label={person.displayName} size={80} />
            <Text style={styles.contactFlatName}>{person.displayName}</Text>
            <Text
              style={[
                styles.balanceSummary,
                balanceTone === 'positive' ? styles.positive : null,
                balanceTone === 'negative' ? styles.negative : null,
              ]}
            >
              {balanceSummary}
            </Text>
            {person.pendingCount > 0 ? (
              <Text style={styles.heroMeta}>
                {person.pendingCount} pendiente{person.pendingCount > 1 ? 's' : ''}
              </Text>
            ) : person.supportText ? (
              <Text style={styles.heroMeta}>{person.supportText}</Text>
            ) : null}
          </View>

          <View style={styles.quickActionRowFlat}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/register',
                  params: {
                    personId: person.userId,
                  },
                })
              }
              style={({ pressed }) => [styles.quickActionPill, pressed ? styles.quickActionPillPressed : null]}
            >
              <Ionicons color={theme.colors.primary} name="add-circle-outline" size={18} />
              <Text style={styles.quickActionPillLabel}>Nuevo movimiento</Text>
            </Pressable>
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
              <Text style={[styles.tabLabel, panelSegment === 'pending' ? styles.tabLabelActive : null]}>
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
              <Text style={[styles.tabLabel, panelSegment === 'history' ? styles.tabLabelActive : null]}>
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
                pendingItems.length > 0 ? (
                  pendingItems.map((item) => renderPendingItem(item))
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
    gap: theme.spacing.md,
    maxWidth: 560,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    width: '100%',
  },
  fixedTop: {
    gap: theme.spacing.sm,
  },
  heroBlock: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
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
    textAlign: 'center',
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
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    maxWidth: 240,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  quickActionPillPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  quickActionPillLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
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
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: theme.colors.text,
  },
  sheetScrollWrap: {
    flex: 1,
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
  positive: {
    color: theme.colors.success,
  },
  negative: {
    color: theme.colors.warning,
  },
  neutral: {
    color: theme.colors.textMuted,
  },
  danger: {
    color: theme.colors.danger,
  },
});
