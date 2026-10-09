import type { SectionListData, ViewToken } from 'react-native';
import type { ContactSections } from './contact-section-projection';
import type { EnrichedContact } from './contacts-sheet-helpers';

type ContactSectionKey = 'in-app' | 'unresolved' | 'invite';

export type ContactListSection = {
  readonly key: ContactSectionKey;
  readonly title: string;
  readonly data: readonly EnrichedContact[];
  readonly keyExtractor: (
    item: EnrichedContact | ContactListSection,
    index: number | null,
  ) => string;
};

function section(
  key: ContactSectionKey,
  title: string,
  data: readonly EnrichedContact[],
): ContactListSection {
  return {
    key,
    title,
    data,
    keyExtractor(item: EnrichedContact | ContactListSection) {
      // RN can convert a previous token against new sections after async regrouping.
      // Its payload keeps the old identity even when the converted index changes.
      if ('data' in item) return item.key;
      return item.contact.contactId;
    },
  } satisfies SectionListData<EnrichedContact>;
}

export function getViewableContacts(
  tokens: readonly ViewToken<EnrichedContact | ContactListSection | null>[],
): EnrichedContact['contact'][] {
  const contacts: EnrichedContact['contact'][] = [];
  for (const token of tokens) {
    if (token.isViewable && token.index != null && token.item != null && 'contact' in token.item) {
      contacts.push(token.item.contact);
    }
  }
  return contacts;
}

export function buildContactListSections(contacts: ContactSections): ContactListSection[] {
  return [
    section('in-app', 'En Happy Circles', contacts.inAppContacts),
    section('unresolved', 'Agregar a Happy Circles', contacts.unresolvedContacts),
    section('invite', 'Invitar a Happy Circles', contacts.inviteContacts),
  ].filter((entry) => entry.data.length > 0);
}
