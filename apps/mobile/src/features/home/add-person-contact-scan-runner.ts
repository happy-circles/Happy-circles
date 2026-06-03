import { Platform } from 'react-native';

import {
  clearWarmContactScanCache,
  readWarmContactScanCache,
  writeWarmContactScanCache,
  type WarmContactScanCache,
} from '@/features/home/add-person-contact-scan-cache';
import {
  clearPersistedDeviceContactScanCache,
  readPersistedDeviceContactScanCache,
  writePersistedDeviceContactScanCache,
} from '@/features/home/add-person-device-contact-cache';
import { uniqueContactPhoneE164List } from '@/features/home/contacts-sheet-helpers';
import { pruneExpiredPeopleTargetResolutionCache } from '@/features/home/people-target-resolution-cache';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
  type ContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  CONTACTS_PAGE_SIZE,
  type ContactCandidate,
  readContactsPageFromDevice,
} from '@/features/invites/people-outreach-utils';
import type { PeopleTargetResolution } from '@/lib/live-data';

type MutableRef<T> = {
  current: T;
};

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

function resetContactScan(input: {
  readonly runId: number;
  readonly warmCache: WarmContactScanCache | null;
  readonly contactsRef: MutableRef<readonly ContactCandidate[]>;
  readonly inFlightResolutionSetRef: MutableRef<Set<string>>;
  readonly pendingResolutionQueueRef: MutableRef<string[]>;
  readonly pendingResolutionSetRef: MutableRef<Set<string>>;
  readonly scanRunIdRef: MutableRef<number>;
  readonly setContacts: StateSetter<readonly ContactCandidate[]>;
  readonly setContactsLoadedCount: StateSetter<number>;
  readonly setContactsLoading: StateSetter<boolean>;
  readonly setContactsPermissionStatus: StateSetter<ContactsPermissionStatus>;
  readonly setContactsScanComplete: StateSetter<boolean>;
  readonly setTargetCache: StateSetter<Record<string, PeopleTargetResolution>>;
  readonly targetCacheRef: MutableRef<Record<string, PeopleTargetResolution>>;
  readonly visibleResolutionPhonesRef: MutableRef<Set<string>>;
}) {
  input.scanRunIdRef.current = input.runId;
  input.pendingResolutionQueueRef.current = [];
  input.pendingResolutionSetRef.current.clear();
  input.inFlightResolutionSetRef.current.clear();
  input.visibleResolutionPhonesRef.current.clear();
  const nextContacts = input.warmCache?.contacts ?? [];
  const nextTargetCache = input.warmCache?.targetCache ?? {};

  input.contactsRef.current = nextContacts;
  input.targetCacheRef.current = nextTargetCache;
  input.setContacts(nextContacts);
  input.setTargetCache(nextTargetCache);
  input.setContactsLoadedCount(nextContacts.length);
  input.setContactsLoading(false);
  input.setContactsScanComplete(Boolean(input.warmCache));

  if (input.warmCache) {
    input.setContactsPermissionStatus(input.warmCache.contactsPermissionStatus);
  }
}

function mergeContactPage(input: {
  readonly contacts: readonly ContactCandidate[];
  readonly contactsRef: MutableRef<readonly ContactCandidate[]>;
  readonly refreshedContactIds: Set<string>;
  readonly refreshedContacts: ContactCandidate[];
  readonly setContacts: StateSetter<readonly ContactCandidate[]>;
  readonly setContactsLoadedCount: StateSetter<number>;
  readonly shouldRefreshExistingContacts: boolean;
  readonly loadedCount: number;
}): number {
  if (input.shouldRefreshExistingContacts) {
    for (const contact of input.contacts) {
      if (!input.refreshedContactIds.has(contact.contactId)) {
        input.refreshedContactIds.add(contact.contactId);
        input.refreshedContacts.push(contact);
      }
    }
    return input.loadedCount;
  }

  input.setContacts((current) => {
    const existingContactIds = new Set(current.map((contact) => contact.contactId));
    const nextContacts = [...current];
    for (const contact of input.contacts) {
      if (!existingContactIds.has(contact.contactId)) {
        existingContactIds.add(contact.contactId);
        nextContacts.push(contact);
      }
    }

    input.contactsRef.current = nextContacts;
    return nextContacts;
  });

  const nextLoadedCount = input.loadedCount + input.contacts.length;
  input.setContactsLoadedCount(nextLoadedCount);
  return nextLoadedCount;
}

