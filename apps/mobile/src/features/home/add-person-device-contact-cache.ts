import * as SQLite from 'expo-sqlite';

import type { ContactsPermissionStatus } from '@/lib/contacts-permissions';
import {
  CONTACTS_PAGE_SIZE,
  type ContactCandidate,
  readContactsPageFromDevice,
} from '@/features/invites/people-outreach-utils';

const DATABASE_NAME = 'happy-circles-device-contact-cache.db';
const TABLE_NAME = 'device_contact_scan_cache';
const CACHE_SCHEMA_VERSION = 1;
const USERLESS_CACHE_KEY = '__anonymous__';

type DeviceContactScanCacheRow = {
  readonly contacts_json: string;
  readonly contacts_permission_status: string;
  readonly updated_at: number;
};

export type PersistedDeviceContactScanCache = {
  readonly contacts: readonly ContactCandidate[];
  readonly contactsPermissionStatus: ContactsPermissionStatus;
  readonly updatedAt: number;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const refreshPromiseByUser = new Map<string, Promise<readonly ContactCandidate[]>>();

function cacheUserKey(userId: string | null | undefined): string {
  return userId ?? USERLESS_CACHE_KEY;
}

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        user_id TEXT PRIMARY KEY,
        contacts_json TEXT NOT NULL,
        contacts_permission_status TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        schema_version INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_device_contact_scan_cache_updated
        ON ${TABLE_NAME} (updated_at);
    `);

    return database;
  });

  return databasePromise;
}

function isContactsPermissionStatus(value: string): value is ContactsPermissionStatus {
  return (
    value === 'granted' ||
    value === 'limited' ||
    value === 'denied' ||
    value === 'undetermined' ||
    value === 'unavailable'
  );
}

function isContactCandidate(value: unknown): value is ContactCandidate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const contact = value as Partial<ContactCandidate>;
  return (
    typeof contact.contactId === 'string' &&
    typeof contact.alias === 'string' &&
    typeof contact.searchKey === 'string' &&
    Array.isArray(contact.phoneOptions) &&
    typeof contact.primaryPhone === 'object' &&
    contact.primaryPhone !== null &&
    typeof contact.primaryPhone.phoneE164 === 'string'
  );
}

function parseContactsJson(value: string): readonly ContactCandidate[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter(isContactCandidate);
  } catch {
    return null;
  }
}

async function readAllDeviceContacts(): Promise<readonly ContactCandidate[]> {
  const records: ContactCandidate[] = [];
  const seenContactIds = new Set<string>();
  let pageOffset = 0;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await readContactsPageFromDevice({
      pageOffset,
      pageSize: CONTACTS_PAGE_SIZE,
    });

    for (const contact of page.contacts) {
      if (seenContactIds.has(contact.contactId)) {
        continue;
      }

      seenContactIds.add(contact.contactId);
      records.push(contact);
    }

    pageOffset = page.nextPageOffset;
    hasNextPage = page.hasNextPage;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return records;
}

export async function readPersistedDeviceContactScanCache(
  userId: string | null | undefined,
): Promise<PersistedDeviceContactScanCache | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<DeviceContactScanCacheRow>(
    `SELECT contacts_json, contacts_permission_status, updated_at
     FROM ${TABLE_NAME}
     WHERE user_id = ?
       AND schema_version = ?`,
    [cacheUserKey(userId), CACHE_SCHEMA_VERSION],
  );

  if (!row || !isContactsPermissionStatus(row.contacts_permission_status)) {
    return null;
  }

  const contacts = parseContactsJson(row.contacts_json);
  if (!contacts) {
    return null;
  }

  return {
    contacts,
    contactsPermissionStatus: row.contacts_permission_status,
    updatedAt: row.updated_at,
  };
}

export async function writePersistedDeviceContactScanCache(input: {
  readonly userId: string | null | undefined;
  readonly contactsPermissionStatus: ContactsPermissionStatus;
  readonly contacts: readonly ContactCandidate[];
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR REPLACE INTO ${TABLE_NAME}
      (user_id, contacts_json, contacts_permission_status, updated_at, schema_version)
     VALUES (?, ?, ?, ?, ?)`,
    [
      cacheUserKey(input.userId),
      JSON.stringify(input.contacts),
      input.contactsPermissionStatus,
      Date.now(),
      CACHE_SCHEMA_VERSION,
    ],
  );
}

export async function clearPersistedDeviceContactScanCache(
  userId: string | null | undefined,
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM ${TABLE_NAME} WHERE user_id = ?`, [cacheUserKey(userId)]);
}

export function refreshPersistedDeviceContactScanCache(input: {
  readonly userId: string | null | undefined;
  readonly contactsPermissionStatus: ContactsPermissionStatus;
}): Promise<readonly ContactCandidate[]> {
  const key = cacheUserKey(input.userId);
  const existingRefresh = refreshPromiseByUser.get(key);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = readAllDeviceContacts()
    .then(async (contacts) => {
      await writePersistedDeviceContactScanCache({
        contacts,
        contactsPermissionStatus: input.contactsPermissionStatus,
        userId: input.userId,
      });
      return contacts;
    })
    .finally(() => {
      refreshPromiseByUser.delete(key);
    });

  refreshPromiseByUser.set(key, refreshPromise);
  return refreshPromise;
}
