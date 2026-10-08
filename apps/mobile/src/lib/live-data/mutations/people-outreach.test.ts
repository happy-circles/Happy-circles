import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeopleOutreachResult, PeopleTargetResolution } from '../types-runtime';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  persist: vi.fn(),
  invalidateCache: vi.fn(),
  invalidateSnapshot: vi.fn(),
  invalidateQueries: vi.fn(),
  forgetIntentions: vi.fn(),
  idempotency: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: {
    mutationFn: (input: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown, input: unknown) => unknown;
  }) => ({
    mutateAsync: async (input: unknown) => {
      const data = await options.mutationFn(input);
      await options.onSuccess?.(data, input);
      return data;
    },
  }),
}));
vi.mock('@/providers/session-provider', () => ({
  useSession: () => ({ userId: 'mutation-user' }),
}));
vi.mock('@/features/home/contact-resolution-service', () => ({ resolveContactPhones: vi.fn() }));
vi.mock('@/features/home/people-target-resolution-cache', () => ({
  savePeopleTargetResolutionsToCache: mocks.persist,
  invalidatePeopleTargetResolutionCache: mocks.invalidateCache,
}));
vi.mock('@/lib/query-client', () => ({
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));
vi.mock('../client', () => ({
  invalidateAppSnapshot: mocks.invalidateSnapshot,
  assertSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'mutation-user' } } } }) },
  }),
}));
vi.mock('./edge-action', () => ({
  invokeParsedEdgeFunction: mocks.invoke,
  withIdempotencyKey: mocks.idempotency,
  forgetInvitationIntentions: mocks.forgetIntentions,
}));

import { useCreatePeopleOutreachMutation } from './people-outreach';
import { invalidateInvitationState } from './contact-invalidation';
import {
  applyContactActionResult,
  captureContactGenerations,
  clearContactResolutionUser,
  isContactResolutionWritePending,
  mergeContactResolutions,
  readContactResolutions,
} from '@/lib/contact-resolution-state';

const phone = '+573001234567';
const otherPhone = '+573009876543';
const input = {
  channel: 'remote' as const,
  intendedRecipientAlias: 'Ana',
  intendedRecipientPhoneE164: phone,
};
const initial: PeopleTargetResolution = {
  phoneE164: phone,
  status: 'active_user',
  matchedUserId: 'ana',
  displayName: 'Ana',
  avatarPath: null,
  relationshipId: null,
  friendshipInviteId: null,
  accountInviteId: null,
  accountInviteStatus: null,
  discoveryWatchId: 'temporary-watch',
};
const response: PeopleOutreachResult = {
  kind: 'friendship',
  status: 'active_user',
  matchedUserId: 'ana',
  displayName: 'Ana',
  inviteId: 'confirmed-invite',
  friendshipDirection: 'outgoing',
  result: {
    inviteId: 'confirmed-invite',
    status: 'pending_recipient',
    created: true,
    friendshipDirection: 'outgoing',
  },
};

beforeEach(() => {
  clearContactResolutionUser('mutation-user');
  vi.clearAllMocks();
  mocks.persist.mockResolvedValue(undefined);
  mocks.invalidateCache.mockResolvedValue(undefined);
  // These queries deliberately never finish: action completion must be independent of them.
  mocks.invalidateSnapshot.mockImplementation(() => new Promise(() => {}));
  mocks.invalidateQueries.mockImplementation(() => new Promise(() => {}));
  mocks.invoke.mockResolvedValue(response);
  mocks.idempotency.mockImplementation((_operation: string, payload: unknown) => payload);
});

