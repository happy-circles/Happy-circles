import { describe, expect, it } from 'vitest';
import type { PeopleTargetResolution } from './live-data/types-runtime';
import {
  applyContactActionResult,
  captureContactDiscoveryRevision,
  captureContactGenerations,
  clearContactResolutionUser,
  invalidateContactResolutions,
  isContactResolutionFresh,
  mergeContactResolutions,
  readContactResolutions,
  subscribeContactResolutions,
} from './contact-resolution-state';

function row(
  status: PeopleTargetResolution['status'],
  phoneE164 = '+573001234567',
): PeopleTargetResolution {
  return {
    phoneE164,
    status,
    matchedUserId: 'person',
    displayName: 'Ana',
    avatarPath: null,
    relationshipId: null,
    friendshipInviteId: status === 'pending_friendship' ? 'invite' : null,
    accountInviteId: null,
    accountInviteStatus: null,
  };
}

describe('shared contact resolution state', () => {
  it('cancel then resend cannot be overwritten by a read begun before cancellation', () => {
    const user = 'cancel-resend';
    mergeContactResolutions(user, [row('pending_friendship')]);
    const beforeCancel = captureContactGenerations(user, [row('pending_friendship').phoneE164]);
    applyContactActionResult({ userId: user, inviteId: 'invite' }, 'canceled');
    expect(readContactResolutions(user)[row('active_user').phoneE164].status).toBe('active_user');
    expect(
      mergeContactResolutions(user, [row('pending_friendship')], {
        expectedGenerations: beforeCancel,
      }),
    ).toEqual([]);
    mergeContactResolutions(user, [
      { ...row('pending_friendship'), friendshipInviteId: 'new-invite' },
    ]);
    expect(readContactResolutions(user)[row('active_user').phoneE164].friendshipInviteId).toBe(
      'new-invite',
    );
  });

  it('a rejection immediately unlocks all known numbers of the target', () => {
    const user = 'reject-numbers';
    mergeContactResolutions(user, [
      row('pending_friendship'),
      row('pending_friendship', '+573009876543'),
    ]);
    applyContactActionResult({ userId: user, inviteId: 'invite' }, 'rejected');
    expect(Object.values(readContactResolutions(user)).map((value) => value.status)).toEqual([
      'active_user',
      'active_user',
    ]);
  });

  it('a concurrent acceptance keeps the friendship instead of falsely canceling it', () => {
    const user = 'accepted-race';
    mergeContactResolutions(user, [row('pending_friendship')]);
    applyContactActionResult({ userId: user, inviteId: 'invite' }, 'accepted');
    expect(readContactResolutions(user)[row('active_user').phoneE164].status).toBe(
      'already_related',
    );
  });

  it('buffers an opaque event before the first response has supplied its watch ID', () => {
    const user = 'watch-before-read';
    const discoveryRevision = captureContactDiscoveryRevision();
    const expectedGenerations = captureContactGenerations(user, [row('no_account').phoneE164]);
    const notifications: readonly string[][] = [];
    const collected = notifications as string[][];
    const unsubscribe = subscribeContactResolutions(user, (change) =>
      collected.push([...change.invalidatedPhones]),
    );
    invalidateContactResolutions({ userId: user, watchIds: ['new-watch'] });
    mergeContactResolutions(user, [{ ...row('no_account'), discoveryWatchId: 'new-watch' }], {
      discoveryRevision,
      expectedGenerations,
    });
    expect(
      isContactResolutionFresh(readContactResolutions(user)[row('active_user').phoneE164]),
    ).toBe(false);
    expect(collected.at(-1)).toEqual([row('active_user').phoneE164]);
    mergeContactResolutions(user, [{ ...row('active_user'), discoveryWatchId: 'new-watch' }], {
      discoveryRevision: captureContactDiscoveryRevision(),
    });
    expect(readContactResolutions(user)[row('active_user').phoneE164].status).toBe('active_user');
    expect(
      isContactResolutionFresh(readContactResolutions(user)[row('active_user').phoneE164]),
    ).toBe(true);
    unsubscribe();
  });

  it('does not let older persistent data replace a current mutation or cross users', () => {
    const user = 'hydrate-generation';
    const previous = mergeContactResolutions(user, [row('pending_friendship')])[0];
    applyContactActionResult({ userId: user, inviteId: 'invite' }, 'rejected');
    mergeContactResolutions(user, [previous], { fromCache: true });
    expect(readContactResolutions(user)[previous.phoneE164].status).toBe('active_user');
    expect(readContactResolutions('different-user')).toEqual({});
    clearContactResolutionUser(user);
    expect(readContactResolutions(user)).toEqual({});
  });

  it('rechecks negative and pending data without deleting their display state', () => {
    const now = Date.now();
    expect(isContactResolutionFresh({ ...row('no_account'), resolvedAt: now - 61_000 }, now)).toBe(
      false,
    );
    expect(
      isContactResolutionFresh({ ...row('pending_friendship'), resolvedAt: now - 31_000 }, now),
    ).toBe(false);
    expect(isContactResolutionFresh({ ...row('active_user'), resolvedAt: now - 20_000 }, now)).toBe(
      true,
    );
  });

  it('rejects an unknown phone response from before logout even after the same user signs in', () => {
    const user = 'relogin-epoch';
    const expectedGenerations = captureContactGenerations(user, [row('no_account').phoneE164]);
    clearContactResolutionUser(user);
    expect(mergeContactResolutions(user, [row('no_account')], { expectedGenerations })).toEqual([]);
    expect(readContactResolutions(user)).toEqual({});
  });

  it('invalidates an initial unknown phone request when a mutation occurs before lookup completes', () => {
    const user = 'unknown-mutation';
    const expectedGenerations = captureContactGenerations(user, [row('no_account').phoneE164]);
    invalidateContactResolutions({ userId: user, inviteId: 'invite-not-yet-cached' });
    expect(
      mergeContactResolutions(user, [row('pending_friendship')], { expectedGenerations }),
    ).toEqual([]);
  });

  it('advances beyond a persistent generation from a fast previous run', () => {
    const user = 'restart-generation';
    const persisted = {
      ...row('no_account'),
      resolvedAt: Date.now(),
      generation: Date.now() + 100_000,
    };
    mergeContactResolutions(user, [persisted], { fromCache: true });
    const [fresh] = mergeContactResolutions(user, [row('active_user')]);
    expect(fresh.generation).toBeGreaterThan(persisted.generation);
  });

  it('does not infer an active account merely because a canceled access matched a profile', () => {
    const user = 'inactive-account';
    mergeContactResolutions(user, [
      { ...row('pending_activation'), accountInviteId: 'account-invite' },
    ]);
    applyContactActionResult({ userId: user, inviteId: 'account-invite' }, 'canceled');
    const current = readContactResolutions(user)[row('active_user').phoneE164];
    expect(current.status).toBe('pending_activation');
    expect(isContactResolutionFresh(current)).toBe(false);
  });

  it('does not remove an existing friendship when an old invitation closes', () => {
    const user = 'existing-friendship';
    mergeContactResolutions(user, [row('already_related')]);
    applyContactActionResult({ userId: user, phoneE164: row('active_user').phoneE164 }, 'canceled');
    expect(readContactResolutions(user)[row('active_user').phoneE164].status).toBe(
      'already_related',
    );
  });
});
