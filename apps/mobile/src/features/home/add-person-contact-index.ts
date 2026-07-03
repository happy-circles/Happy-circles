import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as SQLite from 'expo-sqlite';

import type { ContactsPermissionStatus } from '@/lib/contacts-permissions';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  CONTACTS_PAGE_SIZE,
  type ContactCandidate,
  readContactsPageFromDevice,
} from '@/features/invites/people-outreach-utils';
import { readPersistedDeviceContactScanCache } from '@/features/home/add-person-device-contact-cache';

export type ContactIndexStatus =
  | 'idle'
  | 'indexing'
  | 'ready'
  | 'paused'
  | 'permission_blocked'
  | 'error';

export type ContactIndexStartReason =
  | 'app_active'
  | 'permission_granted'
  | 'sheet_open'
  | 'manual_refresh';

export type ContactIndexReadResult = {
  readonly contacts: readonly ContactCandidate[];
  readonly loadedCount: number;
  readonly permissionStatus: ContactsPermissionStatus;
  readonly status: ContactIndexStatus;
  readonly lastCompletedAt: number | null;
};

type ContactIndexListener = () => void;

type ContactIndexMetaRow = {
  readonly contact_count: number | null;
  readonly error_message: string | null;
  readonly last_completed_at: number | null;
  readonly last_started_at: number | null;
  readonly loaded_count: number;
  readonly next_page_offset: number;
  readonly permission_status: string;
  readonly scan_generation: number;
  readonly scan_status: string;
};

type ContactIndexRow = {
  readonly contact_json: string;
};

type CountRow = {
  readonly count: number;
};

type ActiveContactIndexRun = {
  cancelled: boolean;
  readonly generation: number;
  promise: Promise<void>;
};

const DATABASE_NAME = 'happy-circles-contact-index.db';
const CONTACT_TABLE_NAME = 'device_contact_index';
const META_TABLE_NAME = 'device_contact_index_meta';
const CONTACT_INDEX_SCHEMA_VERSION = 1;
const USERLESS_CACHE_KEY = '__anonymous__';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const activeRunsByUser = new Map<string, ActiveContactIndexRun>();
const listenersByUser = new Map<string, Set<ContactIndexListener>>();
const migratedLegacyCacheUsers = new Set<string>();
const appActiveRefreshUsers = new Set<string>();

