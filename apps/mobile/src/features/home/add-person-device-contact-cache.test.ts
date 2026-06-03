import { beforeEach, describe, expect, it, vi } from 'vitest';

const sqliteMock = vi.hoisted(() => {
  type Row = {
    readonly contacts_json: string;
    readonly contacts_permission_status: string;
    readonly updated_at: number;
  };

  const rows = new Map<string, Row & { readonly schema_version: number }>();
  const database = {
    execAsync: vi.fn(async () => undefined),
    getFirstAsync: vi.fn(async (_query: string, params: readonly unknown[]) => {
      const row = rows.get(String(params[0]));
      return row?.schema_version === params[1] ? row : null;
    }),
    runAsync: vi.fn(async (query: string, params: readonly unknown[]) => {
      if (/DELETE FROM/.test(query)) {
        rows.delete(String(params[0]));
        return;
      }

      rows.set(String(params[0]), {
        contacts_json: String(params[1]),
        contacts_permission_status: String(params[2]),
        updated_at: Number(params[3]),
        schema_version: Number(params[4]),
      });
    }),
  };

  return {
    database,
    openDatabaseAsync: vi.fn(async () => database),
    rows,
  };
});

const contactsMock = vi.hoisted(() => ({
  getContactsAsync: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: sqliteMock.openDatabaseAsync,
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
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
  SortTypes: {
    FirstName: 'firstName',
  },
  getContactsAsync: contactsMock.getContactsAsync,
}));

import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import {
  clearPersistedDeviceContactScanCache,
  readPersistedDeviceContactScanCache,
  refreshPersistedDeviceContactScanCache,
  writePersistedDeviceContactScanCache,
} from './add-person-device-contact-cache';

function contactCandidate(): ContactCandidate {
  return {
    alias: 'Ana Ruiz',
    contactId: 'contact-ana',
    phoneOptions: [
      {
        id: 'phone-ana',
        label: 'mobile',
        maskedPhone: '***4567',
        phoneE164: '+573001234567',
      },
    ],
    primaryPhone: {
      id: 'phone-ana',
      label: 'mobile',
      maskedPhone: '***4567',
      phoneE164: '+573001234567',
    },
    searchKey: 'ana ruiz +573001234567',
  };
}

beforeEach(() => {
  sqliteMock.rows.clear();
  sqliteMock.database.execAsync.mockClear();
  sqliteMock.database.getFirstAsync.mockClear();
  sqliteMock.database.runAsync.mockClear();
  sqliteMock.openDatabaseAsync.mockClear();
  contactsMock.getContactsAsync.mockReset();
});

describe('device contact scan cache', () => {
  it('stores normalized contacts by app user', async () => {
    const contact = contactCandidate();

    await writePersistedDeviceContactScanCache({
      contacts: [contact],
      contactsPermissionStatus: 'granted',
      userId: 'user-a',
    });

    await writePersistedDeviceContactScanCache({
      contacts: [],
      contactsPermissionStatus: 'limited',
      userId: 'user-b',
    });

    expect(await readPersistedDeviceContactScanCache('user-a')).toMatchObject({
      contacts: [contact],
      contactsPermissionStatus: 'granted',
    });
    expect(await readPersistedDeviceContactScanCache('user-b')).toMatchObject({
      contacts: [],
      contactsPermissionStatus: 'limited',
    });

    await clearPersistedDeviceContactScanCache('user-a');
    expect(await readPersistedDeviceContactScanCache('user-a')).toBeNull();
  });

  it('shares an in-flight native refresh per user', async () => {
    contactsMock.getContactsAsync.mockResolvedValue({
      data: [
        {
          id: 'device-contact-1',
          name: 'Ben Mora',
          phoneNumbers: [{ id: 'phone-1', label: 'mobile', number: '3001234567' }],
        },
      ],
      hasNextPage: false,
    });

    const [first, second] = await Promise.all([
      refreshPersistedDeviceContactScanCache({
        contactsPermissionStatus: 'granted',
        userId: 'user-a',
      }),
      refreshPersistedDeviceContactScanCache({
        contactsPermissionStatus: 'granted',
        userId: 'user-a',
      }),
    ]);

    expect(contactsMock.getContactsAsync).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first[0]?.primaryPhone.phoneE164).toBe('+573001234567');
    expect(await readPersistedDeviceContactScanCache('user-a')).toMatchObject({
      contactsPermissionStatus: 'granted',
    });
  });
});
