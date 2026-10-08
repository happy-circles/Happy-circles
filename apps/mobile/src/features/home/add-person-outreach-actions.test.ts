import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'expo-router';
import type { PeopleOutreachResult, PeopleTargetResolution } from '@/lib/live-data/types-runtime';

const mocks = vi.hoisted(() => ({
  feedback: vi.fn(),
  navigate: vi.fn(),
  share: vi.fn(),
  validateDelivery: vi.fn(),
  blocked: vi.fn(),
  clipboard: vi.fn(),
  stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
}));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    mocks.stateSetters.push(setter);
    return [initial, setter];
  },
}));
vi.mock('react-native', () => ({
  Share: { share: mocks.share, dismissedAction: 'dismissedAction' },
}));
vi.mock('expo-clipboard', () => ({ setStringAsync: mocks.clipboard }));
vi.mock('@/features/home/contacts-sheet-helpers', () => ({ compareEnrichedContacts: () => 0 }));
vi.mock('@/features/invites/people-outreach-utils', () => ({
  buildAppInviteLink: (token: string) => `invite:${token}`,
  buildAccountInviteShareMessage: ({ inviteLink }: { inviteLink: string }) => inviteLink,
  isAccountInviteDeliveryResult: (result: unknown) =>
    Boolean(result && typeof result === 'object' && 'deliveryToken' in result),
}));
vi.mock('@/features/invites/invite-delivery-validation', () => ({
  assertAccountDeliveryCurrent: mocks.validateDelivery,
}));
vi.mock('@/lib/global-feedback', () => ({ showGlobalFeedback: mocks.feedback }));
vi.mock('@/lib/navigation', () => ({ pushRoute: mocks.navigate }));
vi.mock('@/lib/action-feedback', () => ({ showBlockedActionAlert: mocks.blocked }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => ({ userId: 'action-user' }) }));

import { useAddPersonOutreachActions } from './add-person-outreach-actions';
import {
  clearContactResolutionUser,
  mergeContactResolutions,
} from '@/lib/contact-resolution-state';

const phone = '+573001234567';
const command = { alias: 'Ana', phoneE164: phone, sourceContext: 'home_add_contact_list' };
const response: PeopleOutreachResult = {
  kind: 'friendship',
  status: 'active_user',
  matchedUserId: 'ana',
  displayName: 'Ana',
  inviteId: 'outgoing-invite',
  friendshipDirection: 'outgoing',
  result: {
    inviteId: 'outgoing-invite',
    status: 'pending_recipient',
    created: true,
    friendshipDirection: 'outgoing',
  },
};
const pending: PeopleTargetResolution = {
  phoneE164: phone,
  status: 'pending_friendship',
  matchedUserId: 'ana',
  displayName: 'Ana',
  avatarPath: null,
  relationshipId: null,
  friendshipInviteId: 'cached-invite',
  friendshipDirection: 'incoming',
  accountInviteId: null,
  accountInviteStatus: null,
};

function actionsFor(result = response, cached?: PeopleTargetResolution) {
  const mutateAsync = vi.fn().mockResolvedValue(result);
  const resolver = vi.fn();
  const ensurePhoneStatuses = vi.fn();
  const setBusyKey = vi.fn();
  return {
    mutateAsync,
    resolver,
    ensurePhoneStatuses,
    setBusyKey,
    actions: useAddPersonOutreachActions({
      onClose: vi.fn(),
      busyKey: null,
      createPeopleOutreach: { mutateAsync },
      ensurePhoneStatuses,
      resolvePhoneStatusesNow: resolver,
      router: {} as Router,
      setBusyKey,
      setMessage: vi.fn(),
      targetCache: cached ? { [phone]: cached } : {},
    }),
  };
}

beforeEach(() => {
  clearContactResolutionUser('action-user');
  vi.clearAllMocks();
  mocks.stateSetters = [];
  mocks.validateDelivery.mockResolvedValue(undefined);
  mocks.share.mockResolvedValue({ action: 'sharedAction' });
});

