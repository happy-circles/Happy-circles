import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import {
  pauseContactIndexing,
  startContactIndexing,
} from '@/features/home/add-person-contact-index';
import {
  canReadContactsPermissionStatus,
  getContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import { subscribeFirstScreenReady } from '@/lib/performance-metrics';
import { useSession } from '@/providers/session-provider';

const CONTACT_PRELOAD_DELAY_MS = 700;

export function AddPersonContactPreloadBridge() {
  const session = useSession();

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
      pauseContactIndexing(session.userId);
      return undefined;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function startIndexIfActive() {
      if (AppState.currentState !== 'active') {
        pauseContactIndexing(session.userId);
        return;
      }

      void getContactsPermissionStatus()
        .then((currentPermissionStatus) => {
          if (cancelled) {
            return;
          }

          if (!canReadContactsPermissionStatus(currentPermissionStatus)) {
            pauseContactIndexing(session.userId);
            return;
          }

          void startContactIndexing({
            permissionStatus: currentPermissionStatus,
            reason: 'app_active',
            userId: session.userId,
          }).catch(() => {
            return undefined;
          });
        })
        .catch(() => undefined);
    }

    const unsubscribe = subscribeFirstScreenReady(() => {
      timeout = setTimeout(() => {
        startIndexIfActive();
      }, CONTACT_PRELOAD_DELAY_MS);
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (cancelled) {
        return;
      }

      if (nextState === 'active') {
        startIndexIfActive();
        return;
      }

      pauseContactIndexing(session.userId);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      appStateSubscription.remove();
      pauseContactIndexing(session.userId);
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
