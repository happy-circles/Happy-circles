import type { SettlementDetailDecision, SettlementParticipantDecisionSource } from '../types';

export function normalizeSettlementDetailDecision(
  decision: string | null,
): SettlementDetailDecision {
  if (decision === 'approved') {
    return 'approved';
  }

  if (decision === 'rejected') {
    return 'rejected';
  }

  return 'pending';
}

export function normalizeSettlementDecisionSource(
  decisionSource: string | null | undefined,
): SettlementParticipantDecisionSource {
  return decisionSource === 'carried' ? 'carried' : 'manual';
}

export function settlementParticipantLabel(input: {
  readonly participantUserId: string;
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): string | null {
  if (input.participantUserId === input.currentUserId) {
    return 'Tú';
  }

  if (input.visibleCounterpartyUserIds.has(input.participantUserId)) {
    return input.names.get(input.participantUserId) ?? 'Persona';
  }

  return null;
}

export function buildSettlementParticipantLabels(input: {
  readonly participantUserIds: readonly string[];
  readonly currentUserId: string;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
}): readonly string[] {
  const labels: string[] = [];
  let hiddenCount = 0;

  for (const participantUserId of input.participantUserIds) {
    const label = settlementParticipantLabel({
      participantUserId,
      currentUserId: input.currentUserId,
      visibleCounterpartyUserIds: input.visibleCounterpartyUserIds,
      names: input.names,
    });

    if (label) {
      if (!labels.includes(label)) {
        labels.push(label);
      }
      continue;
    }

    hiddenCount += 1;
  }

  if (hiddenCount === 1) {
    labels.push('Otra persona');
  } else if (hiddenCount > 1) {
    labels.push(`${hiddenCount} personas más`);
  }

  return labels;
}

export function summarizeSettlementParticipants(labels: readonly string[]): string {
  const others = labels.filter((label) => label !== 'Tú' && label !== 'Tu');

  if (others.length === 0) {
    return 'tu círculo';
  }

  if (others.length === 1) {
    return others[0] ?? 'tu círculo';
  }

  if (others.length === 2) {
    return `${others[0]} y ${others[1]}`;
  }

  return `${others[0]} y ${others.length - 1} más`;
}
