import { beforeEach, describe, expect, it, vi } from 'vitest';

const permissionMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  presentPicker: vi.fn(),
  requestStatus: vi.fn(),
}));

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Linking: { openSettings: vi.fn() },
}));
vi.mock('@/lib/contacts-permissions', () => ({
  canReadContactsPermissionStatus: (status: string) => status === 'granted' || status === 'limited',
  getContactsPermissionStatus: permissionMock.getStatus,
  presentLimitedContactsAccessPicker: permissionMock.presentPicker,
  requestContactsPermissionStatus: permissionMock.requestStatus,
}));

import { useAddPersonContactPermissionActions } from './add-person-contact-permissions';

beforeEach(() => {
  vi.clearAllMocks();
});

function permissionActions() {
  const loadContacts = vi.fn(async () => undefined);
  return {
    loadContacts,
    actions: useAddPersonContactPermissionActions({
      busyKey: null,
      contactsPermissionStatus: 'limited',
      loadContacts,
      setBusyKey: vi.fn(),
      setContacts: vi.fn(),
      setContactsPermissionStatus: vi.fn(),
      setMessage: vi.fn(),
    }),
  };
}

describe('contact permission recovery', () => {
  it('requests a new scan after adding to the limited selection', async () => {
    permissionMock.presentPicker.mockResolvedValue(['new-contact']);
    permissionMock.getStatus.mockResolvedValue('limited');
    const { actions, loadContacts } = permissionActions();

    await actions.handleExpandLimitedContactsAccess();

    expect(permissionMock.presentPicker).toHaveBeenCalledOnce();
    expect(loadContacts).toHaveBeenCalledWith('permission_granted');
  });

  it('does not reload contacts if access was removed during the picker', async () => {
    permissionMock.presentPicker.mockResolvedValue([]);
    permissionMock.getStatus.mockResolvedValue('denied');
    const { actions, loadContacts } = permissionActions();

    await actions.handleExpandLimitedContactsAccess();

    expect(loadContacts).not.toHaveBeenCalled();
  });

  it('bypasses a previously cached agenda after permission is newly granted', async () => {
    permissionMock.requestStatus.mockResolvedValue('granted');
    const { actions, loadContacts } = permissionActions();

    await actions.requestContactsAccess();

    expect(loadContacts).toHaveBeenCalledWith('permission_granted');
  });
});
