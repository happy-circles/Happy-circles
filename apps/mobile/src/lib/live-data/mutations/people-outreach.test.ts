import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeopleOutreachResult, PeopleTargetResolution } from '../types-runtime';
import type * as EdgeActionModule from './edge-action';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  persist: vi.fn(),
  invalidateCache: vi.fn(),
  invalidateSnapshot: vi.fn(),
  invalidateQueries: vi.fn(),
  forgetIntentions: vi.fn(),
  idempotency: vi.fn(),
  useSession: vi.fn(),
  getSession: vi.fn(),
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
  useSession: mocks.useSession,
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
  invokeSupabaseFunction: mocks.invoke,
  assertSupabaseClient: () => ({
    auth: { getSession: mocks.getSession },
  }),
}));
vi.mock('./edge-action', async () => ({
  ...(await vi.importActual<typeof EdgeActionModule>('./edge-action')),
  withIdempotencyKey: mocks.idempotency,
  forgetInvitationIntentions: mocks.forgetIntentions,
}));

import { useCreatePeopleOutreachMutation } from './people-outreach';
import { invalidateInvitationState } from './contact-invalidation';
import {
  clearImmediateInviteRequestUser,
  readImmediateInviteRequest,
} from '@/features/people/immediate-invite-request';
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
  clearContactResolutionUser('other-account');
  clearImmediateInviteRequestUser('mutation-user');
  clearImmediateInviteRequestUser('other-account');
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({ userId: 'mutation-user' });
  mocks.getSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: 'mutation-user' } } },
  });
  mocks.persist.mockResolvedValue(undefined);
  mocks.invalidateCache.mockResolvedValue(undefined);
  // These queries deliberately never finish: action completion must be independent of them.
  mocks.invalidateSnapshot.mockImplementation(() => new Promise(() => {}));
  mocks.invalidateQueries.mockImplementation(() => new Promise(() => {}));
  mocks.invoke.mockResolvedValue(response);
  mocks.idempotency.mockImplementation((_operation: string, payload: Record<string, unknown>) => ({
    ...payload,
    idempotencyKey: 'outreach-test-key',
  }));
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
    expect(mocks.invoke).toHaveBeenCalledWith(
      'create-people-outreach',
      expect.objectContaining({ intendedRecipientPhoneE164: phone }),
      { expectedUserId: 'mutation-user' },
    );
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
    let started!: () => void;
    const rpcStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.invoke.mockImplementation(
      () =>
        new Promise<PeopleOutreachResult>((resolve) => {
          finish = resolve;
          started();
        }),
    );
    const action = useCreatePeopleOutreachMutation().mutateAsync(input);
    await rpcStarted;
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

  it('rejects account A actions before RPC when the actual session is already account B', async () => {
    mergeContactResolutions('mutation-user', [initial]);
    mergeContactResolutions('other-account', [{ ...initial, matchedUserId: 'other' }]);
    const beforeA = readContactResolutions('mutation-user')[phone];
    const beforeB = readContactResolutions('other-account')[phone];
    const mutation = useCreatePeopleOutreachMutation();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'other-account' } } } });
    await expect(mutation.mutateAsync(input)).rejects.toThrow('sesión cambió');
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.invalidateSnapshot).not.toHaveBeenCalled();
    expect(readContactResolutions('mutation-user')[phone]).toBe(beforeA);
    expect(readContactResolutions('other-account')[phone]).toBe(beforeB);
    expect(readImmediateInviteRequest('mutation-user', 'confirmed-invite')).toBeNull();
    expect(readImmediateInviteRequest('other-account', 'confirmed-invite')).toBeNull();
    expect(isContactResolutionWritePending('mutation-user', phone)).toBe(false);
  });

  it('rejects a signed-out hook before any RPC or contact write barrier', async () => {
    mergeContactResolutions('mutation-user', [initial]);
    const before = readContactResolutions('mutation-user')[phone];
    mocks.useSession.mockReturnValue({ userId: null });
    await expect(useCreatePeopleOutreachMutation().mutateAsync(input)).rejects.toThrow(
      'Inicia sesión',
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.idempotency).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.invalidateSnapshot).not.toHaveBeenCalled();
    expect(readContactResolutions('mutation-user')[phone]).toBe(before);
    expect(isContactResolutionWritePending('mutation-user', phone)).toBe(false);
  });

  it('rejects logout after the hook captured its actor without caching an invitation', async () => {
    mergeContactResolutions('mutation-user', [initial]);
    const before = readContactResolutions('mutation-user')[phone];
    const mutation = useCreatePeopleOutreachMutation();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    await expect(mutation.mutateAsync(input)).rejects.toThrow('Inicia sesión');
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(readContactResolutions('mutation-user')[phone]).toBe(before);
    expect(readImmediateInviteRequest('mutation-user', 'confirmed-invite')).toBeNull();
    expect(isContactResolutionWritePending('mutation-user', phone)).toBe(false);
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
