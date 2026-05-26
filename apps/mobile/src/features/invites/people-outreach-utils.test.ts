import { beforeEach, describe, expect, it, vi } from 'vitest';

const contactsMock = vi.hoisted(() => ({
  getContactsAsync: vi.fn(),
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

import {
  buildManualPhoneE164,
  buildContactPhoneOptions,
  CONTACTS_PAGE_SIZE,
  readContactsPageFromDevice,
} from './people-outreach-utils';

beforeEach(() => {
  contactsMock.getContactsAsync.mockReset();
});

describe('contact phone normalization', () => {
  it('keeps valid E.164 numbers, normalizes Colombian local numbers, and drops short values', () => {
    const options = buildContactPhoneOptions({
      id: 'contact-1',
      name: 'Ana',
      phoneNumbers: [
        { id: 'local-co', label: 'mobile', number: '300 123 4567' },
        { id: 'us', label: 'work', number: '+1 (415) 555-2671' },
        { id: 'short', label: 'other', number: '123' },
        { id: 'too-long', label: 'other', number: '+57 300 123 4567 9999999999999' },
        { id: 'duplicate', label: 'mobile', number: '+57 300 123 4567' },
      ],
    } as never);

    expect(options.map((option) => option.phoneE164)).toEqual(['+573001234567', '+14155552671']);
    expect(options.map((option) => option.label)).toEqual(['mobile', 'work']);
  });

  it('drops manually entered phone numbers that exceed the backend contract', () => {
    expect(buildManualPhoneE164('+57 300 123 4567 9999999999999')).toBeNull();
    expect(buildManualPhoneE164('300 123 4567')).toBe('+573001234567');
  });
});

describe('paged contact reading', () => {
  it('requests sorted contact pages and reports the next offset', async () => {
    contactsMock.getContactsAsync.mockResolvedValueOnce({
      data: [
        {
          id: 'contact-1',
          name: 'Ana',
          phoneNumbers: [{ id: 'phone-1', label: 'mobile', number: '3001234567' }],
        },
      ],
      hasNextPage: true,
    });

    const page = await readContactsPageFromDevice({
      pageOffset: CONTACTS_PAGE_SIZE,
      pageSize: CONTACTS_PAGE_SIZE,
    });

    expect(contactsMock.getContactsAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        pageOffset: CONTACTS_PAGE_SIZE,
        pageSize: CONTACTS_PAGE_SIZE,
        sort: 'firstName',
      }),
    );
    expect(page.contacts).toHaveLength(1);
    expect(page.nextPageOffset).toBe(CONTACTS_PAGE_SIZE + 1);
    expect(page.hasNextPage).toBe(true);
  });
});
