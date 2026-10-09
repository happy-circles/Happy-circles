import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';

const harness = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
  effects: new Map<number, { dependencies: readonly unknown[]; cleanup?: () => void }>(),
  pendingEffects: [] as Array<() => void>,
  contacts: [] as readonly ContactCandidate[],
  render: undefined as (() => void) | undefined,
  onClose: vi.fn(),
  noop: vi.fn(),
}));

vi.mock('react', () => {
  const dependenciesChanged = (before: readonly unknown[], after: readonly unknown[]) =>
    before.length !== after.length ||
    after.some((value, index) => !Object.is(value, before[index]));
  const useEffect = (
    callback: () => (() => void) | undefined,
    dependencies: readonly unknown[],
  ) => {
    const index = harness.cursor++;
    const previous = harness.effects.get(index);
    if (!previous || dependenciesChanged(previous.dependencies, dependencies)) {
      harness.pendingEffects.push(() => {
        previous?.cleanup?.();
        harness.effects.set(index, { dependencies, cleanup: callback() });
      });
    }
  };
  const useMemo = (callback: () => unknown, dependencies: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      | { dependencies: readonly unknown[]; value: unknown }
      | undefined;
    if (!previous || dependenciesChanged(previous.dependencies, dependencies)) {
      harness.slots[index] = { dependencies, value: callback() };
    }
    return (harness.slots[index] as { value: unknown }).value;
  };
  return {
    useEffect,
    useMemo,
    useCallback: (callback: unknown, dependencies: readonly unknown[]) =>
      useMemo(() => callback, dependencies),
    useRef: (current: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current };
      return harness.slots[index];
    },
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) {
        const state = {
          value: initial,
          set: (value: unknown) => {
            state.value =
              typeof value === 'function'
                ? (value as (previous: unknown) => unknown)(state.value)
                : value;
          },
        };
        harness.slots[index] = state;
      }
      const state = harness.slots[index] as { value: unknown; set: (value: unknown) => void };
      return [state.value, state.set];
    },
    useSyncExternalStore: (
      subscribe: (listener: () => void) => () => void,
      getSnapshot: () => unknown,
    ) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { getSnapshot, value: getSnapshot() };
      const slot = harness.slots[index] as { getSnapshot: () => unknown; value: unknown };
      slot.getSnapshot = getSnapshot;
      slot.value = getSnapshot();
      useEffect(
        () =>
          subscribe(() => {
            const next = slot.getSnapshot();
            if (Object.is(next, slot.value)) return;
            slot.value = next;
            // An external store can render immediately before later store subscribers run.
            harness.render?.();
          }),
        [subscribe],
      );
      return slot.value;
    },
  };
});

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));
vi.mock('expo-camera', () => ({ useCameraPermissions: () => [null, harness.noop] }));
vi.mock('expo-router', () => ({ useRouter: () => ({}) }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => true } }));
vi.mock('@/providers/session-provider', () => ({
  useSession: () => ({ userId: 'contacts-sheet-user' }),
}));
vi.mock('@/lib/live-data', () => ({
  useCreateExternalFriendshipInviteMutation: () => ({}),
  useCreatePeopleOutreachMutation: () => ({}),
}));
vi.mock('@/lib/contact-discovery-runtime', () => ({
  setContactDiscoveryKnownPhones: harness.noop,
  setContactDiscoveryVisiblePhones: harness.noop,
}));
vi.mock('./people-target-resolution-cache', () => ({
  loadPeopleTargetResolutionCache: async () => ({}),
}));
vi.mock('./contact-resolution-service', () => ({ resolveContactPhones: async () => [] }));
vi.mock('./use-add-person-contact-list', () => ({
  useAddPersonContactList: () => ({
    contacts: harness.contacts,
    canReadContacts: true,
    contactResolutionWindow: harness.contacts,
    loadContacts: harness.noop,
    setContacts: harness.noop,
    setContactsPermissionStatus: harness.noop,
    setContactsLoading: harness.noop,
    resetContactReadLimit: harness.noop,
  }),
}));
vi.mock('./add-person-contact-permissions', () => ({
  useAddPersonContactPermissionActions: () => ({}),
}));
vi.mock('./add-person-contact-resolution-effects', () => ({
  useAddPersonContactResolutionEffects: harness.noop,
}));
vi.mock('./add-person-outreach-actions', () => ({
  useAddPersonOutreachActions: () => ({ resetPendingContactSelection: harness.noop }),
}));
vi.mock('./add-person-qr-actions', () => ({
  useAddPersonQrActions: () => ({ resetQrStateOnClose: harness.noop }),
}));

