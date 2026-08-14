import type { ContactCandidate } from '@/features/invites/people-outreach-utils';

export function mergeUniqueContactCandidates(
  primaryContacts: readonly ContactCandidate[],
  extraContacts: readonly ContactCandidate[],
): readonly ContactCandidate[] {
  if (extraContacts.length === 0) {
    return primaryContacts;
  }

  const seenContactIds = new Set(primaryContacts.map((contact) => contact.contactId));
  const mergedContacts = [...primaryContacts];
  for (const contact of extraContacts) {
    if (seenContactIds.has(contact.contactId)) {
      continue;
    }

    seenContactIds.add(contact.contactId);
    mergedContacts.push(contact);
  }

  return mergedContacts;
}