function cacheUserKey(userId: string | null | undefined): string {
  return userId ?? USERLESS_CACHE_KEY;
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

function isContactIndexStatus(value: string): value is ContactIndexStatus {
  return (
    value === 'idle' ||
    value === 'indexing' ||
    value === 'ready' ||
    value === 'paused' ||
    value === 'permission_blocked' ||
    value === 'error'
  );
}

function normalizeSearchValue(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase('es-CO') ?? '';
}

function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function parseContact(value: string): ContactCandidate | null {
  try {
    const parsed = JSON.parse(value) as Partial<ContactCandidate>;
    if (
      typeof parsed.contactId !== 'string' ||
      typeof parsed.alias !== 'string' ||
      typeof parsed.searchKey !== 'string' ||
      !Array.isArray(parsed.phoneOptions) ||
      typeof parsed.primaryPhone !== 'object' ||
      parsed.primaryPhone === null ||
      typeof parsed.primaryPhone.phoneE164 !== 'string'
    ) {
      return null;
    }

    return parsed as ContactCandidate;
  } catch {
    return null;
  }
}

function notifyContactIndexSubscribers(userId: string | null | undefined) {
  const listeners = listenersByUser.get(cacheUserKey(userId));
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS ${CONTACT_TABLE_NAME} (
        user_id TEXT NOT NULL,
        contact_id TEXT NOT NULL,
        alias TEXT NOT NULL,
        search_key TEXT NOT NULL,
        primary_phone_e164 TEXT NOT NULL,
        contact_json TEXT NOT NULL,
        scan_generation INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        PRIMARY KEY (user_id, contact_id)
      );
      CREATE INDEX IF NOT EXISTS idx_device_contact_index_search
        ON ${CONTACT_TABLE_NAME} (user_id, search_key);
      CREATE INDEX IF NOT EXISTS idx_device_contact_index_generation
        ON ${CONTACT_TABLE_NAME} (user_id, scan_generation);

      CREATE TABLE IF NOT EXISTS ${META_TABLE_NAME} (
        user_id TEXT PRIMARY KEY,
        permission_status TEXT NOT NULL,
        scan_status TEXT NOT NULL,
        scan_generation INTEGER NOT NULL,
        loaded_count INTEGER NOT NULL,
        contact_count INTEGER,
        next_page_offset INTEGER NOT NULL,
        last_started_at INTEGER,
        last_completed_at INTEGER,
        updated_at INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        error_message TEXT
      );
    `);

    return database;
  });

  return databasePromise;
}

async function readContactIndexMeta(
  database: SQLite.SQLiteDatabase,
  userKey: string,
): Promise<ContactIndexMetaRow | null> {
  return database.getFirstAsync<ContactIndexMetaRow>(
    `SELECT permission_status, scan_status, scan_generation, loaded_count, contact_count,
            next_page_offset, last_started_at, last_completed_at, error_message
     FROM ${META_TABLE_NAME}
     WHERE user_id = ?
       AND schema_version = ?`,
    [userKey, CONTACT_INDEX_SCHEMA_VERSION],
  );
}

async function countIndexedContacts(
  database: SQLite.SQLiteDatabase,
  userKey: string,
): Promise<number> {
  const row = await database.getFirstAsync<CountRow>(
    `SELECT COUNT(*) as count
     FROM ${CONTACT_TABLE_NAME}
     WHERE user_id = ?
       AND schema_version = ?`,
    [userKey, CONTACT_INDEX_SCHEMA_VERSION],
  );

  return row?.count ?? 0;
}

async function persistContactPage(input: {
  readonly contacts: readonly ContactCandidate[];
  readonly database: SQLite.SQLiteDatabase;
  readonly generation: number;
  readonly now: number;
  readonly userKey: string;
}) {
  if (input.contacts.length === 0) {
    return;
  }

  await input.database.withTransactionAsync(async () => {
    for (const contact of input.contacts) {
      await input.database.runAsync(
        `INSERT OR REPLACE INTO ${CONTACT_TABLE_NAME}
          (user_id, contact_id, alias, search_key, primary_phone_e164, contact_json,
           scan_generation, updated_at, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.userKey,
          contact.contactId,
          contact.alias,
          contact.searchKey,
          contact.primaryPhone.phoneE164,
          JSON.stringify(contact),
          input.generation,
          input.now,
          CONTACT_INDEX_SCHEMA_VERSION,
        ],
      );
    }
  });
}

async function writeContactIndexMeta(input: {
  readonly contactCount?: number | null;
  readonly database: SQLite.SQLiteDatabase;
  readonly errorMessage?: string | null;
  readonly generation: number;
  readonly lastCompletedAt?: number | null;
  readonly lastStartedAt?: number | null;
  readonly loadedCount: number;
  readonly nextPageOffset: number;
  readonly permissionStatus: ContactsPermissionStatus;
  readonly status: ContactIndexStatus;
  readonly userKey: string;
}) {
  const now = Date.now();
  await input.database.runAsync(
    `INSERT INTO ${META_TABLE_NAME}
      (user_id, permission_status, scan_status, scan_generation, loaded_count, contact_count,
       next_page_offset, last_started_at, last_completed_at, updated_at, schema_version,
       error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       permission_status = excluded.permission_status,
       scan_status = excluded.scan_status,
       scan_generation = excluded.scan_generation,
       loaded_count = excluded.loaded_count,
       contact_count = excluded.contact_count,
       next_page_offset = excluded.next_page_offset,
       last_started_at = excluded.last_started_at,
       last_completed_at = excluded.last_completed_at,
       updated_at = excluded.updated_at,
       schema_version = excluded.schema_version,
       error_message = excluded.error_message`,
    [
      input.userKey,
      input.permissionStatus,
      input.status,
      input.generation,
      input.loadedCount,
      input.contactCount ?? null,
      input.nextPageOffset,
      input.lastStartedAt ?? null,
      input.lastCompletedAt ?? null,
      now,
      CONTACT_INDEX_SCHEMA_VERSION,
      input.errorMessage ?? null,
    ],
  );
}

