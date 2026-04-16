import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

export type ContactsPermissionStatus = 'unavailable' | 'undetermined' | 'denied' | 'granted';

function mapContactsPermissionStatus(
  permission: Pick<Contacts.PermissionResponse, 'granted' | 'canAskAgain'>,
): ContactsPermissionStatus {
  if (permission.granted) {
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
