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
  getSession: vi.fn(),
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
vi.mock('@/lib/live-data/client', () => ({
  assertSupabaseClient: () => ({ auth: { getSession: mocks.getSession } }),
}));

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
    expiresAt: '2099-01-01T00:00:00Z',
    inviteExpiresAt: '2099-01-01T00:00:00Z',
    intendedRecipientAlias: 'Ana',
    intendedRecipientPhoneE164: phone,
    intendedRecipientPhoneLabel: null,
  },
};
function currentAccount(): PeopleOutreachResult {
  return {
    ...account,
    deliveryValidation: {
      status: 'current',
      ownerUserId: 'action-user',
      phoneE164: phone,
      inviteId: 'account',
      deliveryId: 'delivery',
      channel: 'remote',
      deliveryStatus: 'issued',
      validatedAt: new Date().toISOString(),
      expiresAt: '2099-01-01T00:00:00Z',
      inviteExpiresAt: '2099-01-01T00:00:00Z',
    },
  };
}

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
  mocks.getSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: 'action-user' } } },
    error: null,
  });
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
      expect(mocks.stateSetters[1].mock.calls).toEqual([
        [{ alias: 'Ana', mode: 'prepare', variant: 'loading' }],
        [null],
      ]);
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
    mocks.validateDelivery.mockRejectedValue(new Error('El acceso fue revocado.'));
    const { actions } = actionsFor(account);
    await actions.handleCreateOutreach(command);
    expect(mocks.validateDelivery).toHaveBeenCalledOnce();
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(mocks.blocked).toHaveBeenCalledWith('El acceso fue revocado.', expect.anything());
  });

  it('ends sending before opening share, without a loading overlay behind it or another request, and keeps double-tap protection', async () => {
    const { actions, mutateAsync, setBusyKey } = actionsFor(currentAccount());
    let started!: () => void;
    const shareStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: (result: { action: string }) => void;
    mocks.share.mockImplementation(() => {
      expect(setBusyKey).toHaveBeenLastCalledWith(null);
      expect(mocks.stateSetters[1]).toHaveBeenLastCalledWith(null);
      started();
      return new Promise<{ action: string }>((resolve) => {
        finish = resolve;
      });
    });
    const sending = actions.handleCreateOutreach(command);
    await shareStarted;
    expect(mocks.validateDelivery).not.toHaveBeenCalled();
    await actions.handleCreateOutreach(command);
    expect(mutateAsync).toHaveBeenCalledOnce();
    finish({ action: 'dismissedAction' });
    await sending;
    expect(setBusyKey.mock.calls).toEqual([[phone], [null]]);
    expect(mocks.feedback).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Acceso listo', tone: 'neutral' }),
    );
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });

  it('keeps sending until a legacy preview finishes, then releases it before sharing', async () => {
    const { actions, setBusyKey } = actionsFor(account);
    let started!: () => void;
    const previewStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finish!: () => void;
    mocks.validateDelivery.mockImplementation(() => {
      started();
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    mocks.share.mockImplementation(async () => {
      expect(setBusyKey).toHaveBeenLastCalledWith(null);
      return { action: 'sharedAction' };
    });
    const sending = actions.handleCreateOutreach(command);
    await previewStarted;
    expect(setBusyKey).toHaveBeenLastCalledWith(phone);
    expect(mocks.stateSetters[1]).toHaveBeenLastCalledWith({
      alias: 'Ana',
      mode: 'prepare',
      variant: 'loading',
    });
    expect(mocks.share).not.toHaveBeenCalled();
    finish();
    await sending;
    expect(mocks.validateDelivery).toHaveBeenCalledOnce();
    expect(mocks.share).toHaveBeenCalledOnce();
  });

  it('copies the ready link if the system share sheet cannot open', async () => {
    const { actions, setBusyKey } = actionsFor(currentAccount());
    mocks.share.mockRejectedValue(new Error('Share unavailable'));
    await actions.handleCreateOutreach(command);
    expect(mocks.validateDelivery).not.toHaveBeenCalled();
    expect(mocks.clipboard).toHaveBeenCalledExactlyOnceWith('invite:private-token');
    expect(setBusyKey.mock.calls).toEqual([[phone], [null]]);
    expect(mocks.feedback).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Enlace copiado' }),
    );
  });

  it('does not expose a ready link when the active account changed after creation', async () => {
    const { actions } = actionsFor(currentAccount());
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'new-account' } } },
      error: null,
    });
    await actions.handleCreateOutreach(command);
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(mocks.blocked).toHaveBeenCalledWith(
      expect.stringContaining('sesión cambió'),
      expect.anything(),
    );
  });

  it('does not copy the previous account link after logout while share was pending', async () => {
    const { actions } = actionsFor(currentAccount());
    mocks.share.mockImplementation(async () => {
      mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
      throw new Error('Share dismissed by logout');
    });
    await actions.handleCreateOutreach(command);
    expect(mocks.share).toHaveBeenCalledOnce();
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(mocks.feedback).not.toHaveBeenCalled();
    expect(mocks.blocked).toHaveBeenCalledWith(
      expect.stringContaining('sesión cambió'),
      expect.anything(),
    );
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
