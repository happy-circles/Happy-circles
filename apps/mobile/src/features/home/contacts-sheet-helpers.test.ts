import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256',
  },
  digestStringAsync: vi.fn(async (_algorithm: string, value: string) => `hash:${value}`),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(),
}));

import type { PeopleTargetResolution } from '@/lib/live-data';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import {
  actionMetaForResolution,
  buildContactSectionItems,
  chunkContactPhoneE164List,
  CONTACT_TARGET_RESOLUTION_LIMIT,
  filterReusableContactResolutionCache,
  getUnresolvedContactPhoneE164List,
  isReusableCachedContactResolution,
} from './contacts-sheet-helpers';
import {
  createPeopleTargetResolutionCacheHashSource,
  isPeopleTargetResolutionCacheEntryFresh,
  restorePhoneOnPeopleTargetResolution,
  stripPhoneFromPeopleTargetResolution,
} from './people-target-resolution-cache';

function contact(index: number): ContactCandidate {
  const suffix = String(index).padStart(3, '0');
  const phoneE164 = `+57300${suffix}000`;

  return {
    alias: `Persona ${suffix}`,
    contactId: `contact-${suffix}`,
    phoneOptions: [
      {
        id: `phone-${suffix}`,
        label: 'mobile',
        maskedPhone: `***${suffix}`,
        phoneE164,
      },
    ],
    primaryPhone: {
      id: `phone-${suffix}`,
      label: 'mobile',
      maskedPhone: `***${suffix}`,
      phoneE164,
    },
    searchKey: `persona ${suffix} ${phoneE164}`.toLocaleLowerCase('es-CO'),
  };
}

function multiPhoneContact(index: number): ContactCandidate {
  const baseContact = contact(index);
  const suffix = String(index).padStart(3, '0');
  const secondaryPhone = {
    id: `phone-${suffix}-secondary`,
    label: 'work',
    maskedPhone: `***${suffix}`,
    phoneE164: `+57300${suffix}111`,
  };

  return {
    ...baseContact,
    phoneOptions: [baseContact.primaryPhone, secondaryPhone],
    searchKey: `${baseContact.searchKey} ${secondaryPhone.phoneE164}`.toLocaleLowerCase('es-CO'),
  };
}

function resolution(
  phoneE164: string,
  status: PeopleTargetResolution['status'],
): PeopleTargetResolution {
  return {
    accountInviteId: null,
    accountInviteStatus: null,
    avatarPath: null,
    displayName: null,
    friendshipInviteId: null,
    matchedUserId: null,
    phoneE164,
    relationshipId: null,
    status,
  };
}

describe('contact resolution queue helpers', () => {
  it('chunks phone batches at the backend limit', () => {
    const phones = Array.from(
      { length: CONTACT_TARGET_RESOLUTION_LIMIT + 1 },
      (_, index) => `+57300${index}`,
    );

    expect(chunkContactPhoneE164List(phones).map((chunk) => chunk.length)).toEqual([
      CONTACT_TARGET_RESOLUTION_LIMIT,
      1,
    ]);
  });

  it('deduplicates phones and skips cached, pending, and in-flight entries', () => {
    expect(
      getUnresolvedContactPhoneE164List({
        inFlightPhoneE164Set: new Set(['+573004']),
        pendingPhoneE164Set: new Set(['+573003']),
        phoneE164List: ['+573001', '+573002', '+573002', '+573003', '+573004'],
        targetCache: {
          '+573001': resolution('+573001', 'active_user'),
        },
      }),
    ).toEqual(['+573002']);
  });

  it('reuses contact resolutions from warm caches', () => {
    const cachedActive = resolution('+573001', 'active_user');
    const cachedRelated = resolution('+573002', 'already_related');
    const cachedPendingActivation = resolution('+573003', 'pending_activation');
    const cachedPendingFriendship = resolution('+573004', 'pending_friendship');
    const cachedNoAccount = resolution('+573005', 'no_account');

    expect(isReusableCachedContactResolution(cachedActive)).toBe(true);
    expect(isReusableCachedContactResolution(cachedRelated)).toBe(true);
    expect(isReusableCachedContactResolution(cachedPendingActivation)).toBe(true);
    expect(isReusableCachedContactResolution(cachedPendingFriendship)).toBe(true);
    expect(isReusableCachedContactResolution(cachedNoAccount)).toBe(true);

    expect(
      filterReusableContactResolutionCache({
        [cachedActive.phoneE164]: cachedActive,
        [cachedRelated.phoneE164]: cachedRelated,
        [cachedPendingActivation.phoneE164]: cachedPendingActivation,
        [cachedPendingFriendship.phoneE164]: cachedPendingFriendship,
        [cachedNoAccount.phoneE164]: cachedNoAccount,
      }),
    ).toEqual({
      [cachedActive.phoneE164]: cachedActive,
      [cachedRelated.phoneE164]: cachedRelated,
      [cachedPendingActivation.phoneE164]: cachedPendingActivation,
      [cachedPendingFriendship.phoneE164]: cachedPendingFriendship,
      [cachedNoAccount.phoneE164]: cachedNoAccount,
    });
  });
});

