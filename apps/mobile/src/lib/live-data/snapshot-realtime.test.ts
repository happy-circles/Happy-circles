import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactSnapshot } from './snapshot-contact-reconciliation';
import type { ContactResolutionTarget } from '@/lib/contact-resolution-state';

const mocks = vi.hoisted(() => ({
  cleanup: null as (() => void) | null,
  snapshot: undefined as unknown,
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  authChanged: null as
    | ((event: string, session: { user: { id: string }; access_token: string } | null) => void)
    | null,
  invalidateSnapshot: vi.fn(),
  invalidateContacts: vi.fn<(target: ContactResolutionTarget) => void>(),
  setReady: vi.fn(),
  setAuth: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (callback: () => (() => void) | undefined) => {
    mocks.cleanup = callback() ?? null;
  },
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock('../supabase', () => ({
  supabase: {
    channel: () => {
      const channel = {
        on: (
          _type: string,
          { event }: { event: string },
          handler: (event: { payload: unknown }) => void,
        ) => {
          mocks.handlers.set(event, handler);
          return channel;
        },
        subscribe: (callback: (status: string) => void) => {
          callback('SUBSCRIBED');
          return channel;
        },
      };
      return channel;
    },
    realtime: { setAuth: mocks.setAuth },
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'actor' }, access_token: 'fake-token' } },
      }),
      onAuthStateChange: (callback: typeof mocks.authChanged) => {
        mocks.authChanged = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    removeChannel: mocks.removeChannel,
  },
}));
vi.mock('./client', () => ({ invalidateAppSnapshot: mocks.invalidateSnapshot }));
vi.mock('@/lib/query-client', () => ({ queryClient: { getQueryData: () => mocks.snapshot } }));
vi.mock('../contact-resolution-state', () => ({
  invalidateContactResolutions: mocks.invalidateContacts,
  setContactRealtimeReady: mocks.setReady,
}));
vi.mock('@/lib/contact-discovery-runtime', () => ({ disposeContactDiscoveryRuntime: vi.fn() }));
vi.mock('@/features/home/add-person-contact-index', () => ({ clearContactIndexMemory: vi.fn() }));
vi.mock('@/features/home/people-target-resolution-cache', () => ({
  clearPeopleTargetResolutionMemory: vi.fn(),
}));
vi.mock('@/features/home/add-person-contact-scan-cache', () => ({
  clearWarmContactScanCache: vi.fn(),
}));

import { useSnapshotRealtimeBridge } from './snapshot-realtime';

const before: ContactSnapshot = {
  people: [],
  peopleById: {},
  friendshipPendingItems: [],
  friendshipHistoryItems: [],
  accountInvitePendingItems: [],
  accountInviteHistoryItems: [],
};
const after: ContactSnapshot = {
  ...before,
  people: [
    {
      userId: 'new-person',
      displayName: 'Nueva',
      netAmountMinor: 0,
      direction: 'settled',
      pendingCount: 0,
      lastActivityLabel: '',
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.cleanup = null;
  mocks.handlers.clear();
  mocks.authChanged = null;
  mocks.snapshot = before;
  mocks.setAuth.mockResolvedValue(undefined);
  mocks.removeChannel.mockResolvedValue(undefined);
  mocks.invalidateSnapshot.mockImplementation(async () => {
    mocks.snapshot = after;
  });
});
afterEach(() => {
  mocks.cleanup?.();
  vi.useRealTimers();
});

async function mount() {
  useSnapshotRealtimeBridge('actor', true);
  await vi.waitFor(() => expect(mocks.handlers.has('snapshot_changed')).toBe(true));
}
function notify(eventId: string) {
  mocks.handlers.get('snapshot_changed')?.({
    payload: { eventId, kind: 'relationship', sourceItemId: 'new-relation-id' },
  });
}

describe('snapshot bridge reconciliation', () => {
  it('uses the existing debounced refresh once, then scopes a newly discovered relationship to its counterparty', async () => {
    await mount();
    notify('event-one');
    notify('event-two');
    await vi.advanceTimersByTimeAsync(650);
    expect(mocks.invalidateSnapshot).toHaveBeenCalledOnce();
    expect(mocks.invalidateContacts).toHaveBeenCalledWith({
      userId: 'actor',
      matchedUserId: 'new-person',
    });
    expect(
      mocks.invalidateContacts.mock.calls.every(
        ([target]) =>
          target.inviteId ||
          target.relationshipId ||
          target.matchedUserId ||
          target.phoneE164 ||
          target.watchIds,
      ),
    ).toBe(true);
    // Replaying an event ID does not create another refresh or reconciliation.
    notify('event-two');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.invalidateSnapshot).toHaveBeenCalledOnce();
  });

  it('does not invalidate contacts again when a repeated refresh contains the same relationships and requests', async () => {
    await mount();
    notify('first');
    await vi.advanceTimersByTimeAsync(650);
    const reconciliations = () =>
      mocks.invalidateContacts.mock.calls.filter(
        ([target]) => target.matchedUserId === 'new-person',
      );
    expect(reconciliations()).toHaveLength(1);
    mocks.invalidateSnapshot.mockImplementation(async () => {
      mocks.snapshot = { ...after };
    });
    notify('second');
    await vi.advanceTimersByTimeAsync(650);
    expect(reconciliations()).toHaveLength(1);
    expect(mocks.invalidateSnapshot).toHaveBeenCalledTimes(2);
  });

  it.each(['actor-change', 'unmount'])(
    'ignores a refresh completing after %s',
    async (scenario) => {
      let finish!: () => void;
      mocks.invalidateSnapshot.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      await mount();
      notify('pending');
      await vi.advanceTimersByTimeAsync(650);
      if (scenario === 'actor-change')
        mocks.authChanged?.('SIGNED_IN', {
          user: { id: 'another-actor' },
          access_token: 'other-fake-token',
        });
      else {
        mocks.cleanup?.();
        mocks.cleanup = null;
      }
      mocks.snapshot = after;
      finish();
      await Promise.resolve();
      await Promise.resolve();
      expect(mocks.invalidateContacts).not.toHaveBeenCalledWith(
        expect.objectContaining({ matchedUserId: 'new-person' }),
      );
    },
  );
});
