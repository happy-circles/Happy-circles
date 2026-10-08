import type { PeopleTargetResolution } from './live-data/types-runtime';

export type ContactResolutionTarget = {
  readonly userId?: string | null;
  readonly phoneE164?: string;
  readonly matchedUserId?: string | null;
  readonly inviteId?: string | null;
  readonly watchIds?: readonly string[];
};

type Change = {
  readonly invalidatedPhones: readonly string[];
  readonly priority?: 'event' | 'background';
};
type Listener = (change: Change) => void;
type UserState = {
  entries: Record<string, PeopleTargetResolution>;
  generations: Map<string, number>;
  listeners: Set<Listener>;
  invalidatedAt: number;
  epoch: number;
  watchInvalidations: Map<string, { revision: number; at: number }>;
};

const states = new Map<string, UserState>();
const EMPTY_RESOLUTIONS: Record<string, PeopleTargetResolution> = {};
let revision = Date.now();

function stateFor(userId: string): UserState {
  let state = states.get(userId);
  if (!state) {
    state = {
      entries: {},
      generations: new Map(),
      listeners: new Set(),
      invalidatedAt: 0,
      epoch: 0,
      watchInvalidations: new Map(),
    };
    states.set(userId, state);
  }
  return state;
}

export function contactResolutionTtl(status: PeopleTargetResolution['status']): number {
  return status === 'pending_activation' || status === 'pending_friendship' ? 30_000 : 60_000;
}

export function isContactResolutionFresh(
  row: PeopleTargetResolution | undefined,
  now = Date.now(),
) {
  return Boolean(row?.resolvedAt && now - row.resolvedAt < contactResolutionTtl(row.status));
}

export function readContactResolutions(userId: string | null | undefined) {
  return userId ? stateFor(userId).entries : EMPTY_RESOLUTIONS;
}

