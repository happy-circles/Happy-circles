import Constants from 'expo-constants';
import type * as ExpoNotifications from 'expo-notifications';
import type { EventSubscription, NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';

import { theme } from '@/lib/theme';

let configured = false;

type NotificationsModule = typeof ExpoNotifications;

const PENDING_NOTIFICATION_CHANNEL_ID = 'happy-pending';
const PENDING_NOTIFICATION_VIBRATION_PATTERN = [0, 250, 160, 250];

interface NotificationSupport {
  readonly supported: boolean;
  readonly reason?: string;
}

export interface NotificationRoute {
  readonly id: string;
  readonly href: string;
}

export type NotificationPermissionStatus = 'unavailable' | 'undetermined' | 'denied' | 'granted';

function isExpoGo(): boolean {
  return String(Constants.appOwnership) === 'expo';
}

export function getNotificationSupport(): NotificationSupport {
  if (Platform.OS === 'web') {
    return {
      supported: false,
      reason: 'Las notificaciones locales no están habilitadas en web para este flujo.',
    };
  }

  if (isExpoGo()) {
    return {
      supported: false,
      reason:
        'En Expo Go esta integración muestra limitaciones. Usa una versión instalada de desarrollo para probar notificaciones sin avisos.',
    };
  }

  return { supported: true };
}

async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  const support = getNotificationSupport();
  if (!support.supported) {
    return null;
  }

  return import('expo-notifications');
}

function mapNotificationPermissionStatus(
  permission: {
    readonly granted: boolean;
    readonly canAskAgain?: boolean;
    readonly ios?: {
      readonly status?: number;
    };
  },
  Notifications: NotificationsModule,
): NotificationPermissionStatus {
  if (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return 'granted';
  }

  if (permission.canAskAgain === false) {
    return 'denied';
  }

  return 'undetermined';
}

export async function configureNotifications(): Promise<void> {
  if (configured) {
    return;
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(PENDING_NOTIFICATION_CHANNEL_ID, {
      enableLights: true,
      enableVibrate: true,
      importance: Notifications.AndroidImportance.MAX,
      lightColor: theme.colors.treasure,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      name: 'Happy Circles pendientes',
      showBadge: true,
      sound: 'default',
      vibrationPattern: PENDING_NOTIFICATION_VIBRATION_PATTERN,
    });
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      priority: Notifications.AndroidNotificationPriority.MAX,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  configured = true;
}

export async function getLocalNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return 'unavailable';
  }

  const current = await Notifications.getPermissionsAsync();
  return mapNotificationPermissionStatus(current, Notifications);
}

export async function requestLocalNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return 'unavailable';
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }

  const next = await Notifications.requestPermissionsAsync();
  return mapNotificationPermissionStatus(next, Notifications);
}

export async function requestLocalNotificationPermission(): Promise<boolean> {
  return (await requestLocalNotificationPermissionStatus()) === 'granted';
}

export async function cancelScheduledReminders(): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleDailyPendingReminder(): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      badge: 1,
      body: 'Revisa solicitudes y saldos que esperan tu acción.',
      color: theme.colors.treasure,
      data: { href: '/activity' },
      interruptionLevel: 'active',
      priority: 'max',
      sound: 'default',
      title: 'Tienes pendientes en Happy Circles',
      vibrate: PENDING_NOTIFICATION_VIBRATION_PATTERN,
    },
    trigger: {
      channelId: PENDING_NOTIFICATION_CHANNEL_ID,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 60 * 60 * 24,
      repeats: true,
    },
  });
}

export async function scheduleDeferredReminder(
  title: string,
  body: string,
  href: string,
  minutes = 120,
): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      badge: 1,
      title,
      body,
      color: theme.colors.treasure,
      data: { href },
      interruptionLevel: 'active',
      priority: 'max',
      sound: 'default',
      vibrate: PENDING_NOTIFICATION_VIBRATION_PATTERN,
    },
    trigger: {
      channelId: PENDING_NOTIFICATION_CHANNEL_ID,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(minutes * 60, 60),
    },
  });
}

export function notificationRouteFromResponse(
  response: NotificationResponse | null | undefined,
): NotificationRoute | null {
  if (!response) {
    return null;
  }

  const href = response.notification.request.content.data?.href;
  if (typeof href !== 'string' || href.trim().length === 0) {
    return null;
  }

  return {
    id: response.notification.request.identifier,
    href,
  };
}

export async function getLastNotificationRoute(): Promise<NotificationRoute | null> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return null;
  }

  return notificationRouteFromResponse(await Notifications.getLastNotificationResponseAsync());
}

export function addNotificationResponseListener(
  listener: (response: NotificationResponse) => void,
): Promise<EventSubscription | null> {
  return loadNotificationsModule().then((Notifications) =>
    Notifications ? Notifications.addNotificationResponseReceivedListener(listener) : null,
  );
}
