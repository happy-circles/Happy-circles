import type { PeopleTargetResolution } from './live-data/types-runtime';

export type ContactResolutionTarget = {
  readonly userId?: string | null;
  readonly phoneE164?: string;
  readonly matchedUserId?: string | null;
  readonly inviteId?: string | null;
  readonly relationshipId?: string | null;
  readonly watchIds?: readonly string[];
};

type Change = {
  readonly invalidatedPhones: readonly string[];
  readonly changedPhones: readonly string[];
  readonly priority?: 'event' | 'background';
};
type Listener = (change: Change) => void;
type UserState = {
  entries: Record<string, PeopleTargetResolution>;
  generations: Map<string, number>;
  pendingWrites: Map<string, number>;
  listeners: Set<Listener>;
  invalidatedAt: number;
  epoch: number;
  watchInvalidations: Map<string, { revision: number; at: number }>;
  watchPhones: Map<string, string>;
  matchedPhones: Map<string, Set<string>>;
  invitePhones: Map<string, Set<string>>;
  relationshipPhones: Map<string, Set<string>>;
  targetInvalidations: Map<
    string,
    { target: ContactResolutionTarget; revision: number; at: number }
  >;
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
      pendingWrites: new Map(),
      listeners: new Set(),
      invalidatedAt: 0,
      epoch: 0,
      watchInvalidations: new Map(),
      watchPhones: new Map(),
      matchedPhones: new Map(),
      invitePhones: new Map(),
      relationshipPhones: new Map(),
      targetInvalidations: new Map(),
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
  const changedPhones = Object.keys(state.entries);
  state.entries = {};
  state.generations.clear();
  state.pendingWrites.clear();
  state.watchInvalidations.clear();
  state.watchPhones.clear();
  state.matchedPhones.clear();
  state.invitePhones.clear();
  state.relationshipPhones.clear();
  state.targetInvalidations.clear();
  state.invalidatedAt = Date.now();
  state.epoch += 1;
  for (const listener of state.listeners) listener({ invalidatedPhones: [], changedPhones });
  setContactRealtimeReady(userId, false);
}

export function captureContactGenerations(userId: string, phones: readonly string[]) {
  const state = stateFor(userId);
  return Object.assign(new Map(phones.map((phone) => [phone, state.generations.get(phone) ?? 0])), {
    epoch: state.epoch,
    revision,
  });
}

export function contactResolutionEpoch(userId: string) {
  return stateFor(userId).epoch;
}

/** Keep display rows while older reads are fenced off by an explicit command. */
export function beginContactResolutionWrite(userId: string, phones: readonly string[]) {
  const state = stateFor(userId);
  const tokens = new Map<string, number>();
  for (const phone of new Set(phones)) {
    const token = ++revision;
    state.generations.set(phone, token);
    state.pendingWrites.set(phone, token);
    tokens.set(phone, token);
  }
  return Object.assign(captureContactGenerations(userId, phones), {
    finish: () => {
      const invalidatedPhones: string[] = [];
      for (const [phone, token] of tokens) {
        if (state.pendingWrites.get(phone) !== token) continue;
        state.pendingWrites.delete(phone);
        if (!state.entries[phone]?.resolvedAt) invalidatedPhones.push(phone);
      }
      if (invalidatedPhones.length)
        for (const listener of state.listeners)
          listener({ invalidatedPhones, changedPhones: [], priority: 'event' });
    },
  });
}

export function isContactResolutionWritePending(userId: string, phone: string) {
  return stateFor(userId).pendingWrites.has(phone);
}

export function captureContactDiscoveryRevision() {
  return revision;
}

