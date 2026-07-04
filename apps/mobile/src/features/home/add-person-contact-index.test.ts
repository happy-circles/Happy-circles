import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = false;
  Object.defineProperty(globalThis, 'expo', {
    configurable: true,
    value: { EventEmitter: class EventEmitter {} },
  });
});

const sqliteMock = vi.hoisted(() => {
  type ContactRow = {
    readonly alias: string;
    readonly contact_id: string;
    readonly contact_json: string;
    readonly primary_phone_e164: string;
    readonly scan_generation: number;
    readonly schema_version: number;
    readonly search_key: string;
    readonly user_id: string;
  };
  type MetaRow = {
    readonly contact_count: number | null;
    readonly error_message: string | null;
    readonly last_completed_at: number | null;
    readonly last_started_at: number | null;
    readonly loaded_count: number;
    readonly next_page_offset: number;
    readonly permission_status: string;
    readonly scan_generation: number;
    readonly scan_status: string;
    readonly schema_version: number;
    readonly user_id: string;
  };

  const contacts = new Map<string, ContactRow>();
  const meta = new Map<string, MetaRow>();
  const database = {
    execAsync: vi.fn(async () => undefined),
    getAllAsync: vi.fn(async (query: string, params: readonly unknown[]) => {
      const userId = String(params[0]);
      const limit = Number(params.at(-1));
      const searchPattern = query.includes('LIKE') ? String(params[2]).replace(/%/g, '') : null;
      return [...contacts.values()]
        .filter((row) => row.user_id === userId)
        .filter((row) => !searchPattern || row.search_key.includes(searchPattern))
        .sort((left, right) => left.alias.localeCompare(right.alias, 'es-CO'))
        .slice(0, limit)
        .map((row) => ({ contact_json: row.contact_json }));
    }),
    getFirstAsync: vi.fn(async (query: string, params: readonly unknown[]) => {
      const userId = String(params[0]);
      if (query.includes('COUNT(*)')) {
        const searchPattern = query.includes('LIKE') ? String(params[2]).replace(/%/g, '') : null;
        return {
          count: [...contacts.values()]
            .filter((row) => row.user_id === userId)
            .filter((row) => !searchPattern || row.search_key.includes(searchPattern)).length,
        };
      }

      return meta.get(userId) ?? null;
    }),
    runAsync: vi.fn(async (query: string, params: readonly unknown[]) => {
      if (query.startsWith('INSERT OR REPLACE INTO device_contact_index')) {
        contacts.set(`${String(params[0])}:${String(params[1])}`, {
          alias: String(params[2]),
          contact_id: String(params[1]),
          contact_json: String(params[5]),
          primary_phone_e164: String(params[4]),
          scan_generation: Number(params[6]),
          schema_version: Number(params[8]),
          search_key: String(params[3]),
          user_id: String(params[0]),
        });
        return;
      }

      if (query.startsWith('INSERT INTO device_contact_index_meta')) {
        const errorMessage = params[11];
        meta.set(String(params[0]), {
          contact_count: params[5] === null ? null : Number(params[5]),
          error_message: typeof errorMessage === 'string' ? errorMessage : null,
          last_completed_at: params[8] === null ? null : Number(params[8]),
          last_started_at: params[7] === null ? null : Number(params[7]),
          loaded_count: Number(params[4]),
          next_page_offset: Number(params[6]),
          permission_status: String(params[1]),
          scan_generation: Number(params[3]),
          scan_status: String(params[2]),
          schema_version: Number(params[10]),
          user_id: String(params[0]),
        });
        return;
      }

      if (query.startsWith('DELETE FROM device_contact_index')) {
        const userId = String(params[0]);
        const generation = Number(params[1]);
        for (const [key, row] of contacts.entries()) {
          if (row.user_id === userId && row.scan_generation !== generation) {
            contacts.delete(key);
          }
        }
      }
    }),
    withTransactionAsync: vi.fn(async (callback: () => Promise<void>) => callback()),
  };

  return {
    contacts,
    database,
    meta,
    openDatabaseAsync: vi.fn(async () => database),
  };
});

const contactsMock = vi.hoisted(() => ({
  getContactsAsync: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: sqliteMock.openDatabaseAsync,
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    currentState: 'active',
  },
  NativeModules: {},
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  TurboModuleRegistry: {
    get: vi.fn(() => null),
    getEnforcing: vi.fn(() => ({})),
  },
}));

vi.mock('expo-contacts', () => ({
  Fields: {
    FirstName: 'firstName',
    LastName: 'lastName',
    MiddleName: 'middleName',
    Name: 'name',
    PhoneNumbers: 'phoneNumbers',
  },
  PermissionStatus: {
    DENIED: 'denied',
    GRANTED: 'granted',
  },
  SortTypes: {
    FirstName: 'firstName',
  },
  getContactsAsync: contactsMock.getContactsAsync,
  getPermissionsAsync: vi.fn(async () => ({
    accessPrivileges: 'all',
    canAskAgain: true,
    granted: true,
    status: 'granted',
  })),
}));