async function migrateLegacyContactCacheIfNeeded(input: {
  readonly database: SQLite.SQLiteDatabase;
  readonly userId: string | null | undefined;
  readonly userKey: string;
}) {
  if (migratedLegacyCacheUsers.has(input.userKey)) {
    return;
  }

  migratedLegacyCacheUsers.add(input.userKey);
  const existingCount = await countIndexedContacts(input.database, input.userKey);
  if (existingCount > 0) {
    return;
  }

  const legacyCache = await readPersistedDeviceContactScanCache(input.userId);
  if (!legacyCache || legacyCache.contacts.length === 0) {
    return;
  }

  const generation = legacyCache.updatedAt || Date.now();
  await persistContactPage({
    contacts: legacyCache.contacts,
    database: input.database,
    generation,
    now: legacyCache.updatedAt || Date.now(),
    userKey: input.userKey,
  });
  await writeContactIndexMeta({
    contactCount: legacyCache.contacts.length,
    database: input.database,
    generation,
    lastCompletedAt: legacyCache.updatedAt,
    lastStartedAt: legacyCache.updatedAt,
    loadedCount: legacyCache.contacts.length,
    nextPageOffset: legacyCache.contacts.length,
    permissionStatus: legacyCache.contactsPermissionStatus,
    status: canReadContactsPermissionStatus(legacyCache.contactsPermissionStatus)
      ? 'ready'
      : 'permission_blocked',
    userKey: input.userKey,
  });
}

async function markContactIndexPermissionBlocked(input: {
  readonly database: SQLite.SQLiteDatabase;
  readonly permissionStatus: ContactsPermissionStatus;
  readonly userKey: string;
}) {
  const meta = await readContactIndexMeta(input.database, input.userKey);
  await writeContactIndexMeta({
    contactCount: meta?.contact_count ?? null,
    database: input.database,
    generation: meta?.scan_generation ?? 0,
    lastCompletedAt: meta?.last_completed_at ?? null,
    lastStartedAt: meta?.last_started_at ?? null,
    loadedCount: meta?.loaded_count ?? 0,
    nextPageOffset: meta?.next_page_offset ?? 0,
    permissionStatus: input.permissionStatus,
    status: 'permission_blocked',
    userKey: input.userKey,
  });
}

async function removeOldContactGenerations(input: {
  readonly database: SQLite.SQLiteDatabase;
  readonly generation: number;
  readonly userKey: string;
}) {
  await input.database.runAsync(
    `DELETE FROM ${CONTACT_TABLE_NAME}
     WHERE user_id = ?
       AND scan_generation <> ?`,
    [input.userKey, input.generation],
  );
}

function shouldResumeMeta(meta: ContactIndexMetaRow | null): boolean {
  return Boolean(
    meta &&
      (meta.scan_status === 'paused' || meta.scan_status === 'indexing') &&
      meta.scan_generation > 0,
  );
}

