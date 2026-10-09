import * as Crypto from 'expo-crypto';
import { onlineManager } from '@tanstack/react-query';
import { ContactDiscoveryCoordinator } from '@/lib/contact-discovery-coordinator';
import {
  isContactRealtimeReady,
  readContactResolutions,
  subscribeContactRealtime,
  subscribeContactResolutions,
} from '@/lib/contact-resolution-state';
import type { ContactResolutionPriority } from '@/lib/contact-resolution-scheduler';
import {
  beginContactDiscoveryRecovery,
  disposeContactResolutionUser,
  manageContactDiscovery,
  registerContactDiscoveryPhoneWatches,
  removeContactDiscoveryPhoneWatches,
  resolveContactPhones,
  setContactDiscoverySession,
  synchronizeContactDiscoveryPhones,
  restoreContactDiscoveryPhones,
} from '@/features/home/contact-resolution-service';
import { updateWarmContactScanTargetCache } from '@/features/home/add-person-contact-scan-cache';

type Runtime = { coordinator: ContactDiscoveryCoordinator; unsubscribe: () => void };
const runtimes = new Map<string, Runtime>();

function runtimeFor(userId: string) {
  let runtime = runtimes.get(userId);
  if (!runtime) {
    const coordinator = new ContactDiscoveryCoordinator({
      createSessionId: () => Crypto.randomUUID(),
      isConnected: () => onlineManager.isOnline(),
      isRealtimeReady: () => isContactRealtimeReady(userId),
      setSession: (sessionId) => setContactDiscoverySession(userId, sessionId),
      beginRecovery: () => beginContactDiscoveryRecovery(userId),
      register: (phones, priority) =>
        registerContactDiscoveryPhoneWatches(userId, phones, priority),
      resolve: (phones, priority) => resolveContactPhones(userId, phones, priority),
      synchronize: (phones, priority) =>
        synchronizeContactDiscoveryPhones(userId, phones, priority),
      renew: (sessionId) => manageContactDiscovery(sessionId, 'renew', userId),
      stop: (sessionId) => manageContactDiscovery(sessionId, 'stop', userId),
      remove: (phones) => removeContactDiscoveryPhoneWatches(userId, phones),
    });
    const unsubscribeRealtime = subscribeContactRealtime(userId, () =>
      coordinator.connectionChanged(),
    );
    const unsubscribeOnline = onlineManager.subscribe(() => coordinator.connectionChanged());
    const unsubscribeRows = subscribeContactResolutions(
      userId,
      ({ invalidatedPhones, priority }) => {
        updateWarmContactScanTargetCache(userId, readContactResolutions(userId));
        if (invalidatedPhones.length) coordinator.handleInvalidation(invalidatedPhones, priority);
      },
    );
    runtime = {
      coordinator,
      unsubscribe: () => {
        unsubscribeRealtime();
        unsubscribeOnline();
        unsubscribeRows();
      },
    };
    runtimes.set(userId, runtime);
  }
  return runtime.coordinator;
}

/** Called only after the foreground app has confirmed contacts permission. */
export function activateContactDiscoveryRuntime(userId: string) {
  runtimeFor(userId).activate();
}

export function suspendContactDiscoveryRuntime(userId: string) {
  runtimes.get(userId)?.coordinator.suspend();
}

export function disposeContactDiscoveryRuntime(userId: string) {
  const runtime = runtimes.get(userId);
  runtime?.coordinator.dispose();
  runtime?.unsubscribe();
  runtimes.delete(userId);
  disposeContactResolutionUser(userId);
}

export function setContactDiscoveryKnownPhones(
  userId: string,
  phones: readonly string[],
  priority: ContactResolutionPriority = 'background',
) {
  const runtime = runtimes.get(userId);
  if (!runtime) return;
  restoreContactDiscoveryPhones(userId, phones);
  runtime.coordinator.addPhones(phones, priority);
}

export function setContactDiscoveryVisiblePhones(userId: string, phones: readonly string[]) {
  runtimes.get(userId)?.coordinator.setVisiblePhones(phones);
}

export function replaceContactDiscoveryKnownPhones(userId: string, phones: readonly string[]) {
  const runtime = runtimes.get(userId);
  if (!runtime) return;
  restoreContactDiscoveryPhones(userId, phones);
  runtime.coordinator.replaceKnownPhones(phones);
}
