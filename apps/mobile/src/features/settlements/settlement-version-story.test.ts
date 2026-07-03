import { describe, expect, it } from 'vitest';

import { formatCop } from '@/lib/data';
import type { SettlementVersionTimelineItemDto } from '@/lib/live-data/settlement-version-types';

import { versionStorySteps } from './settlement-version-story';

const BASE_VERSION: SettlementVersionTimelineItemDto = {
  amountMinor: 3000,
  createdAt: '2026-05-05T12:00:00.000Z',
  detail: 'Faltan 2 aprobaciones.',
  displayVersionNumber: 2,
  isCurrent: true,
  proposalId: 'settlement-v2',
  replacedByProposalId: null,
  replacesProposalId: 'settlement-v1',
  staleReason: null,
  status: 'pending_approvals',
  title: 'Version 2',
  updatedAt: '2026-05-05T12:00:00.000Z',
  versionNumber: 2,
};

describe('versionStorySteps', () => {
  it('prioritizes morphed Circle amount, participant, and carried approval changes', () => {
    const [step] = versionStorySteps([
      {
        ...BASE_VERSION,
        addedParticipantCount: 2,
        amountChanged: true,
        carriedApprovalCount: 1,
        previousAmountMinor: 2500,
        removedParticipantCount: 1,
      },
    ]);

    expect(step?.detail).toBe(
      `El monto cambio de ${formatCop(2500)} a ${formatCop(3000)}. ` +
        'Se agregaron 2 personas. Se quito 1 persona. Se conservaron 1 aprobacion.',
    );
  });

  it('keeps the existing detail when there are no morphed Circle changes', () => {
    const [step] = versionStorySteps([BASE_VERSION]);

    expect(step?.detail).toBe('Faltan 2 aprobaciones.');
  });
});
