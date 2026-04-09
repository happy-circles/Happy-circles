import { useEffect, useMemo, useState } from 'react';
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
  useAppSnapshot,
  useCounterofferFinancialRequestMutation,
  useRejectFinancialRequestMutation,
} from '@/lib/live-data';
import { theme } from '@/lib/theme';

function compactHistoryLabel(step: PersonTimelineItemDto): string {
  if (step.kind === 'settlement') {
    return 'Cierre de ciclo';
  }

  if (step.kind === 'payment') {
    return 'Pago registrado';
  }

  if (step.status === 'posted') {
    return 'Registrado';
  }

  if (step.title.toLocaleLowerCase('es-CO').includes('contraoferta')) {
    return step.status === 'accepted' ? 'Contraoferta aceptada' : 'Contraoferta';
  }

  if (step.status === 'accepted') {
    return 'Aceptada';
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
    return 'Se registro el pago';
  }

  if (step.status === 'posted') {
    return 'Se registro';
  }

  if (step.title.endsWith(' envio una contraoferta')) {
    const actor = step.title.replace(' envio una contraoferta', '');
    return actor === 'Tu' ? 'Tu hiciste una contraoferta' : `${actor} hizo una contraoferta`;
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

  if (status === 'countered') {
    return 'Contraoferta';
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
  if (status === 'pending' || status === 'countered') {
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
  const snapshotQuery = useAppSnapshot();
  const acceptRequest = useAcceptFinancialRequestMutation();
  const rejectRequest = useRejectFinancialRequestMutation();
  const counterofferRequest = useCounterofferFinancialRequestMutation();
  const person = snapshotQuery.data?.peopleById[userId] ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showCounteroffer, setShowCounteroffer] = useState(false);
  const [counterofferAmount, setCounterofferAmount] = useState('');
  const [counterofferDescription, setCounterofferDescription] = useState('');
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>([]);

  useEffect(() => {
    if (!person?.pendingRequest) {
      setShowCounteroffer(false);
      setCounterofferAmount('');
      setCounterofferDescription('');
      return;
    }

    setShowCounteroffer(false);
    setCounterofferAmount(String(Math.max(1, Math.round(person.pendingRequest.amountMinor / 100))));
    setCounterofferDescription(person.pendingRequest.description);
  }, [person?.pendingRequest?.id]);

  const counterofferAmountMinor = Math.max(Number.parseInt(counterofferAmount || '0', 10) * 100, 0);
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
        setMessage('Request aceptado.');
      } else {
        await rejectRequest.mutateAsync(person.pendingRequest.id);
        setMessage('Request rechazado.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la accion.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCounteroffer() {
    if (!person?.pendingRequest) {
      return;
    }

    if (counterofferAmountMinor <= 0 || counterofferDescription.trim().length === 0) {
      setMessage('Define un monto valido y escribe un concepto para la contraoferta.');
      return;
    }

    setBusyKey('counteroffer');
    setMessage(null);

    try {
      await counterofferRequest.mutateAsync({
        requestId: person.pendingRequest.id,
        amountMinor: counterofferAmountMinor,
        description: counterofferDescription.trim(),
      });
      setShowCounteroffer(false);
      setMessage('Contraoferta enviada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar la contraoferta.');
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
        <View style={styles.footerActions}>
          <PrimaryAction href="/register" label="Registrar movimiento" subtitle="Actualizar este saldo" />
        </View>
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
                    label={busyKey === 'reject' ? 'Rechazando...' : 'Rechazar'}
                    onPress={busyKey ? undefined : () => void handlePendingAction('reject')}
                    variant="ghost"
                  />
                </View>
                <View style={styles.actionSlot}>
                  <PrimaryAction
                    label={showCounteroffer ? 'Ocultar contraoferta' : 'Contraofertar'}
                    onPress={busyKey ? undefined : () => setShowCounteroffer((current) => !current)}
                    variant="secondary"
                  />
                </View>
              </View>

              {showCounteroffer ? (
                <SurfaceCard padding="md" style={styles.counterofferCard} variant="default">
                  <FieldBlock hint="Escribe el valor en pesos." label="Monto">
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={setCounterofferAmount}
                      placeholder="45000"
                      placeholderTextColor={theme.colors.muted}
                      style={styles.input}
                      value={counterofferAmount}
                    />
                    {counterofferAmountMinor > 0 ? (
                      <Text style={styles.amountPreview}>{formatCop(counterofferAmountMinor)}</Text>
                    ) : null}
                  </FieldBlock>

                  <FieldBlock hint="Ajusta el concepto antes de enviarlo." label="Concepto">
                    <TextInput
                      multiline
                      onChangeText={setCounterofferDescription}
                      placeholder="Explica la contraoferta"
                      placeholderTextColor={theme.colors.muted}
                      style={[styles.input, styles.textarea]}
                      value={counterofferDescription}
                    />
                  </FieldBlock>

                  <View style={styles.actionRow}>
                    <View style={styles.actionSlot}>
                      <PrimaryAction
                        label={busyKey === 'counteroffer' ? 'Enviando...' : 'Enviar contraoferta'}
                        onPress={busyKey ? undefined : () => void handleCounteroffer()}
                      />
                    </View>
                  </View>
                </SurfaceCard>
              ) : null}
            </>
          ) : (
            <Text style={styles.pendingHelper}>
              Ya enviaste este request. Cuando {person.displayName} responda, veras el resultado aqui.
            </Text>
          )}
        </SurfaceCard>
      ) : null}

      <SectionBlock title="Historial">
        {historyCases.length === 0 ? (
          <EmptyState
            description="Cuando haya requests o movimientos confirmados con esta persona, apareceran aqui."
            title="Sin movimientos todavia"
          />
        ) : (
          historyCases.map((itemCase) => {
            const isExpanded = expandedCaseIds.includes(itemCase.id);
            const latest = itemCase.latest;
            const earliest = itemCase.earliest;
            const caseMeta = [compactHistoryLabel(latest), latest.happenedAtLabel]
              .filter(Boolean)
              .join(' | ');

            return (
              <SurfaceCard
                key={itemCase.id}
                padding="lg"
                style={[
                  styles.caseCard,
                  latest.tone === 'positive' ? styles.caseCardPositive : null,
                  latest.tone === 'negative' ? styles.caseCardNegative : null,
                ]}
              >
                <View style={styles.caseHeader}>
                  <View style={styles.caseText}>
                    <Text style={styles.caseTitle}>{historyCaseTitle(itemCase)}</Text>
                    {caseMeta ? <Text style={styles.caseSummary}>{caseMeta}</Text> : null}
                  </View>
                  <View style={styles.caseMeta}>
                    <StatusChip label={historyStatusLabel(latest.status)} tone={historyStatusTone(latest.status)} />
                    {latest.amountMinor > 0 ? (
                      <Text
                        style={[
                          styles.caseAmount,
                          latest.tone === 'positive' ? styles.positive : null,
                          latest.tone === 'negative' ? styles.negative : null,
                        ]}
                      >
                        {formatCop(latest.amountMinor)}
                      </Text>
                    ) : null}
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
                    {itemCase.steps.map((step, index) => (
                      <View key={step.id} style={styles.stepRow}>
                        <View style={styles.stepRail}>
                          <View
                            style={[
                              styles.stepMarker,
                              step.tone === 'positive' ? styles.stepMarkerPositive : null,
                              step.tone === 'negative' ? styles.stepMarkerNegative : null,
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
                                  step.tone === 'positive' ? styles.positive : null,
                                  step.tone === 'negative' ? styles.negative : null,
                                ]}
                              >
                                {formatCop(step.amountMinor)}
                              </Text>
                            ) : null}
                          </View>
                          {step.happenedAtLabel ? <Text style={styles.stepMeta}>{step.happenedAtLabel}</Text> : null}
                        </View>
                      </View>
                    ))}
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
  counterofferCard: {
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
  caseSummary: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.footnote,
    lineHeight: 18,
  },
  caseAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.callout,
    fontWeight: '800',
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
    paddingRight: theme.spacing.sm,
    flex: 1,
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
