import { AppState } from 'react-native';

import { contactIndexRevision, readContactIndex } from './add-person-contact-index';
import {
  readWarmContactScanCache,
  writeWarmContactScanCache,
  type WarmContactScanCache,
} from './add-person-contact-scan-cache';
import {
  CONTACT_INDEX_INITIAL_READ_LIMIT,
  uniqueContactPhoneE164List,
} from './contacts-sheet-helpers';
import { loadPeopleTargetResolutionCache } from './people-target-resolution-cache';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
  type ContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  captureContactGenerations,
  contactResolutionEpoch,
  mergeContactResolutions,
  readContactResolutions,
} from '@/lib/contact-resolution-state';

type BootstrapInput = {
  readonly userId: string;
  readonly permissionStatus: ContactsPermissionStatus;
  readonly isAuthorized: () => boolean;
};

type BootstrapRun = {
  readonly permissionStatus: ContactsPermissionStatus;
  readonly epoch: number;
  readonly consumers: Set<() => boolean>;
  promise: Promise<WarmContactScanCache | null>;
};

const runs = new Map<string, BootstrapRun>();

/** Keep unchanged local rows stable without walking a larger warm agenda. */
export function retainUnchangedContactRows(
  previous: readonly ContactCandidate[],
  next: readonly ContactCandidate[],
): readonly ContactCandidate[] {
  if (previous === next) return previous;
  const rows = next.map((contact, index) => {
    const current = previous[index];
    return current === contact || (current && JSON.stringify(current) === JSON.stringify(contact))
      ? current
      : contact;
  });
  return rows.length === previous.length &&
    rows.every((contact, index) => contact === previous[index])
    ? previous
    : rows;
}

/** Hydrates a small local page before discovery or a native agenda scan. */
export function bootstrapWarmContactSnapshot(
  input: BootstrapInput,
): Promise<WarmContactScanCache | null> {
  if (!input.isAuthorized() || !canReadContactsPermissionStatus(input.permissionStatus)) {
    return Promise.resolve(null);
  }
  const epoch = contactResolutionEpoch(input.userId);
  let run = runs.get(input.userId);
  if (!run || run.permissionStatus !== input.permissionStatus || run.epoch !== epoch) {
    run = {
      permissionStatus: input.permissionStatus,
      epoch,
      consumers: new Set(),
      promise: Promise.resolve(null),
    };
    runs.set(input.userId, run);
    const currentRun = run;
    run.consumers.add(input.isAuthorized);
    run.promise = hydrate(input.userId, currentRun).finally(() => {
      if (runs.get(input.userId) === currentRun) runs.delete(input.userId);
    });
  } else {
    run.consumers.add(input.isAuthorized);
  }
  return run.promise.then((snapshot) => (input.isAuthorized() ? snapshot : null));
}

async function hydrate(userId: string, run: BootstrapRun): Promise<WarmContactScanCache | null> {
  const allowed = () =>
    runs.get(userId) === run &&
    AppState.currentState === 'active' &&
    contactResolutionEpoch(userId) === run.epoch &&
    [...run.consumers].some((isAuthorized) => isAuthorized());
  if (!allowed()) return null;
  const existing = readWarmContactScanCache(userId);
  if (existing?.contacts.length && existing.contactsPermissionStatus === run.permissionStatus) {
    return existing;
  }
  const revision = contactIndexRevision(userId);
  const result = await readContactIndex({ userId, limit: CONTACT_INDEX_INITIAL_READ_LIMIT });
  if (!allowed() || result.permissionStatus !== run.permissionStatus || !result.contacts.length) {
    return null;
  }
  const phones = uniqueContactPhoneE164List(result.contacts);
  const expectedGenerations = captureContactGenerations(userId, phones);
  const cached = await loadPeopleTargetResolutionCache(userId, phones);
  if (!allowed()) return null;
  const permissionStatus = await getContactsPermissionStatus();
  if (!allowed() || permissionStatus !== run.permissionStatus) return null;

  mergeContactResolutions(userId, Object.values(cached), {
    fromCache: true,
    expectedEpoch: run.epoch,
    expectedGenerations,
  });
  if (!allowed()) return null;
  const latest = readWarmContactScanCache(userId);
  if (
    latest?.contactsPermissionStatus === permissionStatus &&
    (latest.contacts.length >= result.contacts.length || (latest.indexRevision ?? 0) > revision)
  ) {
    return latest;
  }
  const snapshot: WarmContactScanCache = {
    userId,
    contacts: result.contacts,
    contactsPermissionStatus: permissionStatus,
    targetCache: readContactResolutions(userId),
    indexRevision: revision,
    readLimit: CONTACT_INDEX_INITIAL_READ_LIMIT,
    loadedCount: result.loadedCount,
    matchingCount: result.matchingCount,
    scanComplete: result.status === 'ready',
  };
  writeWarmContactScanCache(snapshot);
  return readWarmContactScanCache(userId);
}