export function mergeContactResolutions(
  userId: string,
  rows: readonly PeopleTargetResolution[],
  options: {
    readonly expectedGenerations?: ReadonlyMap<string, number> & {
      readonly epoch?: number;
      readonly revision?: number;
    };
    readonly expectedEpoch?: number;
    readonly fromCache?: boolean;
    readonly discoveryRevision?: number;
  } = {},
): readonly PeopleTargetResolution[] {
  const state = stateFor(userId);
  const expectedEpoch = options.expectedEpoch ?? options.expectedGenerations?.epoch;
  if (expectedEpoch !== undefined && expectedEpoch !== state.epoch) return [];
  let next = state.entries;
  const accepted: PeopleTargetResolution[] = [];
  const invalidatedPhones: string[] = [];
  for (const row of rows) {
    if (options.fromCache && state.pendingWrites.has(row.phoneE164)) continue;
    revision = Math.max(revision, row.generation ?? 0, Date.now());
    const current = next[row.phoneE164];
    const generation = state.generations.get(row.phoneE164) ?? 0;
    if (
      options.expectedGenerations &&
      options.expectedGenerations.get(row.phoneE164) !== generation
    )
      continue;
    if (
      options.expectedGenerations?.revision !== undefined &&
      [...state.targetInvalidations.values()].some(
        (entry) =>
          entry.revision > options.expectedGenerations!.revision! &&
          matchesTarget(row.phoneE164, row, entry.target),
      )
    )
      continue;
    if (
      options.fromCache &&
      (!row.resolvedAt ||
        row.resolvedAt <= state.invalidatedAt ||
        (generation > 0 && generation >= (row.generation ?? 0)))
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
    if (next === state.entries) next = { ...state.entries };
    updateRowIndex(state.matchedPhones, row.phoneE164, current?.matchedUserId, row.matchedUserId);
    updateRowIndex(
      state.relationshipPhones,
      row.phoneE164,
      current?.relationshipId,
      row.relationshipId,
    );
    updateRowIndex(
      state.invitePhones,
      row.phoneE164,
      current?.friendshipInviteId,
      row.friendshipInviteId,
    );
    updateRowIndex(
      state.invitePhones,
      row.phoneE164,
      current?.accountInviteId,
      row.accountInviteId,
    );
    next[row.phoneE164] = acceptedRow;
    if (row.discoveryWatchId) state.watchPhones.set(row.discoveryWatchId, row.phoneE164);
    state.generations.set(row.phoneE164, acceptedRow.generation ?? generation);
    accepted.push(acceptedRow);
    if (invalidatedDuringRead) invalidatedPhones.push(row.phoneE164);
    else if (row.discoveryWatchId && !options.fromCache)
      state.watchInvalidations.delete(row.discoveryWatchId);
  }
  if (accepted.length) {
    state.entries = next;
    for (const listener of state.listeners)
      listener({
        invalidatedPhones,
        changedPhones: accepted.map((row) => row.phoneE164),
        priority: 'event',
      });
  }
  return accepted;
}

function matchesTarget(
  phone: string,
  row: PeopleTargetResolution,
  target: ContactResolutionTarget,
) {
  return Boolean(
    phone === target.phoneE164 ||
    (target.matchedUserId && row.matchedUserId === target.matchedUserId) ||
    (target.inviteId &&
      (row.friendshipInviteId === target.inviteId || row.accountInviteId === target.inviteId)) ||
    (target.relationshipId && row.relationshipId === target.relationshipId) ||
    (row.discoveryWatchId && target.watchIds?.includes(row.discoveryWatchId)),
  );
}

function updateRowIndex(
  index: Map<string, Set<string>>,
  phone: string,
  previousKey: string | null | undefined,
  key: string | null | undefined,
) {
  if (previousKey === key) return;
  if (previousKey) {
    const previous = index.get(previousKey);
    previous?.delete(phone);
    if (previous?.size === 0) index.delete(previousKey);
  }
  if (key) {
    const phones = index.get(key) ?? new Set<string>();
    phones.add(phone);
    index.set(key, phones);
  }
}

function phonesForTarget(state: UserState, target: ContactResolutionTarget) {
  const scoped =
    target.phoneE164 ||
    target.matchedUserId ||
    target.inviteId ||
    target.relationshipId ||
    target.watchIds;
  if (!scoped) return Object.keys(state.entries);
  const phones = new Set<string>(target.phoneE164 ? [target.phoneE164] : []);
  if (target.matchedUserId)
    for (const phone of state.matchedPhones.get(target.matchedUserId) ?? []) phones.add(phone);
  if (target.inviteId)
    for (const phone of state.invitePhones.get(target.inviteId) ?? []) phones.add(phone);
  if (target.relationshipId)
    for (const phone of state.relationshipPhones.get(target.relationshipId) ?? [])
      phones.add(phone);
  for (const watchId of target.watchIds ?? []) {
    const phone = state.watchPhones.get(watchId);
    if (phone) phones.add(phone);
  }
  return [...phones];
}

export function readContactResolutionPhonesForTarget(
  userId: string,
  target: ContactResolutionTarget,
) {
  return phonesForTarget(stateFor(userId), target);
}

/** Registration associates opaque events even before a phone's first state lookup. */
export function associateContactDiscoveryWatches(
  userId: string,
  watches: readonly { readonly phoneE164: string; readonly discoveryWatchId: string }[],
  discoveryRevision: number,
) {
  const state = stateFor(userId);
  const changedDuringRegistration: string[] = [];
  for (const watch of watches) {
    state.watchPhones.set(watch.discoveryWatchId, watch.phoneE164);
    if ((state.watchInvalidations.get(watch.discoveryWatchId)?.revision ?? 0) > discoveryRevision)
      changedDuringRegistration.push(watch.phoneE164);
  }
  for (const phoneE164 of changedDuringRegistration)
    invalidateContactResolutions({ userId, phoneE164 });
}

export function invalidateContactResolutions(target: ContactResolutionTarget = {}) {
  const selected = target.userId
    ? [[target.userId, stateFor(target.userId)] as const]
    : [...states.entries()];
  for (const [, state] of selected) {
    // Watch IDs are scoped: existing rows use their generation, and first reads
    // use the buffered watch event once the response reveals its opaque ID.
    const scoped =
      target.phoneE164 ||
      target.matchedUserId ||
      target.inviteId ||
      target.relationshipId ||
      target.watchIds;
    if (!scoped) {
      state.epoch += 1;
      state.invalidatedAt = Date.now();
    } else if (!target.watchIds) {
      const key = JSON.stringify([
        target.phoneE164,
        target.matchedUserId,
        target.inviteId,
        target.relationshipId,
      ]);
      state.targetInvalidations.set(key, { target, revision: ++revision, at: Date.now() });
      for (const [key, entry] of state.targetInvalidations) {
        if (Date.now() - entry.at > 15 * 60_000 || state.targetInvalidations.size > 10_000)
          state.targetInvalidations.delete(key);
      }
    }
    if (target.watchIds) {
      const eventRevision = ++revision;
      for (const watchId of target.watchIds)
        state.watchInvalidations.set(watchId, { revision: eventRevision, at: Date.now() });
      for (const [watchId, entry] of state.watchInvalidations) {
        if (Date.now() - entry.at > 15 * 60_000 || state.watchInvalidations.size > 10_000)
          state.watchInvalidations.delete(watchId);
      }
    }
    let next = state.entries;
    const phones: string[] = [];
    for (const phone of phonesForTarget(state, target)) {
      const row = next[phone];
      const generation = ++revision;
      state.generations.set(phone, generation);
      if (row) {
        if (next === state.entries) next = { ...state.entries };
        next[phone] = { ...row, resolvedAt: 0, generation };
      }
      phones.push(phone);
    }
    state.entries = next;
    for (const listener of state.listeners) {
      listener({
        invalidatedPhones: phones,
        changedPhones: phones,
        priority: scoped ? 'event' : 'background',
      });
    }
  }
}

export function applyContactActionResult(target: ContactResolutionTarget, status: string) {
  invalidateContactResolutions(target);
  const selected = target.userId
    ? [[target.userId, stateFor(target.userId)] as const]
    : [...states.entries()];
  for (const [userId, state] of selected) {
    const rows = phonesForTarget(state, target).flatMap((phone) =>
      state.entries[phone] ? [state.entries[phone]] : [],
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