describe('outreach mutation cache confirmation', () => {
  it('confirms only the command target and returns without waiting for screen refresh', async () => {
    mergeContactResolutions('mutation-user', [
      initial,
      { ...initial, phoneE164: otherPhone, matchedUserId: 'other' },
    ]);
    const beforeOther = readContactResolutions('mutation-user')[otherPhone];
    await expect(useCreatePeopleOutreachMutation().mutateAsync(input)).resolves.toEqual(response);
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.idempotency).toHaveBeenCalledWith(
      'create_people_outreach_remote',
      expect.objectContaining({ intendedRecipientPhoneE164: phone }),
    );
    expect(readContactResolutions('mutation-user')[phone]).toMatchObject({
      status: 'pending_friendship',
      friendshipInviteId: 'confirmed-invite',
      discoveryWatchId: 'temporary-watch',
    });
    expect(readContactResolutions('mutation-user')[otherPhone]).toBe(beforeOther);
    expect(mocks.persist).toHaveBeenCalledWith('mutation-user', [
      expect.objectContaining({ phoneE164: phone, friendshipInviteId: 'confirmed-invite' }),
    ]);
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
    expect(mocks.invalidateSnapshot).toHaveBeenCalledOnce();
  });

  it('does not overwrite a newer accepted event that arrives while the command is pending', async () => {
    mergeContactResolutions('mutation-user', [initial]);
    let finish!: (result: PeopleOutreachResult) => void;
    mocks.invoke.mockImplementation(
      () =>
        new Promise<PeopleOutreachResult>((resolve) => {
          finish = resolve;
        }),
    );
    const action = useCreatePeopleOutreachMutation().mutateAsync(input);
    applyContactActionResult({ userId: 'mutation-user', phoneE164: phone }, 'accepted');
    finish(response);
    await expect(action).resolves.toEqual(response);
    expect(readContactResolutions('mutation-user')[phone]?.status).toBe('already_related');
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it('fences a read started before the command, so its late active-user response cannot discard the send', async () => {
    mergeContactResolutions('mutation-user', [initial]);
    const oldRead = captureContactGenerations('mutation-user', [phone]);
    mocks.invoke.mockImplementation(async () => {
      expect(isContactResolutionWritePending('mutation-user', phone)).toBe(true);
      expect(
        mergeContactResolutions('mutation-user', [initial], { expectedGenerations: oldRead }),
      ).toEqual([]);
      return response;
    });
    await useCreatePeopleOutreachMutation().mutateAsync(input);
    expect(readContactResolutions('mutation-user')[phone]).toMatchObject({
      status: 'pending_friendship',
      friendshipInviteId: 'confirmed-invite',
    });
    expect(isContactResolutionWritePending('mutation-user', phone)).toBe(false);
  });

  it('releases the write barrier after a network error so a later retry or reconciliation is possible', async () => {
    mocks.invoke.mockRejectedValue(new Error('Network request failed'));
    await expect(useCreatePeopleOutreachMutation().mutateAsync(input)).rejects.toThrow(
      'Network request failed',
    );
    expect(isContactResolutionWritePending('mutation-user', phone)).toBe(false);
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});

describe('scoped invitation invalidation', () => {
  it('invalidates the selected persistent row and preserves unrelated contact freshness', async () => {
    mergeContactResolutions('mutation-user', [
      {
        ...initial,
        status: 'pending_friendship',
        friendshipInviteId: 'canceled-invite',
        friendshipDirection: 'outgoing',
      },
      { ...initial, phoneE164: otherPhone, matchedUserId: 'other' },
    ]);
    const beforeOther = readContactResolutions('mutation-user')[otherPhone];
    await invalidateInvitationState({ inviteId: 'canceled-invite' }, 'canceled');
    await Promise.resolve();
    expect(mocks.invalidateCache).toHaveBeenCalledWith('mutation-user', {
      inviteId: 'canceled-invite',
    });
    expect(readContactResolutions('mutation-user')[otherPhone]).toBe(beforeOther);
    expect(mocks.persist).toHaveBeenCalledWith('mutation-user', [
      expect.objectContaining({
        phoneE164: phone,
        status: 'active_user',
        friendshipInviteId: null,
      }),
    ]);
  });

  it('does not erase the contact cache when a QR action has no contact selector', async () => {
    mergeContactResolutions('mutation-user', [initial]);
    const before = readContactResolutions('mutation-user')[phone];
    await invalidateInvitationState({ phoneE164: undefined }, 'pending_claim');
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
    expect(readContactResolutions('mutation-user')[phone]).toBe(before);
    expect(mocks.invalidateSnapshot).toHaveBeenCalledOnce();
  });
});
