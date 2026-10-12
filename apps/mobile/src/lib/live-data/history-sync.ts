import type { LiveSnapshotRows } from './types';

export const HISTORY_COLLECTIONS = [
  'financialRequests',
  'history',
  'friendshipInvites',
  'friendshipInviteDeliveries',
  'accountInvites',
  'accountInviteDeliveries',
  'settlementProposals',
  'settlementParticipants',
  'happyCircleScoreEvents',
  'auditEvents',
  'profiles',
] as const;

export type HistoryCollection = (typeof HISTORY_COLLECTIONS)[number];
export type HistoryRow = Readonly<Record<string, unknown>>;
export type HistorySyncCollections = Record<HistoryCollection, Record<string, HistoryRow>>;

export interface HistorySyncState {
  readonly protocol: 1;
  readonly cursor: string | null;
  readonly collections: HistorySyncCollections;
  /** Last dynamic context, committed with the same cursor for offline rebuilding. */
  readonly liveRows?: LiveSnapshotRows;
  readonly bootstrapComplete?: boolean;
}

export interface HistorySyncChange {
  readonly collection: HistoryCollection;
  readonly key: string;
  readonly row: HistoryRow | null;
}

export interface HistorySyncPage {
  readonly protocol: 1;
  readonly cursor: string;
  readonly hasMore: boolean;
  readonly reset: boolean;
  readonly changes: readonly HistorySyncChange[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
  );
}

function isHistoryRow(collection: HistoryCollection, row: unknown): row is HistoryRow {
  if (!isRecord(row)) return false;
  if (collection === 'history') {
    return isSafeKey(row.relationship_id) && isSafeKey(row.item_id) && isSafeKey(row.item_kind);
  }
  return isSafeKey(row.id);
}

function compareRevisions(left: string, right: string): number {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

function parseCursor(value: unknown): { epoch: string; revision: string } | null {
  if (typeof value !== 'string') return null;
  const match =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(0|[1-9][0-9]{0,18})$/i.exec(
      value,
    );
  if (!match?.[1] || !match[2]) return null;
  const revision = match[2];
  if (compareRevisions(revision, '9223372036854775807') > 0) return null;
  return { epoch: match[1].toLowerCase(), revision };
}

export function emptyHistorySyncState(): HistorySyncState {
  return {
    protocol: 1,
    cursor: null,
    collections: Object.fromEntries(
      HISTORY_COLLECTIONS.map((key) => [key, {}]),
    ) as HistorySyncCollections,
  };
}

// The cursor and every collection must survive together. An incomplete or old
// payload starts a complete bootstrap rather than acknowledging missing rows.
export function parseHistorySyncState(value: unknown): HistorySyncState | null {
  if (!isRecord(value) || value.protocol !== 1 || !isRecord(value.collections)) return null;
  if (value.cursor !== null && !parseCursor(value.cursor)) return null;
  const collections = emptyHistorySyncState().collections;
  for (const name of HISTORY_COLLECTIONS) {
    const collection = value.collections[name];
    if (!isRecord(collection)) return null;
    for (const [key, row] of Object.entries(collection)) {
      if (!isSafeKey(key) || !isHistoryRow(name, row) || key !== rowKey(name, row)) return null;
      collections[name][key] = row;
    }
  }
  if (value.liveRows !== undefined && !isLiveRows(value.liveRows)) return null;
  if (value.bootstrapComplete !== undefined && typeof value.bootstrapComplete !== 'boolean')
    return null;
  return {
    protocol: 1,
    cursor: value.cursor as string | null,
    collections,
    ...(value.liveRows === undefined ? {} : { liveRows: value.liveRows }),
    ...(value.bootstrapComplete === undefined
      ? {}
      : { bootstrapComplete: value.bootstrapComplete }),
  };
}

function isLiveRows(value: unknown): value is LiveSnapshotRows {
  if (
    !isRecord(value) ||
    typeof value.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.fetchedAt)) ||
    !isRecord(value.avatarSignedUrlsByPath) ||
    !isRecord(value.limits)
  )
    return false;
  for (const name of HISTORY_COLLECTIONS) {
    if (
      !Array.isArray(value[name]) ||
      !(value[name] as unknown[]).every((row) => isHistoryRow(name, row))
    )
      return false;
  }
  return ['relationships', 'openDebts', 'inboxItems', 'notificationViews'].every((name) =>
    Array.isArray(value[name]),
  );
}