describe('contact section helpers', () => {
  it('keeps add-person actions explicit for unresolved, multiple-number, and invite contacts', () => {
    expect(actionMetaForResolution(null, false)).toEqual({
      disabled: false,
      icon: 'search-outline',
      label: 'Consultar',
      tone: 'primary',
    });
    expect(actionMetaForResolution(null, true)).toEqual({
      disabled: false,
      icon: 'search-outline',
      label: 'Consultar',
      tone: 'primary',
    });
    expect(actionMetaForResolution(resolution('+573004', 'active_user'), true)).toEqual({
      disabled: false,
      icon: 'list-outline',
      label: 'Elegir',
      tone: 'primary',
    });
    expect(actionMetaForResolution(resolution('+573005', 'no_account'), false)).toEqual({
      disabled: false,
      icon: 'paper-plane-outline',
      label: 'Invitar',
      tone: 'invite',
    });
  });

  it('surfaces Happy Circles contacts resolved outside the first backend window', () => {
    const contacts = Array.from({ length: CONTACT_TARGET_RESOLUTION_LIMIT + 5 }, (_, index) =>
      contact(index),
    );
    const outsideFirstWindow = contacts.at(-1);
    expect(outsideFirstWindow).toBeDefined();

    const sections = buildContactSectionItems({
      contacts,
      searchValue: '',
      targetCache: {
        [outsideFirstWindow!.primaryPhone.phoneE164]: resolution(
          outsideFirstWindow!.primaryPhone.phoneE164,
          'active_user',
        ),
      },
    });

    expect(sections.visibleResolutionContacts).toHaveLength(CONTACT_TARGET_RESOLUTION_LIMIT);
    expect(sections.inAppContacts.map((item) => item.contact.contactId)).toContain(
      outsideFirstWindow!.contactId,
    );
  });

  it('keeps unresolved contacts separate from confirmed invite contacts', () => {
    const contacts = [contact(1), contact(2), contact(3)];
    const sections = buildContactSectionItems({
      contacts,
      searchValue: '',
      targetCache: {
        [contacts[1].primaryPhone.phoneE164]: resolution(
          contacts[1].primaryPhone.phoneE164,
          'no_account',
        ),
        [contacts[2].primaryPhone.phoneE164]: resolution(
          contacts[2].primaryPhone.phoneE164,
          'active_user',
        ),
      },
    });

    expect(sections.unresolvedContacts.map((item) => item.contact.alias)).toEqual(['Persona 001']);
    expect(sections.inviteContacts.map((item) => item.contact.alias)).toEqual(['Persona 002']);
    expect(sections.inAppContacts.map((item) => item.contact.alias)).toEqual(['Persona 003']);
  });

  it('keeps a contact in Happy Circles when the matching phone is secondary', () => {
    const multiContact = multiPhoneContact(4);
    const secondaryPhone = multiContact.phoneOptions[1];
    expect(secondaryPhone).toBeDefined();

    const sections = buildContactSectionItems({
      contacts: [multiContact],
      searchValue: '',
      targetCache: {
        [multiContact.primaryPhone.phoneE164]: resolution(
          multiContact.primaryPhone.phoneE164,
          'no_account',
        ),
        [secondaryPhone!.phoneE164]: resolution(secondaryPhone!.phoneE164, 'active_user'),
      },
    });

    expect(sections.inAppContacts).toHaveLength(1);
    expect(sections.inAppContacts[0].resolution?.phoneE164).toBe(secondaryPhone!.phoneE164);
    expect(sections.unresolvedContacts).toHaveLength(0);
    expect(sections.inviteContacts).toHaveLength(0);
  });

  it('does not invite a multi-phone contact until every phone has been checked', () => {
    const multiContact = multiPhoneContact(5);
    const sections = buildContactSectionItems({
      contacts: [multiContact],
      searchValue: '',
      targetCache: {
        [multiContact.primaryPhone.phoneE164]: resolution(
          multiContact.primaryPhone.phoneE164,
          'no_account',
        ),
      },
    });

    expect(sections.unresolvedContacts.map((item) => item.contact.alias)).toEqual(['Persona 005']);
    expect(sections.inviteContacts).toHaveLength(0);
  });

  it('moves a multi-phone contact to invite only when all phones are not in Happy Circles', () => {
    const multiContact = multiPhoneContact(6);
    const secondaryPhone = multiContact.phoneOptions[1];
    expect(secondaryPhone).toBeDefined();

    const sections = buildContactSectionItems({
      contacts: [multiContact],
      searchValue: '',
      targetCache: {
        [multiContact.primaryPhone.phoneE164]: resolution(
          multiContact.primaryPhone.phoneE164,
          'no_account',
        ),
        [secondaryPhone!.phoneE164]: resolution(secondaryPhone!.phoneE164, 'no_account'),
      },
    });

    expect(sections.inviteContacts.map((item) => item.contact.alias)).toEqual(['Persona 006']);
    expect(sections.unresolvedContacts).toHaveLength(0);
  });

  it('filters both sections by active search', () => {
    const contacts = [contact(1), contact(64)];
    const sections = buildContactSectionItems({
      contacts,
      searchValue: '064',
      targetCache: {
        [contacts[1].primaryPhone.phoneE164]: resolution(
          contacts[1].primaryPhone.phoneE164,
          'active_user',
        ),
      },
    });

    expect(sections.inAppContacts.map((item) => item.contact.alias)).toEqual(['Persona 064']);
    expect(sections.unresolvedContacts).toHaveLength(0);
    expect(sections.inviteContacts).toHaveLength(0);
  });
});

