import { useEffect, useRef } from 'react';
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
import {
  activateContactDiscoveryRuntime,
  disposeContactDiscoveryRuntime,
  suspendContactDiscoveryRuntime,
  replaceContactDiscoveryKnownPhones,
} from '@/lib/contact-discovery-runtime';
import { clearWarmContactScanCache } from './add-person-contact-scan-cache';
import { bootstrapWarmContactSnapshot } from './add-person-contact-warm-bootstrap';

const CONTACT_PRELOAD_DELAY_MS = 700;

export function AddPersonContactPreloadBridge() {
  const session = useSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;

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
      disposeContactDiscoveryRuntime(session.userId);
      clearWarmContactScanCache(session.userId);
      return undefined;
    }

    let lastPermissionStatus = knownPermissionStatus;
    let cancelled = false;
    let activationVersion = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function startIndexIfActive() {
      const version = ++activationVersion;
      const isAuthorized = () =>
        !cancelled &&
        version === activationVersion &&
        AppState.currentState === 'active' &&
        sessionRef.current.userId === session.userId &&
        sessionRef.current.status === 'signed_in_unlocked' &&
        sessionRef.current.accountAccessState === 'active';
      if (AppState.currentState !== 'active') {
        pauseContactIndexing(session.userId);
        suspendContactDiscoveryRuntime(session.userId!);
        return;
      }

      void getContactsPermissionStatus()
        .then(async (currentPermissionStatus) => {
          if (!isAuthorized()) {
            return;
          }

          if (!canReadContactsPermissionStatus(currentPermissionStatus)) {
            pauseContactIndexing(session.userId);
            disposeContactDiscoveryRuntime(session.userId!);
            clearWarmContactScanCache(session.userId);
            return;
          }

          if (lastPermissionStatus !== currentPermissionStatus) {
            replaceContactDiscoveryKnownPhones(session.userId!, []);
            clearWarmContactScanCache(session.userId);
            lastPermissionStatus = currentPermissionStatus;
          }
          await bootstrapWarmContactSnapshot({
            userId: session.userId!,
            permissionStatus: currentPermissionStatus,
            isAuthorized,
          }).catch(() => null);
          const latestPermissionStatus = await getContactsPermissionStatus();
          if (!isAuthorized()) return;
          if (latestPermissionStatus !== currentPermissionStatus) {
            clearWarmContactScanCache(session.userId);
            pauseContactIndexing(session.userId);
            disposeContactDiscoveryRuntime(session.userId!);
            return;
          }
          activateContactDiscoveryRuntime(session.userId!);
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            if (!isAuthorized()) return;
            void startContactIndexing({
              reason: 'app_active',
              userId: session.userId,
            }).catch(() => undefined);
          }, CONTACT_PRELOAD_DELAY_MS);
        })
        .catch(() => undefined);
    }

    const unsubscribe = subscribeFirstScreenReady(() => {
      startIndexIfActive();
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
      suspendContactDiscoveryRuntime(session.userId!);
      activationVersion += 1;
    });

    return () => {
      cancelled = true;
      activationVersion += 1;
      unsubscribe();
      appStateSubscription.remove();
      pauseContactIndexing(session.userId);
      disposeContactDiscoveryRuntime(session.userId!);
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