export async function runAddPersonContactScan(input: {
  readonly contactsRef: MutableRef<readonly ContactCandidate[]>;
  readonly hydrateAndEnqueueResolutionPhones: (
    runId: number,
    phoneE164List: readonly string[],
    priority: 'visible' | 'background',
  ) => void;
  readonly inFlightResolutionSetRef: MutableRef<Set<string>>;
  readonly pendingResolutionQueueRef: MutableRef<string[]>;
  readonly pendingResolutionSetRef: MutableRef<Set<string>>;
  readonly scanRunIdRef: MutableRef<number>;
  readonly setBusyKey: StateSetter<string | null>;
  readonly setContacts: StateSetter<readonly ContactCandidate[]>;
  readonly setContactsLoadedCount: StateSetter<number>;
  readonly setContactsLoading: StateSetter<boolean>;
  readonly setContactsPermissionStatus: StateSetter<ContactsPermissionStatus>;
  readonly setContactsScanComplete: StateSetter<boolean>;
  readonly setMessage: StateSetter<string | null>;
  readonly setTargetCache: StateSetter<Record<string, PeopleTargetResolution>>;
  readonly targetCacheRef: MutableRef<Record<string, PeopleTargetResolution>>;
  readonly userId: string | null | undefined;
  readonly visibleResolutionPhonesRef: MutableRef<Set<string>>;
}) {
  const runId = input.scanRunIdRef.current + 1;
  const warmCache = readWarmContactScanCache(input.userId);
  const hasWarmContacts = Boolean(
    warmCache &&
      canReadContactsPermissionStatus(warmCache.contactsPermissionStatus) &&
      warmCache.contacts.length > 0,
  );

  resetContactScan({ ...input, runId, warmCache });

  if (Platform.OS === 'web') {
    input.setContactsPermissionStatus('unavailable');
    input.contactsRef.current = [];
    input.setContacts([]);
    input.setContactsScanComplete(true);
    return;
  }

  if (!hasWarmContacts) {
    input.setBusyKey('load-contacts');
    input.setContactsLoading(true);
  }

  try {
    const nextStatus = await getContactsPermissionStatus();
    if (input.scanRunIdRef.current !== runId) {
      return;
    }

    input.setContactsPermissionStatus(nextStatus);

    if (!canReadContactsPermissionStatus(nextStatus)) {
      input.contactsRef.current = [];
      input.targetCacheRef.current = {};
      clearWarmContactScanCache(input.userId);
      void clearPersistedDeviceContactScanCache(input.userId).catch(() => undefined);
      input.setContacts([]);
      input.setTargetCache({});
      input.setContactsLoadedCount(0);
      input.setContactsScanComplete(true);
      return;
    }

    let shouldRefreshExistingContacts = hasWarmContacts;
    if (!hasWarmContacts) {
      const persistedCache = await readPersistedDeviceContactScanCache(input.userId);
      if (input.scanRunIdRef.current !== runId) {
        return;
      }

      if (
        persistedCache &&
        canReadContactsPermissionStatus(persistedCache.contactsPermissionStatus) &&
        persistedCache.contacts.length > 0
      ) {
        input.contactsRef.current = persistedCache.contacts;
        input.setContacts(persistedCache.contacts);
        input.setContactsLoadedCount(persistedCache.contacts.length);
        input.setContactsLoading(false);
        input.setContactsScanComplete(false);
        input.setBusyKey((current) => (current === 'load-contacts' ? null : current));
        shouldRefreshExistingContacts = true;
      }
    }

    void pruneExpiredPeopleTargetResolutionCache(input.userId).catch(() => undefined);

    let pageOffset = 0;
    let hasNextPage = true;
    let loadedCount = 0;
    let isFirstPage = true;
    const refreshedContacts: ContactCandidate[] = [];
    const refreshedContactIds = new Set<string>();

    while (hasNextPage && input.scanRunIdRef.current === runId) {
      const page = await readContactsPageFromDevice({
        pageOffset,
        pageSize: CONTACTS_PAGE_SIZE,
      });
      if (input.scanRunIdRef.current !== runId) {
        return;
      }

      if (page.contacts.length > 0) {
        loadedCount = mergeContactPage({
          contacts: page.contacts,
          contactsRef: input.contactsRef,
          loadedCount,
          refreshedContactIds,
          refreshedContacts,
          setContacts: input.setContacts,
          setContactsLoadedCount: input.setContactsLoadedCount,
          shouldRefreshExistingContacts,
        });

        input.hydrateAndEnqueueResolutionPhones(
          runId,
          uniqueContactPhoneE164List(page.contacts),
          'background',
        );
      }

      if (isFirstPage) {
        input.setBusyKey((current) => (current === 'load-contacts' ? null : current));
        isFirstPage = false;
      }

      pageOffset = page.nextPageOffset;
      hasNextPage = page.hasNextPage;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (input.scanRunIdRef.current === runId) {
      if (shouldRefreshExistingContacts) {
        input.contactsRef.current = refreshedContacts;
        input.setContacts(refreshedContacts);
        input.setContactsLoadedCount(refreshedContacts.length);
      }

      input.setContactsScanComplete(true);
      writeWarmContactScanCache({
        contacts: input.contactsRef.current,
        contactsPermissionStatus: nextStatus,
        targetCache: input.targetCacheRef.current,
        userId: input.userId ?? null,
      });
      void writePersistedDeviceContactScanCache({
        contacts: input.contactsRef.current,
        contactsPermissionStatus: nextStatus,
        userId: input.userId,
      }).catch(() => undefined);
    }
  } catch (error) {
    if (input.scanRunIdRef.current === runId) {
      input.setMessage(error instanceof Error ? error.message : 'No se pudo leer la agenda.');
    }
  } finally {
    if (input.scanRunIdRef.current === runId) {
      input.setContactsLoading(false);
      input.setBusyKey((current) => (current === 'load-contacts' ? null : current));
    }
  }
}