import { useAddPersonContactsSheetController } from './add-person-contacts-sheet-controller';
import { actionMetaForResolution, contactResolutionDetail } from './contacts-sheet-helpers';
import { contactResolutionForOutreach } from '@/lib/live-data/mutations/people-outreach-confirmation';
import {
  clearContactResolutionUser,
  mergeContactResolutions,
} from '@/lib/contact-resolution-state';

const userId = 'contacts-sheet-user';
const phoneE164 = '+573001234567';
const phone = { id: 'phone', phoneE164, label: null, maskedPhone: '***4567' };
const contacts: readonly ContactCandidate[] = [
  { contactId: 'ana', alias: 'Ana', primaryPhone: phone, phoneOptions: [phone], searchKey: 'ana' },
];
const active: PeopleTargetResolution = {
  phoneE164,
  status: 'active_user',
  matchedUserId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Ana',
  avatarPath: null,
  relationshipId: null,
  friendshipInviteId: null,
  accountInviteId: null,
  accountInviteStatus: null,
};

let current: ReturnType<typeof useAddPersonContactsSheetController>;
function render() {
  harness.cursor = 0;
  current = useAddPersonContactsSheetController({ onClose: harness.onClose, visible: true });
  for (const effect of harness.pendingEffects.splice(0)) effect();
}
beforeEach(() => {
  harness.cursor = 0;
  harness.slots = [];
  harness.effects.clear();
  harness.pendingEffects = [];
  harness.contacts = contacts;
  harness.render = undefined;
  clearContactResolutionUser(userId);
  mergeContactResolutions(userId, [active]);
  render();
  render();
  harness.render = render;
});
afterEach(() => {
  harness.render = undefined;
  for (const effect of harness.effects.values()) effect.cleanup?.();
  clearContactResolutionUser(userId);
});

describe('contact request presentation after outreach', () => {
  it('shows the sent request on the first external store render, without an additional local update', () => {
    expect(actionMetaForResolution(current.inAppContacts[0].resolution, false).label).toBe(
      'Agregar',
    );
    const confirmed = contactResolutionForOutreach(
      phoneE164,
      {
        kind: 'friendship',
        status: 'active_user',
        matchedUserId: active.matchedUserId,
        displayName: 'Ana',
        inviteId: 'sent-request',
        friendshipDirection: 'outgoing',
        result: {
          inviteId: 'sent-request',
          status: 'pending_recipient',
          created: true,
          friendshipDirection: 'outgoing',
        },
      },
      active,
    );

    mergeContactResolutions(userId, [confirmed]);

    expect(current.inAppContacts[0].resolution).toMatchObject({
      status: 'pending_friendship',
      friendshipInviteId: 'sent-request',
    });
    expect(actionMetaForResolution(current.inAppContacts[0].resolution, false).label).toBe(
      'Ver solicitud',
    );
    expect(contactResolutionDetail('mobile', current.inAppContacts[0].resolution)).toBe(
      'mobile | Solicitud pendiente',
    );
    render();
    expect(actionMetaForResolution(current.inAppContacts[0].resolution, false).label).toBe(
      'Ver solicitud',
    );
  });
});
