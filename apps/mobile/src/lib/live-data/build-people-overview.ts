import type { PersonCardDto } from '@happy-circles/application';

import { resolveAvatarUrl } from '../avatar-url';
import type { AppSnapshot, PeopleOverview, PeopleOverviewRow, PeopleOverviewRows } from './types';
import { formatRelativeLabel } from './utils/dates';

function normalizeAmountMinor(value: number | string): number {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

function normalizePendingCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function comparePeople(left: PersonCardDto, right: PersonCardDto): number {
  if (left.pendingCount !== right.pendingCount) {
    return right.pendingCount - left.pendingCount;
  }

  const amountDifference = Math.abs(right.netAmountMinor) - Math.abs(left.netAmountMinor);
  return amountDifference || left.displayName.localeCompare(right.displayName, 'es-CO');
}

function buildPerson(row: PeopleOverviewRow, nowMs: number): PersonCardDto {
  return {
    avatarUrl: resolveAvatarUrl(row.avatar_path, row.avatar_updated_at),
    direction: row.direction,
    displayName: row.display_name.trim() || 'Persona',
    lastActivityLabel: row.last_activity_at
      ? `Último movimiento ${formatRelativeLabel(row.last_activity_at, nowMs)}`
      : 'Sin movimientos todavía',
    netAmountMinor: normalizeAmountMinor(row.net_amount_minor),
    pendingCount: normalizePendingCount(row.pending_count),
    userId: row.user_id,
  };
}

export function buildPeopleOverview(rows: PeopleOverviewRows): PeopleOverview {
  const fetchedAtMs = Date.parse(rows.fetchedAt);
  const nowMs = Number.isFinite(fetchedAtMs) ? fetchedAtMs : Date.now();

  return {
    fetchedAt: rows.fetchedAt,
    people: rows.people.map((row) => buildPerson(row, nowMs)).sort(comparePeople),
  };
}

export function buildPeopleOverviewFromAppSnapshot(
  snapshot: AppSnapshot,
  fetchedAt: string,
): PeopleOverview {
  return {
    fetchedAt,
    people: snapshot.people,
  };
}
