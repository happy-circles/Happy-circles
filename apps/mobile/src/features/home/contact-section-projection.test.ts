import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import { ContactSectionProjection } from './contact-section-projection';
import { actionMetaForResolution, contactResolutionDetail } from './contacts-sheet-helpers';

const matchedUserId = '11111111-1111-4111-8111-111111111111';

function contact(
  index: number,
  alias = `Persona ${String(index).padStart(5, '0')}`,
  phoneE164 = `+57300${String(index).padStart(7, '0')}`,
): ContactCandidate {
  const phone = { id: `phone-${index}`, label: 'mobile', maskedPhone: '***0000', phoneE164 };
  return {
    contactId: `contact-${index}`,
    alias,
    phoneOptions: [phone],
    primaryPhone: phone,
    searchKey: `${alias} ${phoneE164}`.toLocaleLowerCase('es-CO'),
  };
}

function resolution(
  phoneE164: string,
  status: PeopleTargetResolution['status'],
): PeopleTargetResolution {
  return {
    phoneE164,
    status,
    matchedUserId: status === 'active_user' ? matchedUserId : null,
    ...(status === 'active_user' ? { accountMatchConfirmed: true } : {}),
    displayName: null,
    avatarPath: null,
    relationshipId: null,
    friendshipInviteId: null,
    accountInviteId: null,
    accountInviteStatus: null,
  };
}

