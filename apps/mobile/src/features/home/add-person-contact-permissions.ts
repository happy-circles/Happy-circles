import type { Dispatch, SetStateAction } from 'react';
import { Alert, Linking } from 'react-native';

import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
  presentLimitedContactsAccessPicker,
  requestContactsPermissionStatus,
  type ContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import type { ContactCandidate } from '@/features/invites/people-outreach-utils';

function openContactsSettings() {
  Alert.alert(
    'Permiso de contactos bloqueado',
    'Abre Ajustes y permite contactos para encontrar personas desde tu agenda.',
    [
      { style: 'cancel', text: 'Ahora no' },
      { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
    ],
  );
}

export function useAddPersonContactPermissionActions({
  busyKey,
  contactsPermissionStatus,
  loadContacts,
  setBusyKey,
  setContacts,
  setContactsPermissionStatus,
  setMessage,
}: {
  readonly busyKey: string | null;
  readonly contactsPermissionStatus: ContactsPermissionStatus;
  readonly loadContacts: () => Promise<void>;
  readonly setBusyKey: Dispatch<SetStateAction<string | null>>;
  readonly setContacts: Dispatch<SetStateAction<readonly ContactCandidate[]>>;
  readonly setContactsPermissionStatus: Dispatch<SetStateAction<ContactsPermissionStatus>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
}) {
  async function requestContactsAccess() {
    if (busyKey) {
      return;
    }

    setBusyKey('request-contacts');
    setMessage(null);

    try {
      const nextStatus = await requestContactsPermissionStatus();
      setContactsPermissionStatus(nextStatus);

      if (!canReadContactsPermissionStatus(nextStatus)) {
        setContacts([]);
        setMessage(
          nextStatus === 'denied'
            ? 'Contactos bloqueados. Puedes activarlos en Ajustes.'
            : 'Puedes seguir conectando en persona con QR.',
        );
        if (nextStatus === 'denied') {
          openContactsSettings();
        }
        return;
      }

      setMessage(
        nextStatus === 'limited'
          ? 'Tu telefono compartio contactos limitados. Los estamos cargando.'
          : 'Tu agenda se esta cargando.',
      );
      void loadContacts();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo abrir el permiso de contactos.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function handleExpandLimitedContactsAccess() {
    if (busyKey || contactsPermissionStatus !== 'limited') {
      return;
    }

    setBusyKey('expand-contacts');
    setMessage(null);

    try {
      await presentLimitedContactsAccessPicker();
      const nextStatus = await getContactsPermissionStatus();
      setContactsPermissionStatus(nextStatus);

      if (!canReadContactsPermissionStatus(nextStatus)) {
        setContacts([]);
        setMessage('La agenda dejo de estar disponible. Puedes seguir con QR en persona.');
        return;
      }

      setMessage('Actualizando la agenda compartida.');
      void loadContacts();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudo ampliar el acceso a tus contactos.',
      );
    } finally {
      setBusyKey(null);
    }
  }

  return {
    handleExpandLimitedContactsAccess,
    requestContactsAccess,
  };
}
