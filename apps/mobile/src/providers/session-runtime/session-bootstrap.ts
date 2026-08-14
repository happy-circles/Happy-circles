import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { getContactsPermissionStatus } from '@/lib/contacts-permissions';
import { getLocalNotificationPermissionStatus } from '@/lib/notifications';
import { getBiometricSupport } from '@/lib/security';
import { getStoredItem } from '@/lib/storage';
import {
  BIOMETRICS_KEY,
  NOTIFICATIONS_KEY,
} from '../session/constants';
import { readRememberedAccountSnapshot } from '../session/remembered-account';
import type { RememberedAccountSnapshot, SetupPermissionStatus } from '../session/types';
import {
  SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
  settledValueOr,
  withSessionOperationTimeout,
} from './session-operation';

export interface SessionBootstrapPreferences {
  readonly appleSignInAvailable: boolean;
  readonly biometricAvailable: boolean;
  readonly biometricLabel: string;
  readonly biometricsEnabled: boolean;
  readonly contactsPermissionStatus: SetupPermissionStatus;
  readonly notificationsEnabled: boolean;
  readonly notificationsPermissionStatus: SetupPermissionStatus;
  readonly rememberedAccount: RememberedAccountSnapshot | null;
}

export async function readSessionBootstrapPreferences(): Promise<SessionBootstrapPreferences> {
  const [
    biometricResult,
    notificationResult,
    supportResult,
    appleAvailableResult,
    contactsResult,
    notificationsPermissionResult,
    rememberedResult,
  ] = await Promise.allSettled([
    withSessionOperationTimeout(
      'read-biometric-preference',
      getStoredItem(BIOMETRICS_KEY),
      SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
    ),
    withSessionOperationTimeout(
      'read-notification-preference',
      getStoredItem(NOTIFICATIONS_KEY),
      SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
    ),
    withSessionOperationTimeout(
      'read-biometric-support',
      getBiometricSupport(),
      SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
    ),
    Platform.OS === 'ios'
      ? withSessionOperationTimeout(
          'read-apple-auth-support',
          AppleAuthentication.isAvailableAsync(),
          SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
        )
      : Promise.resolve(false),
    withSessionOperationTimeout(
      'read-contacts-permission',
      getContactsPermissionStatus(),
      SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
    ),
    withSessionOperationTimeout(
      'read-notifications-permission',
      getLocalNotificationPermissionStatus(),
      SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
    ),
    withSessionOperationTimeout(
      'read-remembered-account',
      readRememberedAccountSnapshot(),
      SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
    ),
  ]);

  const biometricValue = settledValueOr(biometricResult, null);
  const notificationValue = settledValueOr(notificationResult, null);
  const support = settledValueOr(supportResult, {
    available: false,
    label: 'biometría',
  });

  return {
    appleSignInAvailable: settledValueOr(appleAvailableResult, false),
    biometricAvailable: support.available,
    biometricLabel: support.label,
    biometricsEnabled: biometricValue === 'true',
    contactsPermissionStatus: settledValueOr(contactsResult, 'unavailable'),
    notificationsEnabled: notificationValue === 'true',
    notificationsPermissionStatus: settledValueOr(notificationsPermissionResult, 'unavailable'),
    rememberedAccount: settledValueOr(rememberedResult, null),
  };
}
