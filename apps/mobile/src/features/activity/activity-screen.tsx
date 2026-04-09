import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ActivityItemDto, ActivitySectionDto } from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { MessageBanner } from '@/components/message-banner';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { SegmentedControl } from '@/components/segmented-control';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import {
  useAcceptFinancialRequestMutation,
  useAcceptRelationshipInviteMutation,
  useAppSnapshot,
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectFinancialRequestMutation,
  useRejectRelationshipInviteMutation,
  useRejectSettlementMutation,
} from '@/lib/live-data';
import {
  getNotificationSupport,
  requestLocalNotificationPermission,
  scheduleDeferredReminder,
} from '@/lib/notifications';
import { theme } from '@/lib/theme';

const SEGMENTS = [
  { label: 'Por resolver', value: 'pending' },
  { label: 'Historial', value: 'history' },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]['value'];
type PendingActionKey = 'accept' | 'reject' | 'approve' | 'execute' | 'send';

interface ActivityHistoryCase {
  readonly id: string;
  readonly latest: ActivityItemDto;
  readonly earliest: ActivityItemDto;
  readonly steps: readonly ActivityItemDto[];
  readonly isSettlementCycle: boolean;
  readonly counterparties: readonly {
    readonly label: string;
    readonly amountMinor: number;
  }[];
}

type ActivityDirection = 'i_owe' | 'owes_me' | 'neutral';

function historyDirectionFromItem(item: ActivityItemDto): ActivityDirection {
  if (item.status === 'rejected') {
    return 'neutral';
  }

  if (item.kind === 'system_note') {
    return 'neutral';
  }

  if (item.kind === 'manual_payment') {
    const [from, to] = (item.flowLabel ?? '').split('->').map((part) => part.trim());
    const counterpartyName = item.counterpartyLabel?.trim();

    if (counterpartyName && from === counterpartyName) {
      return 'owes_me';
    }

    if (counterpartyName && to === counterpartyName) {
      return 'i_owe';
    }
  }

  if (item.tone === 'positive') {
    return 'owes_me';
  }

  if (item.tone === 'negative') {
    return 'i_owe';
  }

  return 'neutral';
}

function historyImpactTone(item: ActivityItemDto): 'positive' | 'negative' | 'neutral' {
  if (item.kind === 'system_note') {
    return 'neutral';
  }

  const direction = historyDirectionFromItem(item);

  if (direction === 'owes_me') {
    return 'positive';
  }

  if (direction === 'i_owe') {
    return 'negative';
  }

  return 'neutral';
}

function historyImpactLabel(item: ActivityItemDto): string | null {
  if (item.status === 'rejected') {
    return 'No cambio el saldo';
  }

  if (!item.counterpartyLabel || typeof item.amountMinor !== 'number' || item.amountMinor <= 0) {
    return null;
  }

  if (item.kind === 'system_note') {
    return `Cierre de ciclo por ${formatCop(item.amountMinor)}`;
  }

  const direction = historyDirectionFromItem(item);
  if (direction === 'neutral') {
    return null;
  }

  const amountLabel = formatCop(item.amountMinor);
  const isProposal = item.status === 'pending' || item.status === 'amended';
  const flowLabel = direction === 'owes_me' ? 'Entrada' : 'Salida';

  return isProposal ? `${flowLabel} propuesta de ${amountLabel}` : `${flowLabel} de ${amountLabel}`;
}

function activityHistoryCaseKey(
  item: Pick<ActivityItemDto, 'id' | 'originRequestId' | 'originSettlementProposalId'>,
): string {
  if (item.originSettlementProposalId) {
    return `settlement:${item.originSettlementProposalId}`;
  }

  if (item.originRequestId) {
    return `request:${item.originRequestId}`;
  }

  return `event:${item.id}`;
}

function humanStatusLabel(status: string): string {
  if (status === 'requires_you') {
    return 'Por responder';
  }

  if (status === 'waiting_other_side') {
    return 'En espera';
  }

  if (status === 'pending_approvals') {
    return 'Pendiente';
  }

  if (status === 'approved') {
    return 'Aprobado';
  }

  if (status === 'accepted') {
    return 'Aceptada';
  }

  if (status === 'amended') {
    return 'Nuevo monto';
  }

  if (status === 'rejected') {
    return 'Rechazada';
  }

  if (status === 'posted') {
    return 'Registrado';
  }

  return status;
}

