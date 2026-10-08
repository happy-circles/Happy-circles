import type { SectionListData } from 'react-native';
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
    keyExtractor(item: EnrichedContact | ContactListSection, index: number | null) {
      // VirtualizedSectionList sends the section itself with a null index for header/footer tokens.
      if (index === null) return key;
      if ('data' in item) throw new Error('A contact row cannot be a section token.');
      return item.contact.contactId;
    },
  } satisfies SectionListData<EnrichedContact>;
}

export function buildContactListSections(contacts: ContactSections): ContactListSection[] {
  return [
    section('in-app', 'En Happy Circles', contacts.inAppContacts),
    section('unresolved', 'Agregar a Happy Circles', contacts.unresolvedContacts),
    section('invite', 'Invitar a Happy Circles', contacts.inviteContacts),
  ].filter((entry) => entry.data.length > 0);
}