async function runContactIndex(input: {
  readonly generation: number;
  readonly initialLoadedCount: number;
  readonly initialPageOffset: number;
  readonly lastCompletedAt: number | null;
  readonly permissionStatus: ContactsPermissionStatus;
  readonly run: ActiveContactIndexRun;
  readonly startedAt: number;
  readonly userId: string | null | undefined;
  readonly userKey: string;
}) {
  const database = await getDatabase();
  let loadedCount = input.initialLoadedCount;
  let pageOffset = input.initialPageOffset;

  try {
    await writeContactIndexMeta({
      contactCount: null,
      database,
      generation: input.generation,
      lastCompletedAt: input.lastCompletedAt,
      lastStartedAt: input.startedAt,
      loadedCount,
      nextPageOffset: pageOffset,
      permissionStatus: input.permissionStatus,
      status: 'indexing',
      userKey: input.userKey,
    });
    notifyContactIndexSubscribers(input.userId);

    let hasNextPage = true;
    while (hasNextPage && !input.run.cancelled && AppState.currentState === 'active') {
      const page = await readContactsPageFromDevice({
        pageOffset,
        pageSize: CONTACTS_PAGE_SIZE,
      });

      if (input.run.cancelled || AppState.currentState !== 'active') {
        break;
      }

      const now = Date.now();
      await persistContactPage({
        contacts: page.contacts,
        database,
        generation: input.generation,
        now,
        userKey: input.userKey,
      });

      loadedCount += page.contacts.length;
      pageOffset = page.nextPageOffset;
      hasNextPage = page.hasNextPage;

      await writeContactIndexMeta({
        contactCount: null,
        database,
        generation: input.generation,
        lastCompletedAt: input.lastCompletedAt,
        lastStartedAt: input.startedAt,
        loadedCount,
        nextPageOffset: pageOffset,
        permissionStatus: input.permissionStatus,
        status: 'indexing',
        userKey: input.userKey,
      });
      notifyContactIndexSubscribers(input.userId);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (input.run.cancelled || AppState.currentState !== 'active') {
      await writeContactIndexMeta({
        contactCount: null,
        database,
        generation: input.generation,
        lastCompletedAt: input.lastCompletedAt,
        lastStartedAt: input.startedAt,
        loadedCount,
        nextPageOffset: pageOffset,
        permissionStatus: input.permissionStatus,
        status: 'paused',
        userKey: input.userKey,
      });
      notifyContactIndexSubscribers(input.userId);
      return;
    }

    await removeOldContactGenerations({
      database,
      generation: input.generation,
      userKey: input.userKey,
    });
    const contactCount = await countIndexedContacts(database, input.userKey);
    await writeContactIndexMeta({
      contactCount,
      database,
      generation: input.generation,
      lastCompletedAt: Date.now(),
      lastStartedAt: input.startedAt,
      loadedCount: contactCount,
      nextPageOffset: pageOffset,
      permissionStatus: input.permissionStatus,
      status: 'ready',
      userKey: input.userKey,
    });
    notifyContactIndexSubscribers(input.userId);
  } catch (error) {
    if (input.run.cancelled) {
      return;
    }

    await writeContactIndexMeta({
      contactCount: null,
      database,
      errorMessage: error instanceof Error ? error.message : 'contact_index_failed',
      generation: input.generation,
      lastCompletedAt: input.lastCompletedAt,
      lastStartedAt: input.startedAt,
      loadedCount,
      nextPageOffset: pageOffset,
      permissionStatus: input.permissionStatus,
      status: 'error',
      userKey: input.userKey,
    });
    notifyContactIndexSubscribers(input.userId);
  } finally {
    if (activeRunsByUser.get(input.userKey) === input.run) {
      activeRunsByUser.delete(input.userKey);
    }
  }
}

export function subscribeContactIndex(
  userId: string | null | undefined,
  listener: ContactIndexListener,
): () => void {
  const userKey = cacheUserKey(userId);
  const listeners = listenersByUser.get(userKey) ?? new Set<ContactIndexListener>();
  listeners.add(listener);
  listenersByUser.set(userKey, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByUser.delete(userKey);
    }
  };
}

export async function readContactIndex(input: {
  readonly limit: number;
  readonly searchValue?: string | null;
  readonly userId: string | null | undefined;
}): Promise<ContactIndexReadResult> {
  if (Platform.OS === 'web' || !input.userId) {
    return {
      contacts: [],
      lastCompletedAt: null,
      loadedCount: 0,
      permissionStatus: 'unavailable',
      status: Platform.OS === 'web' ? 'permission_blocked' : 'idle',
    };
  }

  const database = await getDatabase();
  const userKey = cacheUserKey(input.userId);
  await migrateLegacyContactCacheIfNeeded({ database, userId: input.userId, userKey });

  const meta = await readContactIndexMeta(database, userKey);
  const metaPermissionStatus = meta?.permission_status ?? '';
  const metaScanStatus = meta?.scan_status ?? '';
  const permissionStatus = isContactsPermissionStatus(metaPermissionStatus)
    ? metaPermissionStatus
    : 'undetermined';
  const status: ContactIndexStatus = isContactIndexStatus(metaScanStatus) ? metaScanStatus : 'idle';
  const normalizedSearch = normalizeSearchValue(input.searchValue);
  const limit = Math.max(1, Math.min(input.limit, 120));
  const rows =
    normalizedSearch.length > 0
      ? await database.getAllAsync<ContactIndexRow>(
          `SELECT contact_json
           FROM ${CONTACT_TABLE_NAME}
           WHERE user_id = ?
             AND schema_version = ?
             AND search_key LIKE ? ESCAPE '\\'
           ORDER BY alias COLLATE NOCASE ASC, primary_phone_e164 ASC
           LIMIT ?`,
          [
            userKey,
            CONTACT_INDEX_SCHEMA_VERSION,
            `%${escapeLikeValue(normalizedSearch)}%`,
            limit,
          ],
        )
      : await database.getAllAsync<ContactIndexRow>(
          `SELECT contact_json
           FROM ${CONTACT_TABLE_NAME}
           WHERE user_id = ?
             AND schema_version = ?
           ORDER BY alias COLLATE NOCASE ASC, primary_phone_e164 ASC
           LIMIT ?`,
          [userKey, CONTACT_INDEX_SCHEMA_VERSION, limit],
        );

  const contacts = rows.flatMap((row) => {
    const contact = parseContact(row.contact_json);
    return contact ? [contact] : [];
  });

  return {
    contacts,
    lastCompletedAt: meta?.last_completed_at ?? null,
    loadedCount: Math.max(meta?.contact_count ?? meta?.loaded_count ?? 0, contacts.length),
    permissionStatus,
    status,
  };
}