function compactHistoryLabel(item: ActivityItemDto): string {
  if (item.kind === 'manual_payment') {
    return 'Movimiento registrado';
  }

  if (item.kind === 'system_note') {
    return 'Cierre de ciclo';
  }

  if (item.status === 'posted') {
    return 'Registrado';
  }

  if (item.status === 'amended') {
    return 'Monto actualizado';
  }

  if (item.status === 'accepted') {
    return 'Aceptada';
  }

  if (item.status === 'rejected') {
    return 'Rechazada';
  }

  return 'Solicitud';
}

function extractActivityConcept(detail?: string | null): string | null {
  if (!detail) {
    return null;
  }

  let concept = detail.trim();
  if (concept.length === 0) {
    return null;
  }

  if (concept.toLocaleLowerCase('es-CO') === 'cycle settlement system movement') {
    return null;
  }

  concept = concept.replace(/^reset\s+/i, '');
  concept = concept.replace(/^reversal of\s+/i, '');
  concept = concept.replace(/\s+\S+\s*->\s*\S+\s*$/i, '');
  concept = concept.trim();

  return concept.length > 0 ? concept : null;
}

function formatNaturalList(values: readonly string[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0]!;
  }

  if (values.length === 2) {
    return `${values[0]} y ${values[1]}`;
  }

  return `${values[0]}, ${values[1]} y ${values.length - 2} mas`;
}

function historyCardTitle(itemCase: ActivityHistoryCase): string {
  if (itemCase.isSettlementCycle) {
    const participantNames = itemCase.counterparties.map((item) => item.label);
    return participantNames.length > 0
      ? `Cierre de ciclo con ${formatNaturalList(participantNames)}`
      : 'Cierre de ciclo';
  }

  for (const step of itemCase.steps) {
    const concept = extractActivityConcept(step.detail);
    if (concept) {
      return concept;
    }
  }

  return compactHistoryLabel(itemCase.latest);
}

function historyCardImpactLine(itemCase: ActivityHistoryCase): string | null {
  if (itemCase.isSettlementCycle) {
    return 'Cierre de ciclo aplicado';
  }

  return historyImpactLabel(itemCase.latest);
}

function historyCaseMeta(itemCase: ActivityHistoryCase): string {
  return itemCase.latest.happenedAtLabel ?? '';
}