describe('people target resolution cache helpers', () => {
  it('scopes cache keys by user and strips phone numbers from stored payloads', () => {
    const original = resolution('+573001234567', 'pending_friendship');
    const stored = stripPhoneFromPeopleTargetResolution(original);

    expect(
      createPeopleTargetResolutionCacheHashSource({
        phoneE164: original.phoneE164,
        userId: 'user-a',
      }),
    ).toBe('user-a:+573001234567');
    expect('phoneE164' in stored).toBe(false);
    expect(
      restorePhoneOnPeopleTargetResolution({
        phoneE164: original.phoneE164,
        storedResolution: stored,
      }),
    ).toEqual(original);
  });

  it('uses status-specific freshness windows', () => {
    const now = Date.parse('2026-05-06T12:00:00.000Z');

    expect(
      isPeopleTargetResolutionCacheEntryFresh({
        now,
        resolvedAt: now - 23 * 60 * 60 * 1000,
        status: 'active_user',
      }),
    ).toBe(true);
    expect(
      isPeopleTargetResolutionCacheEntryFresh({
        now,
        resolvedAt: now - 29 * 24 * 60 * 60 * 1000,
        status: 'already_related',
      }),
    ).toBe(true);
    expect(
      isPeopleTargetResolutionCacheEntryFresh({
        now,
        resolvedAt: now - 31 * 24 * 60 * 60 * 1000,
        status: 'already_related',
      }),
    ).toBe(false);
    expect(
      isPeopleTargetResolutionCacheEntryFresh({
        now,
        resolvedAt: now - 29 * 24 * 60 * 60 * 1000,
        status: 'no_account',
      }),
    ).toBe(true);
    expect(
      isPeopleTargetResolutionCacheEntryFresh({
        now,
        resolvedAt: now - 31 * 24 * 60 * 60 * 1000,
        status: 'no_account',
      }),
    ).toBe(false);
    expect(
      isPeopleTargetResolutionCacheEntryFresh({
        now,
        resolvedAt: now - 10 * 60 * 1000,
        status: 'pending_friendship',
      }),
    ).toBe(true);
    expect(
      isPeopleTargetResolutionCacheEntryFresh({
        now,
        resolvedAt: now - 20 * 60 * 1000,
        status: 'pending_activation',
      }),
    ).toBe(false);
  });
});