export async function startContactIndexing(input: {
  readonly permissionStatus?: ContactsPermissionStatus;
  readonly reason: ContactIndexStartReason;
  readonly userId: string | null | undefined;
}): Promise<void> {
  if (Platform.OS === 'web' || !input.userId) {
    return;
  }

  const userKey = cacheUserKey(input.userId);
  const activeRun = activeRunsByUser.get(userKey);
  if (activeRun && !activeRun.cancelled) {
    return;
  }

  const permissionStatus = input.permissionStatus ?? (await getContactsPermissionStatus());
  const database = await getDatabase();
  await migrateLegacyContactCacheIfNeeded({ database, userId: input.userId, userKey });

  if (!canReadContactsPermissionStatus(permissionStatus)) {
    await markContactIndexPermissionBlocked({ database, permissionStatus, userKey });
    notifyContactIndexSubscribers(input.userId);
    return;
  }

  const meta = await readContactIndexMeta(database, userKey);
  if (input.reason === 'sheet_open' && meta?.scan_status === 'ready') {
    notifyContactIndexSubscribers(input.userId);
    return;
  }

  if (
    input.reason === 'app_active' &&
    meta?.scan_status === 'ready' &&
    appActiveRefreshUsers.has(userKey)
  ) {
    notifyContactIndexSubscribers(input.userId);
    return;
  }
  if (input.reason === 'app_active') {
    appActiveRefreshUsers.add(userKey);
  }

  const resume = shouldResumeMeta(meta);
  const generation = resume ? meta!.scan_generation : Date.now();
  const startedAt = resume ? (meta!.last_started_at ?? Date.now()) : Date.now();
  const run: ActiveContactIndexRun = {
    cancelled: false,
    generation,
    promise: Promise.resolve(),
  };
  activeRunsByUser.set(userKey, run);
  run.promise = runContactIndex({
    generation,
    initialLoadedCount: resume ? meta!.loaded_count : 0,
    initialPageOffset: resume ? meta!.next_page_offset : 0,
    lastCompletedAt: meta?.last_completed_at ?? null,
    permissionStatus,
    run,
    startedAt,
    userId: input.userId,
    userKey,
  });
}

export function pauseContactIndexing(userId: string | null | undefined): void {
  if (Platform.OS === 'web' || !userId) {
    return;
  }

  const userKey = cacheUserKey(userId);
  const activeRun = activeRunsByUser.get(userKey);
  if (activeRun) {
    activeRun.cancelled = true;
  }

  void getDatabase()
    .then(async (database) => {
      const meta = await readContactIndexMeta(database, userKey);
      if (!meta || meta.scan_status !== 'indexing') {
        return;
      }

      await writeContactIndexMeta({
        contactCount: meta.contact_count,
        database,
        generation: meta.scan_generation,
        lastCompletedAt: meta.last_completed_at,
        lastStartedAt: meta.last_started_at,
        loadedCount: meta.loaded_count,
        nextPageOffset: meta.next_page_offset,
        permissionStatus: isContactsPermissionStatus(meta.permission_status)
          ? meta.permission_status
          : 'undetermined',
        status: 'paused',
        userKey,
      });
      notifyContactIndexSubscribers(userId);
    })
    .catch(() => undefined);
}

export function syncContactIndexForAppState(input: {
  readonly permissionStatus: ContactsPermissionStatus;
  readonly status: AppStateStatus;
  readonly userId: string | null | undefined;
}) {
  if (input.status === 'active') {
    void startContactIndexing({
      permissionStatus: input.permissionStatus,
      reason: 'app_active',
      userId: input.userId,
    }).catch(() => undefined);
    return;
  }

  pauseContactIndexing(input.userId);
}