function friendlyHistoryLine(item: ActivityItemDto): string {
  if (item.kind === 'system_note') {
    return item.counterpartyLabel ? `Se registro con ${item.counterpartyLabel}` : 'Se registro';
  }

  if (item.kind === 'manual_payment') {
    return 'Se registro el movimiento';
  }

  if (item.title.endsWith(' propuso un nuevo monto')) {
    const actor = item.title.replace(' propuso un nuevo monto', '');
    return actor === 'Tu' ? 'Tu propusiste un nuevo monto' : `${actor} propuso un nuevo monto`;
  }

  if (item.title.startsWith('Tu creo ')) {
    return item.title.replace('Tu creo ', 'Tu creaste ');
  }

  if (item.title.startsWith('Tu acepto ')) {
    return item.title.replace('Tu acepto ', 'Tu aceptaste ');
  }

  if (item.title.startsWith('Tu rechazo ')) {
    return item.title.replace('Tu rechazo ', 'Tu rechazaste ');
  }

  if (item.title.startsWith('Tu registro ')) {
    return item.title.replace('Tu registro ', 'Tu registraste ');
  }

  if (item.title.startsWith('Tu confirmo ')) {
    return item.title.replace('Tu confirmo ', 'Tu confirmaste ');
  }

  if (item.title.startsWith('Tu aplico ')) {
    return item.title.replace('Tu aplico ', 'Tu aplicaste ');
  }

  return item.title;
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

function toneForStatus(status: string): 'primary' | 'success' | 'warning' | 'neutral' {
  if (status === 'requires_you' || status === 'pending' || status === 'amended') {
    return 'warning';
  }

  if (status === 'accepted' || status === 'posted') {
    return 'success';
  }

  if (status === 'pending_approvals' || status === 'approved') {
    return 'primary';
  }

  return 'neutral';
}

export function ActivityScreen() {
  const router = useRouter();
  const snapshotQuery = useAppSnapshot();
  const acceptRequest = useAcceptFinancialRequestMutation();
  const acceptInvite = useAcceptRelationshipInviteMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const rejectInvite = useRejectRelationshipInviteMutation();
  const approveSettlement = useApproveSettlementMutation();
  const rejectSettlement = useRejectSettlementMutation();
  const executeSettlement = useExecuteSettlementMutation();

  const [segment, setSegment] = useState<SegmentKey>('pending');
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedHistoryCaseIds, setExpandedHistoryCaseIds] = useState<string[]>([]);

  const sections = snapshotQuery.data?.activitySections ?? [];
  const section = useMemo<ActivitySectionDto | undefined>(
    () => sections.find((item) => item.key === segment),
    [sections, segment],
  );
  const historyCases = useMemo<ActivityHistoryCase[]>(() => {
    const peopleById = snapshotQuery.data?.peopleById;
    if (!peopleById) {
      return [];
    }

    const allHistoryItems = Object.values(peopleById)
      .flatMap((person) =>
        person.timeline.map(
          (step): ActivityItemDto => ({
            id: step.id,
            kind:
              step.kind === 'payment'
                ? 'manual_payment'
                : step.kind === 'settlement'
                  ? 'system_note'
                  : 'financial_request',
            title: step.title,
            subtitle: step.subtitle,
            status: step.status,
            href: `/person/${person.userId}`,
            amountMinor: step.amountMinor,
            sourceType: step.sourceType,
            detail: step.detail,
            happenedAt: step.happenedAt,
            happenedAtLabel: step.happenedAtLabel,
            tone: step.tone,
            originRequestId: step.originRequestId,
            originSettlementProposalId: step.originSettlementProposalId,
            flowLabel: step.flowLabel,
            counterpartyLabel: person.displayName,
          }),
        ),
      )
      .sort((left, right) => {
        const leftTime = left.happenedAt ? Date.parse(left.happenedAt) : 0;
        const rightTime = right.happenedAt ? Date.parse(right.happenedAt) : 0;
        return rightTime - leftTime;
      });

    const groups = new Map<string, ActivityItemDto[]>();
    for (const item of allHistoryItems) {
      const key = activityHistoryCaseKey(item);
      const existing = groups.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    return Array.from(groups.entries())
      .map(([id, items]) => {
        const steps = [...items].reverse();
        const counterpartyAmounts = new Map<string, number>();
        for (const item of items) {
          if (!item.counterpartyLabel) {
            continue;
          }

          const currentAmount = counterpartyAmounts.get(item.counterpartyLabel) ?? 0;
          const nextAmount =
            typeof item.amountMinor === 'number' && item.amountMinor > currentAmount ? item.amountMinor : currentAmount;
          counterpartyAmounts.set(item.counterpartyLabel, nextAmount);
        }

        return {
          id,
          latest: items[0],
          earliest: steps[0],
          steps,
          isSettlementCycle: id.startsWith('settlement:'),
          counterparties: Array.from(counterpartyAmounts.entries()).map(([label, amountMinor]) => ({
            label,
            amountMinor,
          })),
        };
      })
      .sort((left, right) => {
        const leftTime = left.latest.happenedAt ? Date.parse(left.latest.happenedAt) : 0;
        const rightTime = right.latest.happenedAt ? Date.parse(right.latest.happenedAt) : 0;
        return rightTime - leftTime;
      })
      .filter((itemCase) => itemCase.latest.status !== 'pending');
  }, [snapshotQuery.data?.peopleById]);
  const headerSlot = (
    <View style={styles.bellButton}>
      <Ionicons color={theme.colors.text} name="notifications" size={20} />
    </View>
  );

  async function handleRemindLater(title: string, subtitle: string, href?: string) {
    const support = getNotificationSupport();
    if (!support.supported) {
      setMessage(support.reason ?? 'Notificaciones no disponibles en este entorno.');
      return;
    }

    const granted = await requestLocalNotificationPermission();
    if (!granted) {
      setMessage('No se pudieron activar notificaciones en este dispositivo.');
      return;
    }

    await scheduleDeferredReminder(title, subtitle, href ?? '/activity');
    setMessage('Recordatorio programado para mas tarde.');
  }

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

  async function handlePendingAction(itemId: string, kind: string, status: string, action: PendingActionKey) {
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

      if (kind === 'relationship_invite') {
        if (status === 'requires_you') {
          if (action === 'accept') {
            await acceptInvite.mutateAsync(itemId);
            setMessage('Invitacion aceptada.');
          } else {
            await rejectInvite.mutateAsync(itemId);
            setMessage('Invitacion rechazada.');
          }
          return;
        }

        if (status === 'waiting_other_side' && action === 'send') {
          setMessage('Esta invitacion sigue esperando respuesta de la otra persona.');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }

  function toggleHistoryCase(caseId: string) {
    setExpandedHistoryCaseIds((current) =>
      current.includes(caseId) ? current.filter((item) => item !== caseId) : [...current, caseId],
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <ScreenShell eyebrow="Centro de respuestas" headerSlot={headerSlot} subtitle="Cargando alertas e historial." title="Alertas">
        <Text style={styles.supportText}>Estamos leyendo las acciones reales desde Supabase.</Text>
      </ScreenShell>
    );
  }

  if (snapshotQuery.error) {
    return (
      <ScreenShell eyebrow="Centro de respuestas" headerSlot={headerSlot} subtitle="No pudimos cargar la actividad." title="Alertas">
        <Text style={styles.supportText}>{snapshotQuery.error.message}</Text>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      eyebrow="Centro de respuestas"
      headerSlot={headerSlot}
      subtitle="Responde, aprueba o ejecuta sin perder contexto."
      title="Alertas"
    >
      <SurfaceCard padding="lg" variant="accent">
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>
            {segment === 'pending' ? 'Todo lo que exige una decision tuya.' : 'Trazabilidad reciente de tu circulo.'}
          </Text>
          <StatusChip
            label={
              segment === 'pending'
                ? `${section?.items.length ?? 0} activos`
                : `${historyCases.length} ciclos`
            }
            tone={segment === 'pending' ? 'warning' : 'primary'}
          />
        </View>
        <Text style={styles.summaryBody}>
          {section?.description ?? 'Aqui veras las respuestas y el historial de forma simple.'}
        </Text>
      </SurfaceCard>

      <SegmentedControl options={SEGMENTS} onChange={setSegment} value={segment} />

      {message ? <MessageBanner message={message} /> : null}

      <SectionBlock subtitle={section?.description} title={section?.title ?? 'Actividad'}>
        {!section || (segment === 'history' ? historyCases.length === 0 : section.items.length === 0) ? (
          <EmptyState
            actionHref="/register"
            actionLabel="Registrar movimiento"
            description={section?.emptyMessage ?? 'No hay movimientos para mostrar.'}
            title="Todo al dia"
          />
        ) : segment === 'history' ? (
          historyCases.map((itemCase) => {
            const isExpanded = expandedHistoryCaseIds.includes(itemCase.id);
            const latest = itemCase.latest;
            const caseMeta = historyCaseMeta(itemCase);
            const caseImpact = historyCardImpactLine(itemCase);
            const caseTone = itemCase.isSettlementCycle ? 'neutral' : historyImpactTone(latest);

            return (
              <SurfaceCard
                key={itemCase.id}
                padding="lg"
                style={[
                  styles.historyCard,
                  caseTone === 'positive' ? styles.historyCardPositive : null,
                  caseTone === 'negative' ? styles.historyCardNegative : null,
                ]}
              >
                <View style={styles.historyHeader}>
                  <View style={styles.historyTextWrap}>
                    <Text style={styles.historyTitle}>{historyCardTitle(itemCase)}</Text>
                    {caseImpact ? (
                      <Text
                        style={[
                          itemCase.isSettlementCycle ? styles.historyBreakdown : styles.historyImpact,
                          caseTone === 'positive' ? styles.amountPositive : null,
                          caseTone === 'negative' ? styles.amountNegative : null,
                        ]}
                      >
                        {caseImpact}
                      </Text>
                    ) : null}
                    {caseMeta ? <Text style={styles.historyMeta}>{caseMeta}</Text> : null}
                  </View>
                  <View style={styles.historyTrailing}>
                    <StatusChip label={humanStatusLabel(latest.status)} tone={toneForStatus(latest.status)} />
                  </View>
                </View>

                <View style={styles.historyFooter}>
                  <View />
                  <Pressable
                    onPress={() => toggleHistoryCase(itemCase.id)}
                    style={({ pressed }) => [styles.historyLink, pressed ? styles.historyLinkPressed : null]}
                  >
                    <Text style={styles.historyLinkText}>{isExpanded ? 'Ocultar' : 'Ver detalle'}</Text>
                  </Pressable>
                </View>

                {isExpanded ? (
                  <View style={styles.historySteps}>
                    {itemCase.steps.map((step, index) => {
                      const stepTone = historyImpactTone(step);
                      const stepImpact = historyImpactLabel(step);

                      return (
                        <View key={step.id} style={styles.historyStepRow}>
                          <View style={styles.historyStepRail}>
                            <View
                              style={[
                                styles.historyStepMarker,
                                stepTone === 'positive' ? styles.historyStepMarkerPositive : null,
                                stepTone === 'negative' ? styles.historyStepMarkerNegative : null,
                              ]}
                            />
                            {index < itemCase.steps.length - 1 ? <View style={styles.historyStepLine} /> : null}
                          </View>
                          <View style={styles.historyStepBody}>
                            <View style={styles.historyStepTop}>
                              <Text style={styles.historyStepTitle}>{friendlyHistoryLine(step)}</Text>
                              {typeof step.amountMinor === 'number' && step.amountMinor > 0 ? (
                                <Text
                                  style={[
                                    styles.historyStepAmount,
                                    stepTone === 'positive' ? styles.amountPositive : null,
                                    stepTone === 'negative' ? styles.amountNegative : null,
                                  ]}
                                >
                                  {formatCop(step.amountMinor)}
                                </Text>
                              ) : null}
                            </View>
                            {stepImpact ? (
                              <Text
                                style={[
                                  styles.historyStepImpact,
                                  stepTone === 'positive' ? styles.amountPositive : null,
                                  stepTone === 'negative' ? styles.amountNegative : null,
                                ]}
                              >
                                {stepImpact}
                              </Text>
                            ) : null}
                            {step.happenedAtLabel ? (
                              <Text style={styles.historyStepMeta}>{step.happenedAtLabel}</Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })
        ) : (
          section.items.map((item) => {
            const canAcceptOrReject = segment === 'pending' && item.kind === 'financial_request';
            const canApproveOrReject =
              segment === 'pending' &&
              item.kind === 'settlement_proposal' &&
              item.status === 'pending_approvals';
            const canRespondInvite =
              segment === 'pending' &&
              item.kind === 'relationship_invite' &&
              item.status === 'requires_you';
            const canExecute =
              segment === 'pending' &&
              item.kind === 'settlement_proposal' &&
              item.status === 'approved';
            const canOnlyTrackInvite =
              segment === 'pending' && item.kind === 'relationship_invite' && item.status === 'waiting_other_side';

            return (
              <SurfaceCard key={item.id} padding="lg">
                <View style={styles.header}>
                  <View style={styles.textWrap}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.subtitle}>{item.subtitle}</Text>
                  </View>
                  <View style={styles.chips}>
                    {item.sourceType ? (
                      <StatusChip
                        label={item.sourceType === 'system' ? 'Sistema' : 'Usuario'}
                        tone={item.sourceType === 'system' ? 'primary' : 'neutral'}
                      />
                    ) : null}
                    <StatusChip label={humanStatusLabel(item.status)} tone={toneForStatus(item.status)} />
                  </View>
                </View>

                {typeof item.amountMinor === 'number' && item.amountMinor > 0 ? (
                  <Text style={styles.amount}>{formatCop(item.amountMinor)}</Text>
                ) : null}

                <View style={styles.actionRow}>
                  {item.href ? (
                    <View style={styles.actionSlot}>
                      <PrimaryAction href={item.href} label="Abrir" variant="secondary" />
                    </View>
                  ) : null}

                  {canAcceptOrReject ? (
                    <>
                      <View style={styles.actionSlot}>
                        <PrimaryAction
                          label={busyKey === `${item.id}:accept` ? 'Aceptando...' : 'Aceptar'}
                          onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'accept')}
                        />
                      </View>
                      <View style={styles.actionSlot}>
                        <PrimaryAction
                          label={busyKey === `${item.id}:reject` ? 'Enviando...' : 'No aceptar'}
                          onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'reject')}
                          variant="ghost"
                        />
                      </View>
                    </>
                  ) : null}

                  {canApproveOrReject ? (
                    <>
                      <View style={styles.actionSlot}>
                        <PrimaryAction
                          label={busyKey === `${item.id}:approve` ? 'Aprobando...' : 'Aprobar'}
                          onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'approve')}
                        />
                      </View>
                      <View style={styles.actionSlot}>
                        <PrimaryAction
                          label={busyKey === `${item.id}:reject` ? 'Enviando...' : 'No aprobar'}
                          onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'reject')}
                          variant="ghost"
                        />
                      </View>
                    </>
                  ) : null}

                  {canExecute ? (
                    <View style={styles.actionSlot}>
                      <PrimaryAction
                        label={busyKey === `${item.id}:execute` ? 'Ejecutando...' : 'Ejecutar'}
                        onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'execute')}
                      />
                    </View>
                  ) : null}

                  {canRespondInvite ? (
                    <>
                      <View style={styles.actionSlot}>
                        <PrimaryAction
                          label={busyKey === `${item.id}:accept` ? 'Aceptando...' : 'Aceptar'}
                          onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'accept')}
                        />
                      </View>
                      <View style={styles.actionSlot}>
                        <PrimaryAction
                          label={busyKey === `${item.id}:reject` ? 'Rechazando...' : 'Rechazar'}
                          onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'reject')}
                          variant="ghost"
                        />
                      </View>
                    </>
                  ) : null}

                  {canOnlyTrackInvite ? (
                    <View style={styles.actionSlot}>
                      <PrimaryAction
                        label={busyKey === `${item.id}:send` ? 'Actualizando...' : 'Esperando respuesta'}
                        onPress={busyKey ? undefined : () => void handlePendingAction(item.id, item.kind, item.status, 'send')}
                        variant="ghost"
                      />
                    </View>
                  ) : null}
                  {segment === 'pending' ? (
                    <View style={styles.actionSlot}>
                      <PrimaryAction
                        label="Recordarme"
                        onPress={() => void handleRemindLater(item.title, item.subtitle, item.href)}
                        variant="ghost"
                      />
                    </View>
                  ) : null}
                </View>
              </SurfaceCard>
            );
          })
        )}
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.small,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  summaryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  summaryTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  summaryBody: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  historyCard: {
    gap: theme.spacing.md,
  },
  historyCardPositive: {
    borderLeftColor: theme.colors.success,
    borderLeftWidth: 3,
  },
  historyCardNegative: {
    borderLeftColor: theme.colors.warning,
    borderLeftWidth: 3,
  },
  historyHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  historyTextWrap: {
    flex: 1,
    gap: 4,
  },
  historyTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 22,
  },
  historyMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  historyImpact: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 20,
  },
  historyBreakdown: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  historyTrailing: {
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  amountPositive: {
    color: theme.colors.success,
  },
  amountNegative: {
    color: theme.colors.warning,
  },
  historyFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyLink: {
    borderRadius: theme.radius.medium,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  historyLinkPressed: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  historyLinkText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  historySteps: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  historyStepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  historyStepRail: {
    alignItems: 'center',
    width: 14,
  },
  historyStepMarker: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    height: 10,
    marginTop: 4,
    width: 10,
  },
  historyStepMarkerPositive: {
    backgroundColor: theme.colors.success,
  },
  historyStepMarkerNegative: {
    backgroundColor: theme.colors.warning,
  },
  historyStepLine: {
    backgroundColor: theme.colors.hairline,
    flex: 1,
    marginTop: 4,
    width: 1,
  },
  historyStepBody: {
    flex: 1,
    gap: 4,
  },
  historyStepTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  historyStepTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    paddingRight: theme.spacing.sm,
  },
  historyStepImpact: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  historyStepMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  historyStepAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  chips: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  amount: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  actionSlot: {
    flexGrow: 1,
    minWidth: 130,
  },
});
