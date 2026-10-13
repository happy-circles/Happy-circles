import { describe, expect, it } from 'vitest';
import {
  activityRowKey,
  inviteActivityRowKey,
  nonEmptyActivitySections,
} from './activity-list-sections';
import { focusedListIndex } from '@/components/history-virtualized-list-policy';

describe('virtualized activity data integrity', () => {
  it('keeps all 10,000 rows in order, across new/reviewed sections and a refresh', () => {
    const rows = Array.from({ length: 10_000 }, (_, index) => ({
      id: `event-${index}`,
      kind: 'financial_request',
    }));
    const inputs = [
      { key: 'new', title: 'Nuevas', data: rows.slice(0, 50) },
      { key: 'empty', title: 'Vacía', data: [] },
      { key: 'reviewed', title: 'Revisadas', data: rows.slice(50) },
    ];
    const sections = nonEmptyActivitySections(inputs);
    expect(sections.map((section) => section.key)).toEqual(['new', 'reviewed']);
    const displayed = sections.flatMap((section) => section.data);
    expect(displayed).toEqual(rows);
    expect(new Set(displayed.map(activityRowKey)).size).toBe(10_000);
    expect(sections[0].data).toBe(inputs[0].data);
    expect(inputs[1].data).toEqual([]);

    const refreshed = nonEmptyActivitySections([
      { key: 'new', title: 'Nuevas', data: rows.slice(0, 49) },
      { key: 'reviewed', title: 'Revisadas', data: rows.slice(49) },
    ]).flatMap((section) => section.data);
    expect(refreshed).toEqual(rows);
    expect(new Set(refreshed.map(activityRowKey)).size).toBe(rows.length);
  });

  it('separates different kinds sharing an ID, including account and friendship invites', () => {
    expect(activityRowKey({ id: 'same-id', kind: 'ledger_entry' })).not.toBe(
      activityRowKey({ id: 'same-id', kind: 'financial_request' }),
    );
    expect(inviteActivityRowKey({ inviteId: 'same-id', kind: 'account_invite' })).not.toBe(
      inviteActivityRowKey({ inviteId: 'same-id', kind: 'friendship_invite' }),
    );
  });

  it('keeps previous section boundary keys when refresh changes a header into a row', () => {
    const previousSection = { key: 'new', title: 'Nuevas', data: [] };
    expect(activityRowKey(previousSection)).toBe('new');
    const previousInviteSection = { key: 'received', title: 'Recibidas', data: [] };
    expect(inviteActivityRowKey(previousInviteSection)).toBe('received');
    expect(activityRowKey({ id: 'now-a-row', kind: 'financial_request' })).toBe(
      'financial_request:now-a-row',
    );
  });

  it('locates a distant focused row without moving, dropping or duplicating the history', () => {
    const history = Array.from({ length: 10_000 }, (_, index) => ({ id: `case-${index}` }));
    expect(focusedListIndex(history, 'case-9_999')).toBe(-1);
    expect(focusedListIndex(history, 'case-9999')).toBe(9999);
    expect(focusedListIndex(history, null)).toBe(-1);
    const refreshed = [{ id: 'new-case' }, ...history];
    expect(focusedListIndex(refreshed, 'case-9999')).toBe(10_000);
    expect(history[9999].id).toBe('case-9999');
    expect(new Set(refreshed.map((row) => row.id)).size).toBe(10_001);
  });
});