describe('incremental contact section projection', () => {
  it('corrects one cached positive without rebuilding a 10000-contact list or claiming unknown accounts exist', () => {
    const projection = new ContactSectionProjection();
    const source = Array.from({ length: 10000 }, (_, index) => contact(index));
    let reads = 0;
    const contacts = new Proxy(source, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const phone = source[5000].primaryPhone.phoneE164;
    const cache: Record<string, PeopleTargetResolution> = Object.fromEntries(
      source.map((person) => [
        person.primaryPhone.phoneE164,
        resolution(person.primaryPhone.phoneE164, 'no_account'),
      ]),
    );
    cache[phone] = {
      ...resolution(phone, 'active_user'),
      resolvedAt: Date.now() - 7 * 24 * 60 * 60_000,
      accountMatchConfirmed: false,
    };
    const before = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [],
    });
    expect(before.inAppContacts).toHaveLength(0);
    expect(before.unresolvedContacts).toHaveLength(1);
    expect(actionMetaForResolution(before.unresolvedContacts[0].resolution, false).label).toBe(
      'Invitar',
    );
    expect(contactResolutionDetail('mobile', before.unresolvedContacts[0].resolution)).toBe(
      'mobile | Estado por confirmar',
    );
    const original = new Map(before.inviteContacts.map((row) => [row.contact.contactId, row]));

    reads = 0;
    cache[phone] = resolution(phone, 'no_account');
    const negative = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [phone],
    });
    expect(reads).toBe(0);
    expect(negative.inAppContacts).toHaveLength(0);
    expect(negative.inviteContacts).toHaveLength(10000);
    expect(negative.unresolvedContacts).toHaveLength(0);
    for (const row of negative.inviteContacts) {
      if (row.contact.contactId !== source[5000].contactId)
        expect(row).toBe(original.get(row.contact.contactId));
    }

    reads = 0;
    cache[phone] = resolution(phone, 'active_user');
    const joined = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [phone],
    });
    expect(reads).toBe(0);
    expect(joined.inAppContacts).toHaveLength(1);
    expect(actionMetaForResolution(joined.inAppContacts[0].resolution, false).label).toBe(
      'Agregar',
    );
    expect(joined.inviteContacts).toHaveLength(9999);
    for (const row of joined.inviteContacts) expect(row).toBe(original.get(row.contact.contactId));

    cache[phone] = { ...cache[phone], resolvedAt: 0, accountMatchConfirmed: false };
    const invalidated = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [phone],
    });
    expect(invalidated.inAppContacts).toHaveLength(0);
    expect(invalidated.unresolvedContacts).toHaveLength(1);
    expect(actionMetaForResolution(invalidated.unresolvedContacts[0].resolution, false).label).toBe(
      'Invitar',
    );
    expect(invalidated.inviteContacts).toBe(joined.inviteContacts);
  });

  it('moves one contact in a 10000-row agenda without rebuilding or reading all other contacts', () => {
    const projection = new ContactSectionProjection();
    const source = Array.from({ length: 10000 }, (_, index) => contact(index));
    let contactReads = 0;
    const contacts = new Proxy(source, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) contactReads += 1;
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const cache: Record<string, PeopleTargetResolution> = Object.fromEntries(
      source.map((entry) => [
        entry.primaryPhone.phoneE164,
        resolution(entry.primaryPhone.phoneE164, 'no_account'),
      ]),
    );
    const before = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [],
    });
    const originalRows = new Map(before.inviteContacts.map((row) => [row.contact.contactId, row]));
    const phone = source[5000].primaryPhone.phoneE164;
    cache[phone] = resolution(phone, 'active_user');
    contactReads = 0;
    const after = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [phone],
    });
    expect(contactReads).toBe(0);
    expect(after.inAppContacts).toHaveLength(1);
    expect(after.inviteContacts).toHaveLength(9999);
    expect(after.unresolvedContacts).toBe(before.unresolvedContacts);
    expect(after.inAppContacts[0]).not.toBe(originalRows.get(source[5000].contactId));
    for (const row of after.inviteContacts)
      expect(row).toBe(originalRows.get(row.contact.contactId));
  });

  it('preserves all sections when reopening with unchanged data or only refreshing metadata', () => {
    const projection = new ContactSectionProjection();
    const contacts = [contact(1)];
    const phone = contacts[0].primaryPhone.phoneE164;
    const cache = { [phone]: { ...resolution(phone, 'active_user'), resolvedAt: 100 } };
    const before = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [],
    });
    const reopened = projection.update({
      contacts,
      searchValue: '  ',
      targetCache: cache,
      changedPhones: [],
    });
    expect(reopened).toBe(before);
    const refreshed = projection.update({
      contacts,
      searchValue: '',
      targetCache: { [phone]: { ...cache[phone], resolvedAt: 200, generation: 2 } },
      changedPhones: [phone],
    });
    expect(refreshed).toBe(before);
    expect(refreshed.inAppContacts[0]).toBe(before.inAppContacts[0]);
  });

  it('appends a page in sorted order while preserving old rows and untouched sections', () => {
    const projection = new ContactSectionProjection();
    const contacts = [contact(1, 'Zulu'), contact(2, 'Mango'), contact(3, 'Omega')];
    const added = contact(4, 'Alfa');
    const cache = {
      [contacts[0].primaryPhone.phoneE164]: resolution(
        contacts[0].primaryPhone.phoneE164,
        'no_account',
      ),
      [contacts[1].primaryPhone.phoneE164]: resolution(
        contacts[1].primaryPhone.phoneE164,
        'active_user',
      ),
      [added.primaryPhone.phoneE164]: resolution(added.primaryPhone.phoneE164, 'no_account'),
    };
    const before = projection.update({
      contacts,
      searchValue: '',
      targetCache: cache,
      changedPhones: [],
    });
    const after = projection.update({
      contacts: [...contacts, added],
      searchValue: '',
      targetCache: cache,
      changedPhones: [],
    });
    expect(after.inAppContacts).toBe(before.inAppContacts);
    expect(after.unresolvedContacts).toBe(before.unresolvedContacts);
    expect(after.inviteContacts.map((row) => row.contact.alias)).toEqual(['Alfa', 'Zulu']);
    expect(after.inviteContacts[1]).toBe(before.inviteContacts[0]);
  });

  it('updates every distinct local contact sharing an affected phone, including an appended contact', () => {
    const projection = new ContactSectionProjection();
    const first = contact(1, 'Primero');
    const second = contact(2, 'Segundo', first.primaryPhone.phoneE164);
    const untouched = contact(3, 'Tercero');
    const phone = first.primaryPhone.phoneE164;
    const initial = [first, untouched];
    const cache = { [phone]: resolution(phone, 'no_account') };
    const before = projection.update({
      contacts: initial,
      searchValue: '',
      targetCache: cache,
      changedPhones: [],
    });
    const contacts = [...initial, second];
    projection.update({ contacts, searchValue: '', targetCache: cache, changedPhones: [] });
    const joined = resolution(phone, 'active_user');
    const after = projection.update({
      contacts,
      searchValue: '',
      targetCache: { [phone]: joined },
      changedPhones: [phone],
    });
    expect(after.inAppContacts.map((row) => row.contact.contactId)).toEqual([
      first.contactId,
      second.contactId,
    ]);
    expect(after.inAppContacts.every((row) => row.resolution === joined)).toBe(true);
    expect(after.inviteContacts).toHaveLength(0);
    expect(after.unresolvedContacts).toBe(before.unresolvedContacts);
    expect(after.unresolvedContacts[0]).toBe(before.unresolvedContacts[0]);
  });

  it('updates available actions even when the displayed status does not change', () => {
    const projection = new ContactSectionProjection();
    const contacts = [contact(1)];
    const phone = contacts[0].primaryPhone.phoneE164;
    const previous = { ...resolution(phone, 'pending_friendship'), availableActions: ['cancel'] };
    const before = projection.update({
      contacts,
      searchValue: '',
      targetCache: { [phone]: previous },
      changedPhones: [],
    });
    const next = { ...previous, availableActions: ['cancel', 'remind'] };
    const after = projection.update({
      contacts,
      searchValue: '',
      targetCache: { [phone]: next },
      changedPhones: [phone],
    });
    expect(after.inAppContacts[0]).not.toBe(before.inAppContacts[0]);
    expect(after.inAppContacts[0].resolution?.availableActions).toEqual(['cancel', 'remind']);
  });

  it('rebuilds a changed search from the latest cached states without requiring a network refresh', () => {
    const projection = new ContactSectionProjection();
    const contacts = [contact(1, 'Ana'), contact(2, 'Beatriz')];
    projection.update({ contacts, searchValue: 'ana', targetCache: {}, changedPhones: [] });
    const phone = contacts[1].primaryPhone.phoneE164;
    const after = projection.update({
      contacts,
      searchValue: ' BEATRIZ ',
      targetCache: { [phone]: resolution(phone, 'active_user') },
      changedPhones: [],
    });
    expect(after.inAppContacts.map((row) => row.contact.contactId)).toEqual([
      contacts[1].contactId,
    ]);
    expect(after.unresolvedContacts).toHaveLength(0);
  });
});