describe('contact outreach command', () => {
  it('sends once without resolver round trips or a feedback timer holding busy', async () => {
    vi.useFakeTimers();
    try {
      const { actions, mutateAsync, resolver, ensurePhoneStatuses, setBusyKey } = actionsFor();
      await actions.handleCreateOutreach(command);
      expect(mutateAsync).toHaveBeenCalledOnce();
      expect(resolver).not.toHaveBeenCalled();
      expect(ensurePhoneStatuses).not.toHaveBeenCalled();
      expect(setBusyKey.mock.calls).toEqual([[phone], [null]]);
      expect(mocks.stateSetters[1].mock.calls).toEqual([[null]]);
      expect(vi.getTimerCount()).toBe(0);
      expect(mocks.feedback).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Solicitud enviada' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a cached received request directly, without preparing another send', async () => {
    const { actions, mutateAsync, resolver, setBusyKey } = actionsFor(response, pending);
    await actions.handleCreateOutreach(command);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
    expect(setBusyKey).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith(expect.anything(), {
      pathname: '/people',
      params: { requests: '1', requestId: 'cached-invite', requestTab: 'received' },
    });
  });

  it('offers multiple phone choices from local data without starting an outreach preflight', async () => {
    const { actions, mutateAsync, resolver, ensurePhoneStatuses } = actionsFor();
    const primaryPhone = {
      id: 'primary',
      phoneE164: phone,
      label: 'Móvil',
      maskedPhone: '***4567',
    };
    await actions.handleContactPress({
      alias: 'Ana',
      contactId: 'ana-contact',
      searchKey: 'ana',
      primaryPhone,
      phoneOptions: [primaryPhone, { ...primaryPhone, id: 'other', phoneE164: '+573009876543' }],
    });
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
    expect(ensurePhoneStatuses).not.toHaveBeenCalled();
  });

  it('handles an incoming request created during the race as received, without claiming a send', async () => {
    const incoming: PeopleOutreachResult = {
      ...response,
      status: 'pending_friendship',
      inviteId: 'incoming-race',
      friendshipDirection: 'incoming',
      result: {
        inviteId: 'incoming-race',
        status: 'pending_recipient',
        created: false,
        friendshipDirection: 'incoming',
      },
    };
    const { actions, mutateAsync } = actionsFor(incoming);
    await actions.handleCreateOutreach(command);
    expect(mutateAsync).toHaveBeenCalledOnce();
    expect(mocks.feedback).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Solicitud pendiente', tone: 'neutral' }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        params: { requests: '1', requestId: 'incoming-race', requestTab: 'received' },
      }),
    );
  });

  it('keeps current-delivery validation before exposing an account access token', async () => {
    const account: PeopleOutreachResult = {
      kind: 'account_invite',
      status: 'no_account',
      matchedUserId: null,
      displayName: null,
      result: {
        inviteId: 'account',
        deliveryId: 'delivery',
        deliveryToken: 'private-token',
        status: 'pending_activation',
        channel: 'remote',
        originChannel: 'remote',
        expiresAt: 'future',
        inviteExpiresAt: 'future',
        intendedRecipientAlias: 'Ana',
        intendedRecipientPhoneE164: phone,
        intendedRecipientPhoneLabel: null,
      },
    };
    mocks.validateDelivery.mockRejectedValue(new Error('El acceso fue revocado.'));
    const { actions } = actionsFor(account);
    await actions.handleCreateOutreach(command);
    expect(mocks.validateDelivery).toHaveBeenCalledOnce();
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(mocks.blocked).toHaveBeenCalledWith('El acceso fue revocado.', expect.anything());
  });

  it('does not reopen a stale pending response after a newer local accepted event', async () => {
    const { actions, mutateAsync } = actionsFor({
      ...response,
      status: 'pending_friendship',
      result: { inviteId: 'outgoing-invite', status: 'pending_recipient', created: false },
    });
    mutateAsync.mockImplementation(async () => {
      mergeContactResolutions('action-user', [
        { ...pending, status: 'already_related', friendshipInviteId: null },
      ]);
      return {
        ...response,
        status: 'pending_friendship',
        result: { inviteId: 'outgoing-invite', status: 'pending_recipient', created: false },
      };
    });
    await actions.handleCreateOutreach(command);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.feedback).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Contacto actualizado', tone: 'neutral' }),
    );
  });

  it('ignores a repeated tap while the command is in flight', async () => {
    const { actions, mutateAsync } = actionsFor();
    let finish!: (result: PeopleOutreachResult) => void;
    mutateAsync.mockImplementation(
      () =>
        new Promise<PeopleOutreachResult>((resolve) => {
          finish = resolve;
        }),
    );
    const first = actions.handleCreateOutreach(command);
    await actions.handleCreateOutreach(command);
    expect(mutateAsync).toHaveBeenCalledOnce();
    finish(response);
    await first;
  });
});
