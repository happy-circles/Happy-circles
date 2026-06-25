import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import {
  friendlyHistoryStepLabel,
  historyAmountIsVoided,
  historyCaseImpactLabel,
  historyCaseAmountLabel,
  historyCaseEyebrow,
  historyCaseStatusTone,
  historyCaseStatusLabel,
  historyImpactLabel,
  historyImpactTone,
  historyStepAmountLabel,
  historyTimelineStepActionLabel,
  historyTimelineStepActorLabel,
  historyTimelineStepAmountLabel,
  historyTimelineStepConversationSide,
  historyTimelineStepDetailLabel,
  historyTimelineStepMetaLabel,
  type HistoryCaseItem,
} from './history-cases';
import { formatCop } from './data';

function item(value: Partial<HistoryCaseItem>): HistoryCaseItem {
  return {
    amountMinor: 10_000,
    category: 'other',
    id: 'item-1',
    kind: 'request',
    status: 'accepted',
    subtitle: 'Ana | hoy',
    title: 'Movimiento',
    ...value,
  };
}

describe('history case presentation', () => {
  it('keeps rejected amounts visible on case headers without treating them as balance changes', () => {
    const rejected = item({ status: 'rejected' });

    expect(historyAmountIsVoided(rejected)).toBe(true);
    expect(historyCaseAmountLabel(rejected)).toBe(formatCop(10_000));
    expect(historyStepAmountLabel(rejected)).toBeNull();
  });

  it('keeps replaced Circle amounts visible but voided', () => {
    const replacedCircle = item({
      category: 'cycle',
      kind: 'settlement',
      status: 'stale',
    });

    expect(historyAmountIsVoided(replacedCircle)).toBe(true);
    expect(historyCaseAmountLabel(replacedCircle)).toBe(formatCop(10_000));
    expect(historyStepAmountLabel(replacedCircle)).toBeNull();
  });

  it('still hides inactive settlement proposal amounts until they are closed', () => {
    const pendingCircle = item({
      kind: 'settlement',
      status: 'pending_approvals',
    });

    expect(historyCaseAmountLabel(pendingCircle)).toBeNull();
  });

  it('treats executed Circle proposal metadata as the only completed Circle marker', () => {
    const executedProposal = item({
      amountMinor: 50_000,
      category: 'cycle',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'executed',
    });

    expect(historyAmountIsVoided(executedProposal)).toBe(false);
    expect(historyCaseAmountLabel(executedProposal)).toBe(formatCop(50_000));
    expect(historyStepAmountLabel(executedProposal)).toBeNull();
  });

  it('uses the personal Circle direction for closed Circle amount tone', () => {
    const outgoingCircle = item({
      amountMinor: 50_000,
      category: 'cycle',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'executed',
      tone: 'negative',
    });

    expect(historyImpactTone(outgoingCircle)).toBe('negative');
  });

  it('uses signed Circle amounts in the expanded history story', () => {
    const executedProposal = item({
      amountMinor: 50_000,
      category: 'cycle',
      id: 'settlement-1:executed',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'executed',
      tone: 'negative',
    });
    const postedMovement = item({
      amountMinor: 50_000,
      category: 'cycle',
      id: 'ledger-1',
      kind: 'settlement',
      originSettlementProposalId: 'settlement-1',
      status: 'posted',
      tone: 'negative',
    });

    expect(
      historyTimelineStepAmountLabel(
        {
          latest: executedProposal,
          steps: [executedProposal, postedMovement],
        },
        postedMovement,
        1,
      ),
    ).toBe(`- ${formatCop(50_000)}`);
  });

  it('does not render Circle copy as a right-side timeline amount', () => {
    const ledgerStep = item({
      category: 'cycle',
      flowLabel: 'Tú -> Sofia',
      kind: 'settlement',
      status: 'posted',
      title: 'Happy Circle completado: Tú -> Sofia',
    });

    expect(friendlyHistoryStepLabel(ledgerStep)).toBe('Pagaste a Sofia');
    expect(historyImpactLabel(ledgerStep)).toBeNull();
  });

  it('keeps request descriptions and identifies each side of the conversation', () => {
    const ownProposal = item({
      detail: 'Hamburguesas del domingo',
      sourceType: 'user',
      status: 'pending',
      subtitle: 'Usuario | Hamburguesas del domingo | hoy',
      title: 'Tú propuso una salida',
    });
    const counterProposal = item({
      detail: 'Hamburguesas y bebidas',
      sourceType: 'user',
      status: 'amended',
      title: 'Pablo Lemus propuso un nuevo monto',
    });

    const ownActor = historyTimelineStepActorLabel(ownProposal, 'Pablo Lemus');
    const otherActor = historyTimelineStepActorLabel(counterProposal, 'Pablo Lemus');

    expect(historyTimelineStepDetailLabel(ownProposal)).toBe('Hamburguesas del domingo');
    expect(historyTimelineStepDetailLabel(counterProposal)).toBe('Hamburguesas y bebidas');
    expect(historyTimelineStepActionLabel(ownProposal, ownActor)).toBe('Propusiste una salida');
    expect(historyTimelineStepActionLabel(counterProposal, otherActor)).toBe(
      'Propuso un nuevo monto',
    );
    expect(historyTimelineStepConversationSide(ownProposal, ownActor)).toBe('self');
    expect(historyTimelineStepConversationSide(counterProposal, otherActor)).toBe('other');
  });

  it('centers system events in the conversation', () => {
    const systemStep = item({
      sourceType: 'system',
      title: 'Sistema registró la salida',
    });
    const actor = historyTimelineStepActorLabel(systemStep, 'Pablo');

    expect(actor).toBe('Sistema');
    expect(historyTimelineStepConversationSide(systemStep, actor)).toBe('system');
  });

  it('recognizes actors before accented action verbs', () => {
    const accepted = item({
      subtitle: 'Pablo Lemus -> Tú | hoy',
      title: 'Tú aceptó el nuevo monto',
    });
    const registered = item({
      subtitle: 'Usuario | hoy',
      title: 'Pablo Lemus registró la salida',
    });

    expect(historyTimelineStepActorLabel(accepted, 'Pablo Lemus')).toBe('Tú');
    expect(historyTimelineStepActorLabel(registered, 'Pablo Lemus')).toBe('Pablo Lemus');
  });

  it('does not use completion copy as the Circle case impact label', () => {
    const ledgerStep = item({
      category: 'cycle',
      flowLabel: 'Tú -> Sofia',
      kind: 'settlement',
      status: 'posted',
      title: 'Happy Circle completado: Tú -> Sofia',
    });

    expect(
      historyCaseImpactLabel({
        earliest: ledgerStep,
        id: 'circle-case',
        isCycleSnippet: true,
        latest: ledgerStep,
        steps: [ledgerStep],
      }),
    ).toBe('Movimiento aplicado');
  });

  it('labels standalone Circle ledger cases with the direct relationship movement', () => {
    const ledgerStep = item({
      category: 'cycle',
      flowLabel: 'Tu -> Sofia',
      kind: 'settlement',
      status: 'posted',
      title: 'Happy Circle completado: Tu -> Sofia',
    });

    expect(
      historyCaseEyebrow({
        earliest: ledgerStep,
        id: 'cycle_movement:ledger-1',
        isCycleSnippet: true,
        latest: ledgerStep,
        steps: [ledgerStep],
      }),
    ).toBe('Pagaste a Sofia');
  });

  it('does not title a ledger-only Circle row as completed', () => {
    const ledgerStep = item({
      category: 'cycle',
      flowLabel: 'Tú -> Sofia',
      kind: 'settlement',
      status: 'posted',
      title: 'Pagaste a Sofia',
    });

    expect(
      historyCaseImpactLabel({
        earliest: ledgerStep,
        id: 'circle-case',
        isCycleSnippet: true,
        latest: ledgerStep,
        steps: [ledgerStep],
      }),
    ).toBe('Movimiento aplicado');
  });

  it('uses unified status labels for Circle cases', () => {
    const pendingCircle = item({
      category: 'cycle',
      kind: 'settlement',
      status: 'pending_approvals',
    });

    expect(
      historyCaseStatusLabel({
        earliest: pendingCircle,
        id: 'circle-case',
        isCycleSnippet: true,
        latest: pendingCircle,
        steps: [pendingCircle],
      }),
    ).toBe('Por aprobar');
  });

  it('keeps Circle history tones coordinated with final state', () => {
    const rejectedCircle = item({
      category: 'cycle',
      kind: 'settlement',
      status: 'rejected',
    });
    const replacedCircle = item({
      category: 'cycle',
      kind: 'settlement',
      status: 'stale',
    });
    const executedCircle = item({
      category: 'cycle',
      kind: 'settlement',
      status: 'executed',
    });

    expect(historyImpactTone(rejectedCircle)).toBe('danger');
    expect(historyImpactTone(replacedCircle)).toBe('cycle');
    expect(historyImpactTone(executedCircle)).toBe('positive');
    expect(
      historyCaseStatusTone({
        earliest: replacedCircle,
        id: 'circle-case',
        isCycleSnippet: true,
        latest: replacedCircle,
        steps: [replacedCircle],
      }),
    ).toBe('cycle');
  });

  it('does not show stale update time as a later event inside completed Circle history', () => {
    const replacedVersion = item({
      category: 'cycle',
      happenedAtLabel: 'hace 2 d',
      kind: 'settlement',
      status: 'stale',
    });
    const executedVersion = item({
      category: 'cycle',
      happenedAtLabel: 'hace 3 d',
      id: 'settlement-v2:executed',
      kind: 'settlement',
      status: 'executed',
    });

    expect(
      historyTimelineStepMetaLabel(
        {
          isCycleSnippet: true,
          latest: executedVersion,
        },
        replacedVersion,
      ),
    ).toBe('Antes del cierre');
  });
});
