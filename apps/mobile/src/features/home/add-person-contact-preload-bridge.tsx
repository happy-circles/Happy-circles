import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import {
  clearPersistedDeviceContactScanCache,
  refreshPersistedDeviceContactScanCache,
} from '@/features/home/add-person-device-contact-cache';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import { subscribeFirstScreenReady } from '@/lib/performance-metrics';
import { useSession } from '@/providers/session-provider';

const CONTACT_PRELOAD_DELAY_MS = 700;

export function AddPersonContactPreloadBridge() {
  const session = useSession();
  const lastPreloadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      session.status !== 'signed_in_unlocked' ||
      session.accountAccessState !== 'active' ||
      !session.userId
    ) {
      return undefined;
    }

    const knownPermissionStatus = session.setupState.contactsPermissionStatus;
    if (knownPermissionStatus === 'loading') {
      return undefined;
    }

    if (!canReadContactsPermissionStatus(knownPermissionStatus)) {
      if (knownPermissionStatus === 'denied' || knownPermissionStatus === 'unavailable') {
        void clearPersistedDeviceContactScanCache(session.userId).catch(() => undefined);
      }
      return undefined;
    }

    const preloadKey = `${session.userId}:${knownPermissionStatus}`;
    if (lastPreloadKeyRef.current === preloadKey) {
      return undefined;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = subscribeFirstScreenReady(() => {
      timeout = setTimeout(() => {
        void getContactsPermissionStatus()
          .then((currentPermissionStatus) => {
            if (cancelled) {
              return;
            }

            if (!canReadContactsPermissionStatus(currentPermissionStatus)) {
              lastPreloadKeyRef.current = null;
              void clearPersistedDeviceContactScanCache(session.userId).catch(() => undefined);
              return;
            }

            lastPreloadKeyRef.current = preloadKey;
            void refreshPersistedDeviceContactScanCache({
              contactsPermissionStatus: currentPermissionStatus,
              userId: session.userId,
            }).catch(() => {
              if (!cancelled) {
                lastPreloadKeyRef.current = null;
              }
            });
          })
          .catch(() => undefined);
      }, CONTACT_PRELOAD_DELAY_MS);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [
    session.accountAccessState,
    session.setupState.contactsPermissionStatus,
    session.status,
    session.userId,
  ]);

  return null;
}
