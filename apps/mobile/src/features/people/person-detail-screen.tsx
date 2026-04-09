import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PersonTimelineItemDto } from '@happy-circles/application';

import { EmptyState } from '@/components/empty-state';
import { FieldBlock } from '@/components/field-block';
import { MessageBanner } from '@/components/message-banner';
import { MoneyHero } from '@/components/money-hero';
import { PrimaryAction } from '@/components/primary-action';
import { ScreenShell } from '@/components/screen-shell';
import { SectionBlock } from '@/components/section-block';
import { StatusChip } from '@/components/status-chip';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import {
  useAcceptFinancialRequestMutation,
  useAmendFinancialRequestMutation,
  useAppSnapshot,
  useRejectFinancialRequestMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';

function compactHistoryLabel(step: PersonTimelineItemDto): string {
  if (step.kind === 'settlement') {
    return 'Cierre de ciclo';
  }

  if (step.kind === 'payment') {
    return 'Movimiento registrado';
  }

  if (step.status === 'posted') {
    return 'Registrado';
  }

  if (step.status === 'amended') {
    return 'Monto actualizado';
  }

  if (step.status === 'accepted') {
    return 'Aceptada';
  }

  if (step.status === 'amended') {
    return 'Monto actualizado';
  }

  if (step.status === 'rejected') {
    return 'Rechazada';
  }

  return 'Solicitud';
}

function friendlyHistoryStepLabel(step: PersonTimelineItemDto): string {
  if (step.kind === 'settlement') {
    return 'Se registro';
  }

  if (step.kind === 'payment') {
    return 'Se registro el movimiento';
  }

  if (step.status === 'posted') {
    return 'Se registro';
  }

  if (step.title.endsWith(' propuso un nuevo monto')) {
    const actor = step.title.replace(' propuso un nuevo monto', '');
    return actor === 'Tu' ? 'Tu propusiste un nuevo monto' : `${actor} propuso un nuevo monto`;
  }

  if (step.title.startsWith('Tu creo ')) {
    return step.title.replace('Tu creo ', 'Tu creaste ');
  }

  if (step.title.startsWith('Tu acepto ')) {
    return step.title.replace('Tu acepto ', 'Tu aceptaste ');
  }

  if (step.title.startsWith('Tu rechazo ')) {
    return step.title.replace('Tu rechazo ', 'Tu rechazaste ');
  }

  if (step.title.startsWith('Tu registro ')) {
    return step.title.replace('Tu registro ', 'Tu registraste ');
  }

  if (step.title.startsWith('Tu confirmo ')) {
    return step.title.replace('Tu confirmo ', 'Tu confirmaste ');
  }

  if (step.title.startsWith('Tu aplico ')) {
    return step.title.replace('Tu aplico ', 'Tu aplicaste ');
  }

  return step.title;
}

function extractHistoryConcept(detail?: string | null): string | null {
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

function historyCaseTitle(itemCase: HistoryCase): string {
  for (const step of itemCase.steps) {
    const concept = extractHistoryConcept(step.detail);
    if (concept) {
      return concept;
    }
  }

  return compactHistoryLabel(itemCase.latest);
}

function historyStatusLabel(status: string): string {
  if (status === 'pending') {
    return 'Pendiente';
  }

  if (status === 'amended') {
    return 'Nuevo monto';
  }

  if (status === 'accepted') {
    return 'Aceptada';
  }

  if (status === 'rejected') {
    return 'Rechazada';
  }

  if (status === 'posted') {
    return 'Registrado';
  }

  return status;
}

function historyStatusTone(status: string): 'primary' | 'success' | 'warning' | 'neutral' {
  if (status === 'pending' || status === 'amended') {
    return 'warning';
  }

  if (status === 'accepted' || status === 'posted') {
    return 'success';
  }

  if (status === 'rejected') {
    return 'neutral';
  }

  return 'primary';
}

export interface PersonDetailScreenProps {
  readonly userId: string;
}

interface HistoryCase {
  readonly id: string;
  readonly latest: PersonTimelineItemDto;
  readonly earliest: PersonTimelineItemDto;
  readonly steps: readonly PersonTimelineItemDto[];
}

type HistoryDirection = 'i_owe' | 'owes_me' | 'neutral';

function historyDirectionFromStep(
  step: PersonTimelineItemDto,
  counterpartyName: string,
): HistoryDirection {
  if (step.status === 'rejected') {
    return 'neutral';
  }

  if (step.kind === 'settlement') {
    return 'neutral';
  }

  if (step.kind === 'payment') {
    const [from, to] = (step.flowLabel ?? '').split('->').map((part) => part.trim());

    if (from === counterpartyName) {
      return 'owes_me';
    }

    if (to === counterpartyName) {
      return 'i_owe';
    }
  }

  if (step.tone === 'positive') {
    return 'owes_me';
  }

  if (step.tone === 'negative') {
    return 'i_owe';
  }

  return 'neutral';
}

function historyImpactTone(
  step: PersonTimelineItemDto,
  counterpartyName: string,
): 'positive' | 'negative' | 'neutral' {
  if (step.kind === 'settlement') {
    return 'neutral';
  }

  const direction = historyDirectionFromStep(step, counterpartyName);

  if (direction === 'owes_me') {
    return 'positive';
  }

  if (direction === 'i_owe') {
    return 'negative';
  }

  return 'neutral';
}

function historyImpactLabel(
  step: PersonTimelineItemDto,
  counterpartyName: string,
): string | null {
  if (step.status === 'rejected') {
    return 'No cambio el saldo';
  }

  if (step.amountMinor <= 0) {
    return null;
  }

  if (step.kind === 'settlement') {
    return `Cierre de ciclo por ${formatCop(step.amountMinor)}`;
  }

  const direction = historyDirectionFromStep(step, counterpartyName);
  if (direction === 'neutral') {
    return null;
  }

  const amountLabel = formatCop(step.amountMinor);
  const isProposal = step.kind === 'request' && (step.status === 'pending' || step.status === 'amended');
  const flowLabel = direction === 'owes_me' ? 'Entrada' : 'Salida';

  return isProposal ? `${flowLabel} propuesta de ${amountLabel}` : `${flowLabel} de ${amountLabel}`;
}

function historyCaseKey(item: Pick<PersonTimelineItemDto, 'id' | 'originRequestId' | 'originSettlementProposalId'>): string {
  if (item.originSettlementProposalId) {
    return `settlement:${item.originSettlementProposalId}`;
  }

  if (item.originRequestId) {
    return `request:${item.originRequestId}`;
  }

  return `event:${item.id}`;
}

export function PersonDetailScreen({ userId }: PersonDetailScreenProps) {
  const router = useRouter();
  const snapshotQuery = useAppSnapshot();
  const acceptRequest = useAcceptFinancialRequestMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const amendRequest = useAmendFinancialRequestMutation();
  const person = snapshotQuery.data?.peopleById[userId] ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showAmendment, setShowAmendment] = useState(false);
  const [amendmentAmount, setAmendmentAmount] = useState('');
  const [amendmentDescription, setAmendmentDescription] = useState('');
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);

  useEffect(() => {
    if (!person?.pendingRequest) {
      setShowAmendment(false);
      setAmendmentAmount('');
      setAmendmentDescription('');
      return;
    }

    setShowAmendment(false);
    setAmendmentAmount(String(Math.max(1, Math.round(person.pendingRequest.amountMinor / 100))));
    setAmendmentDescription(person.pendingRequest.description);
  }, [person?.pendingRequest?.id]);

  const amendmentAmountMinor = Math.max(Number.parseInt(amendmentAmount || '0', 10) * 100, 0);
  const historyCases = useMemo<HistoryCase[]>(() => {
    if (!person) {
      return [];
    }

    const groups = new Map<string, PersonTimelineItemDto[]>();
    for (const item of person.timeline) {
      const key = historyCaseKey(item);
      const existing = groups.get(key);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    return Array.from(groups.entries()).map(([id, items]) => {
      const steps = [...items].reverse();
      return {
        id,
        latest: items[0],
        earliest: steps[0],
        steps,
      };
    });
  }, [person]);

  async function handlePendingAction(action: 'accept' | 'reject') {
    if (!person?.pendingRequest) {
      return;
    }

    setBusyKey(action);
    setMessage(null);

    try {
      if (action === 'accept') {
        await acceptRequest.mutateAsync(person.pendingRequest.id);
        setMessage('Propuesta aceptada.');
      } else {
        await rejectRequest.mutateAsync(person.pendingRequest.id);
        setMessage('Propuesta no aceptada.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAmendment() {
    if (!person?.pendingRequest) {
      return;
    }

    if (amendmentAmountMinor <= 0 || amendmentDescription.trim().length === 0) {
      setMessage('Define un monto valido y escribe un concepto para proponer otro monto.');
      return;
    }

    setBusyKey('amendment');
    setMessage(null);

    try {
      await amendRequest.mutateAsync({
        requestId: person.pendingRequest.id,
        amountMinor: amendmentAmountMinor,
        description: amendmentDescription.trim(),
      });
      setShowAmendment(false);
      setMessage('Nuevo monto enviado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar el nuevo monto.');
    } finally {
      setBusyKey(null);
    }
  }

  function toggleHistoryCase(caseId: string) {
    setExpandedCaseIds((current) =>
      current.includes(caseId) ? current.filter((item) => item !== caseId) : [...current, caseId],
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

  return (
    <ScreenShell
      footer={
        person.netAmountMinor === 0 ? undefined : (
          <View style={styles.footerActions}>
            <PrimaryAction
              label={person.direction === 'owes_me' ? 'Registrar entrada' : 'Registrar salida'}
              onPress={() =>
                router.push({
                  pathname: '/register',
                  params: {
                    personId: person.userId,
                    requestKind: 'balance_decrease',
                    direction: person.direction,
                  },
                })
              }
              subtitle="Reducir este saldo"
            />
          </View>
        )
      }
      headerVariant="plain"
      largeTitle={false}
      title={person.displayName}
    >
      <MoneyHero
        amountMinor={person.netAmountMinor}
        badgeLabel={person.netAmountMinor === 0 ? 'Al dia' : person.direction === 'owes_me' ? 'Te debe' : 'Debes'}
        caption="Este saldo ya resume el efecto neto entre ustedes."
        label="Saldo entre ustedes"
        tone={
          person.netAmountMinor === 0
            ? 'neutral'
            : person.direction === 'owes_me'
              ? 'positive'
              : 'negative'
        }
      />

      {message ? <MessageBanner message={message} /> : null}

      {person.pendingRequest ? (
        <SurfaceCard padding="lg" variant="accent">
          <View style={styles.pendingHeader}>
            <View style={styles.pendingText}>
              <Text style={styles.pendingEyebrow}>Pendiente con {person.displayName}</Text>
              <Text style={styles.pendingTitle}>{person.pendingRequest.title}</Text>
            </View>
            <StatusChip
              label={person.pendingRequest.responseState === 'requires_you' ? 'Requiere tu respuesta' : 'Esperando respuesta'}
              tone={person.pendingRequest.responseState === 'requires_you' ? 'warning' : 'neutral'}
            />
          </View>

          <Text style={styles.pendingAmount}>{formatCop(person.pendingRequest.amountMinor)}</Text>
          <Text style={styles.pendingDetail}>{person.pendingRequest.description}</Text>
          <Text style={styles.pendingMeta}>
            Creado por {person.pendingRequest.createdByLabel} | {person.pendingRequest.createdAtLabel}
          </Text>

          {person.pendingRequest.responseState === 'requires_you' ? (
            <>
              <View style={styles.actionRow}>
                <View style={styles.actionSlot}>
                  <PrimaryAction
                    label={busyKey === 'accept' ? 'Aceptando...' : 'Aceptar'}
                    onPress={busyKey ? undefined : () => void handlePendingAction('accept')}
                  />
                </View>
                <View style={styles.actionSlot}>
                  <PrimaryAction
                    label={busyKey === 'reject' ? 'Enviando...' : 'No aceptar'}
                    onPress={busyKey ? undefined : () => void handlePendingAction('reject')}
                    variant="ghost"
                  />
                </View>
                <View style={styles.actionSlot}>
                  <PrimaryAction
                    label={showAmendment ? 'Ocultar cambio' : 'Cambiar monto'}
                    onPress={busyKey ? undefined : () => setShowAmendment((current) => !current)}
                    variant="secondary"
                  />
                </View>
              </View>

              {showAmendment ? (
                <SurfaceCard padding="md" style={styles.amendmentCard} variant="default">
                  <FieldBlock hint="Escribe el valor en pesos." label="Monto">
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={setAmendmentAmount}
                      placeholder="45000"
                      placeholderTextColor={theme.colors.muted}
                      style={styles.input}
                      value={amendmentAmount}
                    />
                    {amendmentAmountMinor > 0 ? (
                      <Text style={styles.amountPreview}>{formatCop(amendmentAmountMinor)}</Text>
                    ) : null}
                  </FieldBlock>

                  <FieldBlock hint="Ajusta el concepto antes de enviarlo." label="Concepto">
                    <TextInput
                      multiline
                      onChangeText={setAmendmentDescription}
                      placeholder="Explica el nuevo monto"
                      placeholderTextColor={theme.colors.muted}
                      style={[styles.input, styles.textarea]}
                      value={amendmentDescription}
                    />
                  </FieldBlock>

                  <View style={styles.actionRow}>
                    <View style={styles.actionSlot}>
                      <PrimaryAction
                        label={busyKey === 'amendment' ? 'Enviando...' : 'Enviar nuevo monto'}
                        onPress={busyKey ? undefined : () => void handleAmendment()}
                      />
                    </View>
                  </View>
                </SurfaceCard>
              ) : null}
            </>
          ) : (
            <Text style={styles.pendingHelper}>
              Ya enviaste esta propuesta. Cuando {person.displayName} responda, veras el resultado aqui.
            </Text>
          )}
        </SurfaceCard>
      ) : null}

      <SectionBlock title="Historial">
        {historyCases.length === 0 ? (
          <EmptyState
            description="Cuando haya propuestas o movimientos confirmados con esta persona, apareceran aqui."
            title="Sin movimientos todavia"
          />
        ) : (
          historyCases.map((itemCase) => {
            const isExpanded = expandedCaseIds.includes(itemCase.id);
            const latest = itemCase.latest;
            const caseMeta = latest.happenedAtLabel ?? null;
            const caseImpact = historyImpactLabel(latest, person.displayName);
            const caseTone = historyImpactTone(latest, person.displayName);

            return (
              <SurfaceCard
                key={itemCase.id}
                padding="lg"
                style={[
                  styles.caseCard,
                  caseTone === 'positive' ? styles.caseCardPositive : null,
                  caseTone === 'negative' ? styles.caseCardNegative : null,
                ]}
              >
                <View style={styles.caseHeader}>
                  <View style={styles.caseText}>
                    <Text style={styles.caseTitle}>{historyCaseTitle(itemCase)}</Text>
                    {caseImpact ? (
                      <Text
                        style={[
                          styles.caseImpact,
                          caseTone === 'positive' ? styles.positive : null,
                          caseTone === 'negative' ? styles.negative : null,
                        ]}
                      >
                        {caseImpact}
                      </Text>
                    ) : null}
                    {caseMeta ? <Text style={styles.caseSummary}>{caseMeta}</Text> : null}
                  </View>
                  <View style={styles.caseMeta}>
                    <StatusChip label={historyStatusLabel(latest.status)} tone={historyStatusTone(latest.status)} />
                  </View>
                </View>

                <View style={styles.caseFooter}>
                  <View />
                  <Pressable
                    onPress={() => toggleHistoryCase(itemCase.id)}
                    style={({ pressed }) => [styles.caseToggle, pressed ? styles.caseTogglePressed : null]}
                  >
                    <Text style={styles.caseToggleText}>{isExpanded ? 'Ocultar' : 'Ver detalle'}</Text>
                  </Pressable>
                </View>

                {isExpanded ? (
                  <View style={styles.caseSteps}>
                    {itemCase.steps.map((step, index) => {
                      const stepImpact = historyImpactLabel(step, person.displayName);
                      const stepTone = historyImpactTone(step, person.displayName);

                      return (
                        <View key={step.id} style={styles.stepRow}>
                          <View style={styles.stepRail}>
                            <View
                              style={[
                                styles.stepMarker,
                                stepTone === 'positive' ? styles.stepMarkerPositive : null,
                                stepTone === 'negative' ? styles.stepMarkerNegative : null,
                              ]}
                            />
                            {index < itemCase.steps.length - 1 ? <View style={styles.stepLine} /> : null}
                          </View>
                          <View style={styles.stepBody}>
                            <View style={styles.stepTop}>
                              <Text style={styles.stepTitle}>{friendlyHistoryStepLabel(step)}</Text>
                              {step.amountMinor > 0 ? (
                                <Text
                                  style={[
                                    styles.stepAmount,
                                    stepTone === 'positive' ? styles.positive : null,
                                    stepTone === 'negative' ? styles.negative : null,
                                  ]}
                                >
                                  {formatCop(step.amountMinor)}
                                </Text>
                              ) : null}
                            </View>
                            {stepImpact ? (
                              <Text
                                style={[
                                  styles.stepImpact,
                                  stepTone === 'positive' ? styles.positive : null,
                                  stepTone === 'negative' ? styles.negative : null,
                                ]}
                              >
                                {stepImpact}
                              </Text>
                            ) : null}
                            {step.happenedAtLabel ? <Text style={styles.stepMeta}>{step.happenedAtLabel}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </SurfaceCard>
            );
          })
        )}
      </SectionBlock>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  supportText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  pendingHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  pendingText: {
    flex: 1,
    gap: 4,
  },
  pendingEyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pendingTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title3,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  pendingAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.title2,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pendingDetail: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    lineHeight: 22,
  },
  pendingMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  pendingHelper: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  actionSlot: {
    flexGrow: 1,
    minWidth: 140,
  },
  amendmentCard: {
    gap: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.medium,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    minHeight: 52,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  textarea: {
    minHeight: 96,
    paddingTop: theme.spacing.sm,
    textAlignVertical: 'top',
  },
  amountPreview: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  caseCard: {
    gap: theme.spacing.md,
  },
  caseCardPositive: {
    borderLeftColor: theme.colors.success,
    borderLeftWidth: 3,
  },
  caseCardNegative: {
    borderLeftColor: theme.colors.warning,
    borderLeftWidth: 3,
  },
  caseHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  caseText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  caseMeta: {
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  caseTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
    lineHeight: 24,
  },
  caseImpact: {
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 20,
  },
  caseSummary: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  caseFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  caseToggle: {
    borderRadius: theme.radius.medium,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  caseTogglePressed: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  caseToggleText: {
    color: theme.colors.primary,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
  },
  caseSteps: {
    borderTopColor: theme.colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  stepRail: {
    alignItems: 'center',
    width: 14,
  },
  stepMarker: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    height: 10,
    marginTop: 4,
    width: 10,
  },
  stepMarkerPositive: {
    backgroundColor: theme.colors.success,
  },
  stepMarkerNegative: {
    backgroundColor: theme.colors.warning,
  },
  stepLine: {
    backgroundColor: theme.colors.hairline,
    flex: 1,
    marginTop: 4,
    width: 1,
  },
  stepBody: {
    flex: 1,
    gap: 4,
  },
  stepTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '700',
    lineHeight: 18,
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  stepImpact: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
    lineHeight: 18,
  },
  stepMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    lineHeight: 16,
  },
  stepAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.footnote,
    fontWeight: '800',
  },
  positive: {
    color: theme.colors.success,
  },
  negative: {
    color: theme.colors.warning,
  },
  footerActions: {
    flexDirection: 'row',
  },
});
