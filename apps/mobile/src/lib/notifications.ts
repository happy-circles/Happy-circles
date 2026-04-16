import Constants from 'expo-constants';
import { Platform } from 'react-native';

let configured = false;

type NotificationsModule = typeof import('expo-notifications');
type NotificationResponse = import('expo-notifications').NotificationResponse;
type EventSubscription = import('expo-notifications').EventSubscription;

interface NotificationSupport {
  readonly supported: boolean;
  readonly reason?: string;
}

export type NotificationPermissionStatus = 'unavailable' | 'undetermined' | 'denied' | 'granted';

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export function getNotificationSupport(): NotificationSupport {
  if (Platform.OS === 'web') {
    return {
      supported: false,
      reason: 'Las notificaciones locales no estan habilitadas en web para este flujo.',
    };
  }

  if (isExpoGo()) {
    return {
      supported: false,
      reason: 'En Expo Go esta integracion muestra limitaciones. Usa un development build para probar notificaciones sin warnings.',
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

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
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
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
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
      title: 'Tienes pendientes en Happy Circles',
      body: 'Revisa solicitudes y saldos que esperan tu accion.',
      data: { href: '/activity' },
    },
    trigger: {
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
      title,
      body,
      data: { href },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(minutes * 60, 60),
    },
  });
}

export function addNotificationResponseListener(
  listener: (response: NotificationResponse) => void,
): Promise<EventSubscription | null> {
  return loadNotificationsModule().then((Notifications) =>
    Notifications ? Notifications.addNotificationResponseReceivedListener(listener) : null,
  );
}
