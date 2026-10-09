import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';
import {
  bestResolutionForContact,
  compareEnrichedContacts,
  shouldShowInApp,
  type EnrichedContact,
} from './contacts-sheet-helpers';

type Group = 'inAppContacts' | 'unresolvedContacts' | 'inviteContacts';
export type ContactSections = Record<Group, readonly EnrichedContact[]>;
const groups: readonly Group[] = ['inAppContacts', 'unresolvedContacts', 'inviteContacts'];

function groupFor(row: EnrichedContact): Group {
  return shouldShowInApp(row.resolution)
    ? 'inAppContacts'
    : row.resolution
      ? 'inviteContacts'
      : 'unresolvedContacts';
}

function samePresentation(a: PeopleTargetResolution | null, b: PeopleTargetResolution | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.phoneE164 === b.phoneE164 &&
    a.status === b.status &&
    a.friendshipDirection === b.friendshipDirection &&
    a.friendshipInviteId === b.friendshipInviteId &&
    a.accountInviteId === b.accountInviteId &&
    a.accountInviteStatus === b.accountInviteStatus &&
    a.matchedUserId === b.matchedUserId &&
    a.relationshipId === b.relationshipId &&
    a.displayName === b.displayName &&
    a.avatarPath === b.avatarPath &&
    (a.availableActions ?? []).join('|') === (b.availableActions ?? []).join('|')
  );
}

/** Keeps ordering and unchanged row objects stable when one phone changes. */
export class ContactSectionProjection {
  private contacts: readonly ContactCandidate[] | null = null;
  private targetCache: Readonly<Record<string, PeopleTargetResolution>> | null = null;
  private search = '';
  private rows = new Map<string, EnrichedContact>();
  private contactsByPhone = new Map<string, Set<string>>();
  private sections: ContactSections = {
    inAppContacts: [],
    unresolvedContacts: [],
    inviteContacts: [],
  };

  update(input: {
    contacts: readonly ContactCandidate[];
    searchValue: string;
    targetCache: Readonly<Record<string, PeopleTargetResolution>>;
    changedPhones?: readonly string[];
  }): ContactSections {
    const search = input.searchValue.trim().toLocaleLowerCase('es-CO');
    const previousContacts = this.contacts;
    const appended =
      this.contacts !== input.contacts &&
      previousContacts &&
      this.search === search &&
      input.contacts.length >= previousContacts.length &&
      previousContacts.every((contact, index) => input.contacts[index] === contact);
    if (this.contacts !== input.contacts && appended) {
      const sections: Partial<Record<Group, EnrichedContact[]>> = {};
      for (const contact of input.contacts.slice(previousContacts.length)) {
        if (search && !contact.searchKey.includes(search)) continue;
        const row = { contact, resolution: bestResolutionForContact(contact, input.targetCache) };
        this.rows.set(contact.contactId, row);
        const group = groupFor(row);
        const list = (sections[group] ??= [...this.sections[group]]);
        let low = 0;
        let high = list.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (compareEnrichedContacts(list[mid], row) <= 0) low = mid + 1;
          else high = mid;
        }
        list.splice(low, 0, row);
        for (const phone of contact.phoneOptions) {
          let ids = this.contactsByPhone.get(phone.phoneE164);
          if (!ids) this.contactsByPhone.set(phone.phoneE164, (ids = new Set()));
          ids.add(contact.contactId);
        }
      }
      this.contacts = input.contacts;
      if (Object.keys(sections).length) this.sections = { ...this.sections, ...sections };
    }
    if (this.contacts !== input.contacts || this.search !== search) {
      this.contacts = input.contacts;
      this.search = search;
      this.rows.clear();
      this.contactsByPhone.clear();
      const sections: Record<Group, EnrichedContact[]> = {
        inAppContacts: [],
        unresolvedContacts: [],
        inviteContacts: [],
      };
      for (const contact of input.contacts) {
        if (search && !contact.searchKey.includes(search)) continue;
        const row = { contact, resolution: bestResolutionForContact(contact, input.targetCache) };
        this.rows.set(contact.contactId, row);
        sections[groupFor(row)].push(row);
        for (const phone of contact.phoneOptions) {
          let ids = this.contactsByPhone.get(phone.phoneE164);
          if (!ids) this.contactsByPhone.set(phone.phoneE164, (ids = new Set()));
          ids.add(contact.contactId);
        }
      }
      for (const group of groups) sections[group].sort(compareEnrichedContacts);
      this.sections = sections;
      this.targetCache = input.targetCache;
      return this.sections;
    }

    const ids = new Set<string>();
    const changedPhones = new Set(input.changedPhones);
    // Read changes from the same immutable snapshot used to build each row.
    // A separate notification can arrive after React has already rendered it.
    if (this.targetCache !== input.targetCache) {
      for (const phone of this.contactsByPhone.keys()) {
        if (this.targetCache?.[phone] !== input.targetCache[phone]) changedPhones.add(phone);
      }
    }
    this.targetCache = input.targetCache;
    for (const phone of changedPhones) {
      for (const id of this.contactsByPhone.get(phone) ?? []) ids.add(id);
    }
    const next: Partial<Record<Group, EnrichedContact[]>> = {};
    for (const id of ids) {
      const previous = this.rows.get(id)!;
      const resolution = bestResolutionForContact(previous.contact, input.targetCache);
      if (samePresentation(previous.resolution, resolution)) continue;
      const row = { contact: previous.contact, resolution };
      const oldGroup = groupFor(previous);
      const newGroup = groupFor(row);
      const oldRows = (next[oldGroup] ??= [...this.sections[oldGroup]]);
      const oldIndex = oldRows.indexOf(previous);
      if (oldIndex !== -1) oldRows.splice(oldIndex, 1);
      const newRows = (next[newGroup] ??= [...this.sections[newGroup]]);
      let low = 0;
      let high = newRows.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (compareEnrichedContacts(newRows[mid], row) <= 0) low = mid + 1;
        else high = mid;
      }
      newRows.splice(low, 0, row);
      this.rows.set(id, row);
    }
    if (Object.keys(next).length) this.sections = { ...this.sections, ...next };
    return this.sections;
  }
}
