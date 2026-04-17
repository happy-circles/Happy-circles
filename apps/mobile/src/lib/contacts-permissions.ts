import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

export type ContactsPermissionStatus =
  | 'unavailable'
  | 'undetermined'
  | 'denied'
  | 'limited'
  | 'granted';

function mapContactsPermissionStatus(
  permission: Pick<Contacts.ContactsPermissionResponse, 'granted' | 'canAskAgain' | 'accessPrivileges'>,
): ContactsPermissionStatus {
  if (permission.granted) {
    if (permission.accessPrivileges === 'limited') {
      return 'limited';
    }

    return 'granted';
  }

  if (permission.canAskAgain === false) {
    return 'denied';
  }

  return 'undetermined';
}

export async function getContactsPermissionStatus(): Promise<ContactsPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }

  const permission = await Contacts.getPermissionsAsync();
  return mapContactsPermissionStatus(permission);
}

export async function requestContactsPermissionStatus(): Promise<ContactsPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }

  const current = await Contacts.getPermissionsAsync();
  if (current.granted) {
    return 'granted';
  }

  const next = await Contacts.requestPermissionsAsync();
  return mapContactsPermissionStatus(next);
}

export function canReadContactsPermissionStatus(status: ContactsPermissionStatus): boolean {
  return status === 'granted' || status === 'limited';
}

export async function presentLimitedContactsAccessPicker(): Promise<readonly string[]> {
  if (Platform.OS === 'web' || typeof Contacts.presentAccessPickerAsync !== 'function') {
    return [];
  }

  return Contacts.presentAccessPickerAsync();
}
