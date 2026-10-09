import { describe, expect, it } from 'vitest';
import type { ViewToken } from 'react-native';
import type { EnrichedContact } from './contacts-sheet-helpers';
import {
  buildContactListSections,
  getViewableContacts,
  type ContactListSection,
} from './contact-list-sections';

function row(id: string): EnrichedContact {
  const phone = {
    id: `${id}-phone`,
    label: 'mobile',
    maskedPhone: '***0000',
    phoneE164: '+573000000000',
  };
  return {
    contact: {
      contactId: id,
      alias: id,
      phoneOptions: [phone],
      primaryPhone: phone,
      searchKey: id,
    },
    resolution: null,
  };
}

describe('contact SectionList keys', () => {
  it('accepts header and footer viewability tokens containing the section instead of a contact', () => {
    const sections = buildContactListSections({
      inAppContacts: [row('friend')],
      unresolvedContacts: [row('unknown')],
      inviteContacts: [row('invite')],
    });
    for (const section of sections) {
      // Stable sections convert boundary tokens with a null index.
      for (const boundary of ['header', 'footer']) {
        expect(section.keyExtractor(section, null), boundary).toBe(section.key);
      }
      expect(section.keyExtractor(section.data[0], 0)).toBe(section.data[0].contact.contactId);
    }
  });

  it('preserves old token identities when async regrouping changes a boundary into a row', () => {
    const alice = row('alice');
    const bob = row('bob');
    const oldSections = buildContactListSections({
      inAppContacts: [],
      unresolvedContacts: [alice, bob, row('charlie')],
      inviteContacts: [],
    });
    const nextSections = buildContactListSections({
      inAppContacts: [alice],
      unresolvedContacts: [bob, row('charlie')],
      inviteContacts: [],
    });
    // RN retains the old footer at flat index 4, now the first unresolved row.
    expect(nextSections[1].keyExtractor(oldSections[0], 0)).toBe('unresolved');
    // The old header at flat index 0 is now another section's header.
    expect(nextSections[0].keyExtractor(oldSections[0], null)).toBe('unresolved');
    // The old second row at flat index 2 is now the first section's footer.
    expect(nextSections[0].keyExtractor(bob, null)).toBe('bob');
  });

  it('sends only actual visible contact payloads to discovery during regrouping', () => {
    const alice = row('alice');
    const [oldSection] = buildContactListSections({
      inAppContacts: [],
      unresolvedContacts: [alice],
      inviteContacts: [],
    });
    const token = (
      item: EnrichedContact | ContactListSection | null,
      index: number | null,
      isViewable = true,
    ): ViewToken<EnrichedContact | ContactListSection | null> => ({
      item,
      index,
      isViewable,
      key: 'test-token',
    });
    expect(
      getViewableContacts([
        token(oldSection, null),
        token(oldSection, 0),
        token(alice, null),
        token(alice, 0, false),
        token(null, 0),
        token(alice, 0),
      ]),
    ).toEqual([alice.contact]);
  });

  it('keeps contact IDs and section identities stable as positions and groups change', () => {
    const alice = row('alice');
    const bob = row('bob');
    const before = buildContactListSections({
      inAppContacts: [],
      unresolvedContacts: [alice, bob],
      inviteContacts: [],
    });
    const reordered = buildContactListSections({
      inAppContacts: [row('friend')],
      unresolvedContacts: [bob, alice],
      inviteContacts: [],
    });
    const moved = buildContactListSections({
      inAppContacts: [],
      unresolvedContacts: [bob],
      inviteContacts: [alice],
    });

    expect(before[0].key).toBe(reordered[1].key);
    expect(before[0].keyExtractor(alice, 0)).toBe('alice');
    expect(reordered[1].keyExtractor(alice, 1)).toBe('alice');
    expect(moved[1].keyExtractor(alice, 0)).toBe('alice');
    expect(new Set(reordered.map((section) => section.key)).size).toBe(reordered.length);
  });

  it('reuses row arrays and objects and omits empty sections', () => {
    const contacts = [row('alice')];
    const sections = buildContactListSections({
      inAppContacts: [],
      unresolvedContacts: contacts,
      inviteContacts: [],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('unresolved');
    expect(sections[0].data).toBe(contacts);
    expect(sections[0].data[0]).toBe(contacts[0]);
    expect(
      buildContactListSections({ inAppContacts: [], unresolvedContacts: [], inviteContacts: [] }),
    ).toEqual([]);
  });

  it('keeps malformed contact rows strict without fallback keys', () => {
    const [section] = buildContactListSections({
      inAppContacts: [],
      unresolvedContacts: [row('alice')],
      inviteContacts: [],
    });
    expect(() => section.keyExtractor({} as EnrichedContact, 0)).toThrow(TypeError);
  });
});
