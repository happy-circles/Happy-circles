import { describe, expect, it } from 'vitest';

import type { ActivityItemDto } from '@happy-circles/application';

import { filterActivityItemsByPeriod } from './category-period';

function item(id: string, happenedAt?: string): ActivityItemDto {
  return {
    id,
    title: id,
    subtitle: '',
    status: 'posted',
    kind: 'payment',
    happenedAt,
  };
}

describe('category period helpers', () => {
  it('keeps all activity when the selected period is all', () => {
    const items = [item('old', '2025-01-01T12:00:00.000Z'), item('current')];

    expect(filterActivityItemsByPeriod(items, 'all', new Date('2026-06-17T12:00:00.000Z'))).toBe(
      items,
    );
  });

  it('filters dated activity to the selected period and preserves undated items', () => {
    const items = [
      item('previous-month', '2026-05-30T12:00:00.000Z'),
      item('current-month', '2026-06-02T12:00:00.000Z'),
      item('undated'),
    ];

    expect(
      filterActivityItemsByPeriod(items, 'month', new Date('2026-06-17T12:00:00.000Z')).map(
        (entry) => entry.id,
      ),
    ).toEqual(['current-month', 'undated']);
  });
});