vi.mock('@/features/home/add-person-device-contact-cache', () => ({
  readPersistedDeviceContactScanCache: vi.fn(async () => null),
}));

import {
  pauseContactIndexing,
  readContactIndex,
  startContactIndexing,
} from './add-person-contact-index';

function nativeContact(id: string, name: string, phone: string) {
  return {
    id,
    name,
    phoneNumbers: [{ id: `${id}-phone`, label: 'mobile', number: phone }],
  };
}

async function waitForIndexStatus(status: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await readContactIndex({ limit: 10, userId: 'user-a' });
    if (result.status === status) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Timed out waiting for ${status}`);
}

beforeEach(() => {
  sqliteMock.contacts.clear();
  sqliteMock.meta.clear();
  sqliteMock.database.execAsync.mockClear();
  sqliteMock.database.getAllAsync.mockClear();
  sqliteMock.database.getFirstAsync.mockClear();
  sqliteMock.database.runAsync.mockClear();
  sqliteMock.database.withTransactionAsync.mockClear();
  sqliteMock.openDatabaseAsync.mockClear();
  contactsMock.getContactsAsync.mockReset();
});

describe('contact index', () => {
  it('persists contact pages and reads them by local search', async () => {
    contactsMock.getContactsAsync
      .mockResolvedValueOnce({
        data: [nativeContact('contact-ana', 'Ana Ruiz', '3001234567')],
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        data: [nativeContact('contact-ben', 'Ben Mora', '3011234567')],
        hasNextPage: false,
      });

    await startContactIndexing({
      permissionStatus: 'granted',
      reason: 'manual_refresh',
      userId: 'user-a',
    });
    await waitForIndexStatus('ready');

    const result = await readContactIndex({ limit: 10, searchValue: 'ben', userId: 'user-a' });

    expect(result.contacts.map((contact) => contact.alias)).toEqual(['Ben Mora']);
    expect(result.matchingCount).toBe(1);
  });

  it('allows reads beyond the first sheet window', async () => {
    contactsMock.getContactsAsync.mockResolvedValueOnce({
      data: Array.from({ length: 150 }, (_, index) =>
        nativeContact(
          `contact-${index}`,
          `Persona ${String(index).padStart(3, '0')}`,
          `3001234${String(index).padStart(3, '0')}`,
        ),
      ),
      hasNextPage: false,
    });

    await startContactIndexing({
      permissionStatus: 'granted',
      reason: 'manual_refresh',
      userId: 'user-a',
    });
    await waitForIndexStatus('ready');

    const firstWindow = await readContactIndex({ limit: 120, userId: 'user-a' });
    const expandedWindow = await readContactIndex({ limit: 150, userId: 'user-a' });

    expect(firstWindow.contacts).toHaveLength(120);
    expect(firstWindow.matchingCount).toBe(150);
    expect(expandedWindow.contacts).toHaveLength(150);
  });

  it('does not reindex a completed contact index on app active', async () => {
    contactsMock.getContactsAsync.mockResolvedValueOnce({
      data: [nativeContact('contact-ana', 'Ana Ruiz', '3001234567')],
      hasNextPage: false,
    });

    await startContactIndexing({
      permissionStatus: 'granted',
      reason: 'manual_refresh',
      userId: 'user-a',
    });
    await waitForIndexStatus('ready');

    contactsMock.getContactsAsync.mockResolvedValueOnce({
      data: [nativeContact('contact-ben', 'Ben Mora', '3011234567')],
      hasNextPage: false,
    });

    await startContactIndexing({
      permissionStatus: 'granted',
      reason: 'app_active',
      userId: 'user-a',
    });

    const result = await readContactIndex({ limit: 10, userId: 'user-a' });

    expect(contactsMock.getContactsAsync).toHaveBeenCalledTimes(1);
    expect(result.contacts.map((contact) => contact.alias)).toEqual(['Ana Ruiz']);
  });

  it('keeps partial progress when indexing is paused', async () => {
    let releaseSecondPage: (() => void) | null = null;
    const getReleaseSecondPage = () => releaseSecondPage as (() => void) | null;
    contactsMock.getContactsAsync
      .mockResolvedValueOnce({
        data: [nativeContact('contact-ana', 'Ana Ruiz', '3001234567')],
        hasNextPage: true,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseSecondPage = () =>
              resolve({
                data: [nativeContact('contact-ben', 'Ben Mora', '3011234567')],
                hasNextPage: false,
              });
          }),
      );

    await startContactIndexing({
      permissionStatus: 'granted',
      reason: 'manual_refresh',
      userId: 'user-a',
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await readContactIndex({ limit: 10, userId: 'user-a' });
      if (result.contacts.length === 1 && getReleaseSecondPage()) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    pauseContactIndexing('user-a');
    const releasePendingSecondPage = getReleaseSecondPage();
    expect(releasePendingSecondPage).not.toBeNull();
    releasePendingSecondPage?.();
    const paused = await waitForIndexStatus('paused');

    expect(paused.contacts.map((contact) => contact.alias)).toEqual(['Ana Ruiz']);
  });
});