export function parseHistorySyncPage(value: unknown): HistorySyncPage {
  if (
    !isRecord(value) ||
    value.protocol !== 1 ||
    !parseCursor(value.cursor) ||
    typeof value.hasMore !== 'boolean' ||
    typeof value.reset !== 'boolean' ||
    !Array.isArray(value.changes)
  ) {
    throw new Error('La respuesta del historial no es válida. Vuelve a sincronizar.');
  }
  const changes: HistorySyncChange[] = value.changes.map((change: unknown) => {
    if (
      !isRecord(change) ||
      !HISTORY_COLLECTIONS.includes(change.collection as HistoryCollection) ||
      !isSafeKey(change.key) ||
      (change.row !== null && !isHistoryRow(change.collection as HistoryCollection, change.row))
    ) {
      throw new Error('La página del historial está incompleta. Vuelve a sincronizar.');
    }
    if (
      change.row !== null &&
      change.key !== rowKey(change.collection as HistoryCollection, change.row)
    ) {
      throw new Error('La identidad del registro del historial no es válida.');
    }
    return {
      collection: change.collection as HistoryCollection,
      key: change.key,
      row: change.row,
    };
  });
  return {
    protocol: 1,
    cursor: value.cursor as string,
    hasMore: value.hasMore,
    reset: value.reset,
    changes,
  };
}

export function applyHistorySyncPage(state: HistorySyncState, input: unknown): HistorySyncState {
  const page = parseHistorySyncPage(input);
  const nextCursor = parseCursor(page.cursor)!;
  const previousCursor = parseCursor(state.cursor);
  if (page.hasMore && page.changes.length === 0) {
    throw new Error('La sincronización del historial no avanzó. Intenta de nuevo.');
  }
  if (
    !page.reset &&
    previousCursor &&
    (previousCursor.epoch !== nextCursor.epoch ||
      compareRevisions(nextCursor.revision, previousCursor.revision) < 0)
  ) {
    throw new Error('El cursor del historial cambió. Vuelve a sincronizar.');
  }
  if (
    page.hasMore &&
    previousCursor &&
    !page.reset &&
    previousCursor.revision === nextCursor.revision
  ) {
    throw new Error('La sincronización del historial no avanzó. Intenta de nuevo.');
  }
  const before = page.reset ? emptyHistorySyncState() : state;
  const collections = { ...before.collections };
  const copied = new Set<HistoryCollection>();
  for (const change of page.changes) {
    if (!copied.has(change.collection)) {
      collections[change.collection] = { ...collections[change.collection] };
      copied.add(change.collection);
    }
    if (change.row === null) delete collections[change.collection][change.key];
    else collections[change.collection][change.key] = change.row;
  }
  return {
    protocol: 1,
    cursor: page.cursor,
    collections,
    ...(before.liveRows ? { liveRows: before.liveRows } : {}),
    bootstrapComplete: !page.hasMore || (!page.reset && state.bootstrapComplete === true),
  };
}

function rowKey(collection: HistoryCollection, row: HistoryRow): string {
  if (collection === 'history')
    return `${String(row.item_kind)}:${String(row.relationship_id)}:${String(row.item_id)}`;
  return String(row.id);
}

export function mergeHistoryWithLiveRows(
  rows: LiveSnapshotRows,
  state: HistorySyncState,
): LiveSnapshotRows {
  const merged: Partial<LiveSnapshotRows> = {};
  for (const name of HISTORY_COLLECTIONS) {
    const byId = new Map<string, HistoryRow>();
    for (const row of Object.values(state.collections[name])) byId.set(rowKey(name, row), row);
    // Active data is refreshed on every request. It replaces any cached copy
    // of the same identity; histories never duplicate a currently active row.
    for (const row of rows[name]) {
      const record = row as unknown as HistoryRow;
      byId.set(rowKey(name, record), record);
    }
    Object.assign(merged, { [name]: [...byId.values()] });
  }
  return { ...rows, ...merged };
}
