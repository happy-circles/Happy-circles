import { describe, expect, it } from 'vitest';

import type { RelationshipHistoryRow } from '../types';
import {
  buildCycleSettlementImpactLabel,
  buildHistorySubtitle,
  buildTimelineStepTitle,
  historyToneForRow,
} from './relationship-history';

const CURRENT_USER_ID = 'user-current';
const SOFIA_ID = 'user-sofia';
const NOW_MS = Date.parse('2026-05-11T12:00:00.000Z');

function row(value: Partial<RelationshipHistoryRow>): RelationshipHistoryRow {
  return {
    amount_minor: 50_000,
    category: 'cycle',
    creditor_user_id: SOFIA_ID,
    debtor_user_id: CURRENT_USER_ID,
    description: null,
    happened_at: '2026-05-11T11:00:00.000Z',
    item_id: 'ledger-1',
    item_kind: 'ledger_transaction',
    relationship_id: 'rel-1',
    source_type: 'system',
    status: 'posted',
    subtype: 'cycle_settlement',
    ...value,
  } as RelationshipHistoryRow;
}

const names = new Map([
  [CURRENT_USER_ID, 'Tu'],
  [SOFIA_ID, 'Sofia'],
]);

describe('relationship history cycle settlement copy', () => {
  it('renders personal ledger rows as directional movements', () => {
    expect(buildTimelineStepTitle(row({}), CURRENT_USER_ID, 'Sofia', names)).toBe(
      'Pagaste a Sofia',
    );
    expect(historyToneForRow(row({}), CURRENT_USER_ID)).toBe('negative');

    const incomingRow = row({
      creditor_user_id: CURRENT_USER_ID,
      debtor_user_id: SOFIA_ID,
    });

    expect(buildTimelineStepTitle(incomingRow, CURRENT_USER_ID, 'Sofia', names)).toBe(
      'Sofia te pag\u00f3',
    );
    expect(historyToneForRow(incomingRow, CURRENT_USER_ID)).toBe('positive');
  });

  it('does not append generic completion copy to cycle settlement subtitles', () => {
    const subtitle = buildHistorySubtitle(row({}), CURRENT_USER_ID, 'Sofia', names, NOW_MS);

    expect(buildCycleSettlementImpactLabel(row({}))).toBeNull();
    expect(subtitle).not.toContain('Completaste un Circle');
    expect(subtitle).toContain('Happy Circle');
    expect(subtitle).toContain('Tu -> Sofia');
  });
});
