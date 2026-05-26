import Constants from 'expo-constants';
import type * as ExpoNotifications from 'expo-notifications';
import type { EventSubscription, Notification, NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';

import { theme } from '@/lib/theme';

let configured = false;

type NotificationsModule = typeof ExpoNotifications;

const PENDING_NOTIFICATION_CHANNEL_ID = 'happy-pending';
const DAILY_PENDING_REMINDER_KIND = 'daily-pending-reminder';
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

export interface PendingReminderOptions {
  readonly friendCount?: number;
  readonly reminderCount?: number;
  readonly transactionCount?: number;
  readonly unreadCount?: number;
}

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

function getExpoProjectId(): string | null {
  const easConfig = Constants.easConfig as { readonly projectId?: string } | null;
  const expoConfig = Constants.expoConfig as {
    readonly extra?: {
      readonly eas?: {
        readonly projectId?: string;
      };
    };
  } | null;
  const projectId = easConfig?.projectId ?? expoConfig?.extra?.eas?.projectId ?? null;

  return typeof projectId === 'string' && projectId.trim().length > 0 ? projectId.trim() : null;
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

export async function getLocalExpoPushToken(): Promise<string | null> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return null;
  }

  await configureNotifications();

  const permissionStatus = mapNotificationPermissionStatus(
    await Notifications.getPermissionsAsync(),
    Notifications,
  );
  if (permissionStatus !== 'granted') {
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return typeof token.data === 'string' && token.data.trim().length > 0
      ? token.data.trim()
      : null;
  } catch (error) {
    console.warn(
      'Failed to read Expo push token',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export async function cancelScheduledReminders(): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function cancelScheduledPendingReminders(): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduledNotifications
      .filter(isDailyPendingReminderRequest)
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

export async function setLocalNotificationBadgeCount(count: number): Promise<boolean> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return false;
  }

  try {
    return await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch {
    return false;
  }
}

export async function scheduleDailyPendingReminder(
  options: PendingReminderOptions = {},
): Promise<void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }

  const content = pendingReminderContent(options);

  await Notifications.scheduleNotificationAsync({
    content: {
      badge: content.badge,
      body: content.body,
      color: theme.colors.treasure,
      data: { href: '/activity', reminderKind: DAILY_PENDING_REMINDER_KIND },
      interruptionLevel: 'active',
      priority: 'max',
      sound: 'default',
      title: content.title,
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

export function addNotificationReceivedListener(
  listener: (notification: Notification) => void,
): Promise<EventSubscription | null> {
  return loadNotificationsModule().then((Notifications) =>
    Notifications ? Notifications.addNotificationReceivedListener(listener) : null,
  );
}

function pendingReminderContent(options: PendingReminderOptions): {
  readonly badge: number;
  readonly body: string;
  readonly title: string;
} {
  const unreadCount = Math.max(1, Math.floor(options.unreadCount ?? 1));
  const transactionCount = Math.max(0, Math.floor(options.transactionCount ?? 0));
  const friendCount = Math.max(0, Math.floor(options.friendCount ?? 0));
  const reminderCount = Math.max(0, Math.floor(options.reminderCount ?? 0));
  const parts = [
    notificationPartLabel(transactionCount, 'movimiento', 'movimientos'),
    notificationPartLabel(friendCount, 'invitación', 'invitaciones'),
    notificationPartLabel(reminderCount, 'recordatorio', 'recordatorios'),
  ].filter((part): part is string => Boolean(part));

  return {
    badge: unreadCount,
    title:
      unreadCount === 1
        ? 'Tienes una notificación sin ver'
        : `Tienes ${unreadCount > 99 ? '99+' : unreadCount} notificaciones sin ver`,
    body:
      parts.length > 0
        ? `Hay ${formatSpanishList(parts)} por revisar.`
        : unreadCount === 1
          ? 'Hay una novedad pendiente por revisar.'
          : `Hay ${unreadCount} novedades pendientes por revisar.`,
  };
}

function isDailyPendingReminderRequest(request: {
  readonly content: {
    readonly data?: Record<string, unknown>;
    readonly title?: string | null;
  };
}): boolean {
  return (
    request.content.data?.reminderKind === DAILY_PENDING_REMINDER_KIND ||
    (request.content.data?.href === '/activity' &&
      request.content.title === 'Tienes pendientes en Happy Circles')
  );
}

function notificationPartLabel(count: number, singular: string, plural: string): string | null {
  if (count <= 0) {
    return null;
  }

  return `${count} ${count === 1 ? singular : plural}`;
}

function formatSpanishList(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }

  if (parts.length === 2) {
    return `${parts[0]} y ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}