export function subscribeContactResolutions(userId: string, listener: Listener) {
  const state = stateFor(userId);
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function clearContactResolutionUser(userId: string) {
  const state = stateFor(userId);
  state.entries = {};
  state.generations.clear();
  state.watchInvalidations.clear();
  state.invalidatedAt = Date.now();
  state.epoch += 1;
  for (const listener of state.listeners) listener({ invalidatedPhones: [] });
  setContactRealtimeReady(userId, false);
}

export function captureContactGenerations(userId: string, phones: readonly string[]) {
  const state = stateFor(userId);
  return Object.assign(new Map(phones.map((phone) => [phone, state.generations.get(phone) ?? 0])), {
    epoch: state.epoch,
  });
}

export function contactResolutionEpoch(userId: string) {
  return stateFor(userId).epoch;
}

export function captureContactDiscoveryRevision() {
  return revision;
}

export function mergeContactResolutions(
  userId: string,
  rows: readonly PeopleTargetResolution[],
  options: {
    readonly expectedGenerations?: ReadonlyMap<string, number> & { readonly epoch?: number };
    readonly expectedEpoch?: number;
    readonly fromCache?: boolean;
    readonly discoveryRevision?: number;
  } = {},
): readonly PeopleTargetResolution[] {
  const state = stateFor(userId);
  const expectedEpoch = options.expectedEpoch ?? options.expectedGenerations?.epoch;
  if (expectedEpoch !== undefined && expectedEpoch !== state.epoch) return [];
  const next = { ...state.entries };
  const accepted: PeopleTargetResolution[] = [];
  const invalidatedPhones: string[] = [];
  for (const row of rows) {
    revision = Math.max(revision, row.generation ?? 0, Date.now());
    const current = next[row.phoneE164];
    const generation = state.generations.get(row.phoneE164) ?? 0;
    if (
      options.expectedGenerations &&
      options.expectedGenerations.get(row.phoneE164) !== generation
    )
      continue;
    if (
      options.fromCache &&
      (!row.resolvedAt ||
        row.resolvedAt <= state.invalidatedAt ||
        (current && (current.generation ?? 0) >= (row.generation ?? 0)))
    )
      continue;
    const watchInvalidation = row.discoveryWatchId
      ? state.watchInvalidations.get(row.discoveryWatchId)
      : undefined;
    const invalidatedDuringRead =
      watchInvalidation &&
      options.discoveryRevision !== undefined &&
      watchInvalidation.revision > options.discoveryRevision;
    const acceptedRow = {
      ...row,
      resolvedAt: invalidatedDuringRead ? 0 : options.fromCache ? row.resolvedAt : Date.now(),
      generation: options.fromCache ? row.generation : ++revision,
    };
    next[row.phoneE164] = acceptedRow;
    state.generations.set(row.phoneE164, acceptedRow.generation ?? generation);
    accepted.push(acceptedRow);
    if (invalidatedDuringRead) invalidatedPhones.push(row.phoneE164);
    else if (row.discoveryWatchId && !options.fromCache)
      state.watchInvalidations.delete(row.discoveryWatchId);
  }
  if (accepted.length) {
    state.entries = next;
    for (const listener of state.listeners) listener({ invalidatedPhones, priority: 'event' });
  }
  return accepted;
}

export function invalidateContactResolutions(target: ContactResolutionTarget = {}) {
  const selected = target.userId
    ? [[target.userId, stateFor(target.userId)] as const]
    : [...states.entries()];
  for (const [, state] of selected) {
    // Watch IDs are scoped: existing rows use their generation, and first reads
    // use the buffered watch event once the response reveals its opaque ID.
    if (!target.watchIds) state.epoch += 1;
    state.invalidatedAt = Date.now();
    if (target.watchIds) {
      const eventRevision = ++revision;
      for (const watchId of target.watchIds)
        state.watchInvalidations.set(watchId, { revision: eventRevision, at: Date.now() });
      for (const [watchId, entry] of state.watchInvalidations) {
        if (Date.now() - entry.at > 15 * 60_000 || state.watchInvalidations.size > 10_000)
          state.watchInvalidations.delete(watchId);
      }
    }
    const next = { ...state.entries };
    const phones: string[] = [];
    const scoped = target.phoneE164 || target.matchedUserId || target.inviteId || target.watchIds;
    for (const [phone, row] of Object.entries(next)) {
      if (
        scoped &&
        !(
          phone === target.phoneE164 ||
          (target.matchedUserId && row.matchedUserId === target.matchedUserId) ||
          (target.inviteId &&
            (row.friendshipInviteId === target.inviteId ||
              row.accountInviteId === target.inviteId)) ||
          (row.discoveryWatchId && target.watchIds?.includes(row.discoveryWatchId))
        )
      )
        continue;
      const generation = ++revision;
      state.generations.set(phone, generation);
      next[phone] = { ...row, resolvedAt: 0, generation };
      phones.push(phone);
    }
    if (target.phoneE164 && !next[target.phoneE164]) {
      state.generations.set(target.phoneE164, ++revision);
      phones.push(target.phoneE164);
    }
    state.entries = next;
    for (const listener of state.listeners) {
      listener({ invalidatedPhones: phones, priority: scoped ? 'event' : 'background' });
    }
  }
}

export function applyContactActionResult(target: ContactResolutionTarget, status: string) {
  invalidateContactResolutions(target);
  const selected = target.userId
    ? [[target.userId, stateFor(target.userId)] as const]
    : [...states.entries()];
  for (const [userId, state] of selected) {
    const rows = Object.values(state.entries).filter(
      (row) =>
        row.phoneE164 === target.phoneE164 ||
        (target.matchedUserId && row.matchedUserId === target.matchedUserId) ||
        (target.inviteId &&
          (row.friendshipInviteId === target.inviteId || row.accountInviteId === target.inviteId)),
    );
    const terminal = ['canceled', 'rejected', 'expired'].includes(status);
    if (status !== 'accepted' && !terminal) continue;
    mergeContactResolutions(
      userId,
      rows
        .filter(
          (row) =>
            status === 'accepted' ||
            row.status === 'pending_friendship' ||
            row.status === 'active_user',
        )
        .map((row) => ({
          ...row,
          status:
            status === 'accepted'
              ? 'already_related'
              : row.matchedUserId
                ? 'active_user'
                : 'no_account',
          friendshipInviteId: null,
          accountInviteId: null,
          accountInviteStatus: null,
          friendshipDirection: null,
          availableActions: status === 'accepted' ? [] : row.matchedUserId ? ['add'] : ['invite'],
        })),
    );
  }
}

const realtimeReady = new Map<string, boolean>();
const realtimeListeners = new Map<string, Set<() => void>>();
export function isContactRealtimeReady(userId: string) {
  return realtimeReady.get(userId) === true;
}
export function setContactRealtimeReady(userId: string, ready: boolean) {
  const changed = realtimeReady.get(userId) !== ready;
  realtimeReady.set(userId, ready);
  if (changed) for (const listener of realtimeListeners.get(userId) ?? []) listener();
}
export function subscribeContactRealtime(userId: string, listener: () => void) {
  const listeners = realtimeListeners.get(userId) ?? new Set();
  listeners.add(listener);
  realtimeListeners.set(userId, listeners);
  return () => {
    listeners.delete(listener);
  };
}
