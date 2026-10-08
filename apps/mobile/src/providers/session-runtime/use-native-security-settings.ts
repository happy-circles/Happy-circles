import { useCallback, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  getContactsPermissionStatus,
  requestContactsPermissionStatus,
} from '@/lib/contacts-permissions';
import {
  getLocalNotificationPermissionStatus,
  requestLocalNotificationPermissionStatus,
} from '@/lib/notifications';
import { getBiometricSupport, type BiometricSupportRefreshResult } from '@/lib/security';
import { removeStoredItem, setStoredItem } from '@/lib/storage';
import { NOTIFICATIONS_KEY } from '../session/constants';
import type { SetupPermissionStatus } from '../session/types';
import {
  SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
  withSessionOperationTimeout,
} from './session-operation';
import {
  canCompleteNotificationEnable,
  finishNotificationEnableOnResume,
  refreshBiometricSupportSnapshot,
  type NotificationEnableIntent,
} from './session-security-actions';

export function useNativeSecuritySettings(input: {
  readonly sessionRef: { readonly current: Session | null };
  readonly mountedRef: { readonly current: boolean };
}) {
  const { sessionRef, mountedRef } = input;
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('biometría');
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [contactsPermissionStatus, setContactsPermissionStatus] =
    useState<SetupPermissionStatus>('loading');
  const [notificationsPermissionStatus, setNotificationsPermissionStatus] =
    useState<SetupPermissionStatus>('loading');
  const biometricSupportRef = useRef({ available: false, label: 'biometría' });
  const biometricSupportRefreshRef = useRef<Promise<BiometricSupportRefreshResult> | null>(null);
  const notificationEnableIntentRef = useRef<NotificationEnableIntent | null>(null);
  const notificationEnableIntentIdRef = useRef(0);
  const notificationPreferenceWritesRef = useRef<Promise<void>>(Promise.resolve());

  const applyInitialNativePreferences = useCallback(
    (preferences: {
      readonly notificationsEnabled: boolean;
      readonly biometricAvailable: boolean;
      readonly biometricLabel: string;
      readonly contactsPermissionStatus: SetupPermissionStatus;
      readonly notificationsPermissionStatus: SetupPermissionStatus;
    }) => {
      setNotificationsEnabledState(preferences.notificationsEnabled);
      setBiometricAvailable(preferences.biometricAvailable);
      setBiometricLabel(preferences.biometricLabel);
      setContactsPermissionStatus(preferences.contactsPermissionStatus);
      setNotificationsPermissionStatus(preferences.notificationsPermissionStatus);
      biometricSupportRef.current = {
        available: preferences.biometricAvailable,
        label: preferences.biometricLabel,
      };
    },
    [],
  );

  const cancelNotificationEnableFromSettings = useCallback(() => {
    notificationEnableIntentRef.current = null;
  }, []);

  const refreshBiometricSupport = useCallback((): Promise<BiometricSupportRefreshResult> => {
    if (biometricSupportRefreshRef.current) return biometricSupportRefreshRef.current;
    const request = (async (): Promise<BiometricSupportRefreshResult> => {
      try {
        return await refreshBiometricSupportSnapshot({
          readSupport: () =>
            withSessionOperationTimeout(
              'biometric-support',
              getBiometricSupport(),
              SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
            ),
          previousSupport: () => biometricSupportRef.current,
          applySupport: (support) => {
            biometricSupportRef.current = support;
            if (mountedRef.current) {
              setBiometricAvailable(support.available);
              setBiometricLabel(support.label);
            }
          },
        });
      } finally {
        biometricSupportRefreshRef.current = null;
      }
    })();
    biometricSupportRefreshRef.current = request;
    return request;
  }, [mountedRef]);

  const beginNotificationEnableFromSettings = useCallback(() => {
    notificationEnableIntentIdRef.current += 1;
    notificationEnableIntentRef.current = {
      id: notificationEnableIntentIdRef.current,
      userId: sessionRef.current?.user.id ?? null,
    };
  }, [sessionRef]);

  const persistNotificationPreference = useCallback(
    (enabled: boolean, intent?: NotificationEnableIntent): Promise<void> => {
      const stillRequested = () =>
        !intent ||
        canCompleteNotificationEnable({
          intent,
          currentIntent: notificationEnableIntentRef.current,
          currentUserId: sessionRef.current?.user.id ?? null,
          permissionStatus: 'granted',
        });
      const write = notificationPreferenceWritesRef.current
        .catch(() => undefined)
        .then(async () => {
          if (!stillRequested()) return;
          if (enabled) await setStoredItem(NOTIFICATIONS_KEY, 'true');
          else await removeStoredItem(NOTIFICATIONS_KEY);
          if (stillRequested() && mountedRef.current) setNotificationsEnabledState(enabled);
        });
      notificationPreferenceWritesRef.current = write;
      return write;
    },
    [mountedRef, sessionRef],
  );

  const refreshNativePermissionStatuses = useCallback(async () => {
    const pendingNotificationEnable = notificationEnableIntentRef.current;
    const [contactsResult, notificationsResult] = await Promise.allSettled([
      withSessionOperationTimeout(
        'contacts-permission-status',
        getContactsPermissionStatus(),
        SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
      ),
      withSessionOperationTimeout(
        'notifications-permission-status',
        getLocalNotificationPermissionStatus(),
        SESSION_BOOTSTRAP_TASK_TIMEOUT_MS,
      ),
    ]);
    if (!mountedRef.current) return;
    if (contactsResult.status === 'fulfilled') setContactsPermissionStatus(contactsResult.value);
    if (notificationsResult.status === 'fulfilled')
      setNotificationsPermissionStatus(notificationsResult.value);
    await finishNotificationEnableOnResume({
      intent: pendingNotificationEnable,
      readCurrentIntent: () => notificationEnableIntentRef.current,
      currentUserId: () => sessionRef.current?.user.id ?? null,
      permissionStatus:
        notificationsResult.status === 'fulfilled' ? notificationsResult.value : 'unknown',
      enable: (intent) => persistNotificationPreference(true, intent),
      consume: cancelNotificationEnableFromSettings,
    });
  }, [cancelNotificationEnableFromSettings, mountedRef, persistNotificationPreference, sessionRef]);

  const setNotificationsEnabled = useCallback(
    async (enabled: boolean) => {
      cancelNotificationEnableFromSettings();
      setNotificationsEnabledState(enabled);
      await persistNotificationPreference(enabled);
    },
    [cancelNotificationEnableFromSettings, persistNotificationPreference],
  );

  const requestContactsPermission = useCallback(async () => {
    const nextStatus = await requestContactsPermissionStatus();
    setContactsPermissionStatus(nextStatus);
    if (nextStatus === 'granted') return 'Contactos activados.';
    if (nextStatus === 'limited')
      return 'El sistema compartio solo algunos contactos. Puedes ampliar el acceso despues desde Personas.';
    if (nextStatus === 'unavailable') return 'Contactos no disponibles en este entorno.';
    if (nextStatus === 'denied')
      return 'Contactos bloqueados. Abre Ajustes para permitir el acceso.';
    return 'Puedes seguir sin contactos por ahora.';
  }, []);

  const requestNotificationsPermission = useCallback(async () => {
    cancelNotificationEnableFromSettings();
    const nextStatus = await requestLocalNotificationPermissionStatus();
    setNotificationsPermissionStatus(nextStatus);
    if (nextStatus !== 'granted') {
      await persistNotificationPreference(false);
      if (nextStatus === 'unavailable') return 'Notificaciones no disponibles en este entorno.';
      if (nextStatus === 'denied')
        return 'Notificaciones bloqueadas. Abre Ajustes para activarlas.';
      return 'Puedes seguir sin notificaciones por ahora.';
    }
    await persistNotificationPreference(true);
    return 'Recordatorios activados.';
  }, [cancelNotificationEnableFromSettings, persistNotificationPreference]);

  return {
    biometricAvailable,
    biometricLabel,
    notificationsEnabled,
    contactsPermissionStatus,
    notificationsPermissionStatus,
    applyInitialNativePreferences,
    refreshBiometricSupport,
    refreshNativePermissionStatuses,
    beginNotificationEnableFromSettings,
    cancelNotificationEnableFromSettings,
    setNotificationsEnabled,
    requestContactsPermission,
    requestNotificationsPermission,
  };
}
