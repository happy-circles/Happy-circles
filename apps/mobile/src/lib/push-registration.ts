import { Platform } from 'react-native';

import { getCurrentAppVersion, getCurrentDeviceName } from './device-trust';
import { invokeSupabaseFunction } from './live-data/client';
import { getLocalExpoPushToken } from './notifications';

let lastRegisteredSignature: string | null = null;
let lastDisabledDeviceId: string | null = null;

export async function registerCurrentPushDevice(userId: string, deviceId: string): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  const expoPushToken = await getLocalExpoPushToken();
  if (!expoPushToken) {
    return;
  }

  const signature = [
    userId,
    deviceId,
    expoPushToken,
    Platform.OS,
    getCurrentAppVersion() ?? '',
    getCurrentDeviceName() ?? '',
  ].join('|');

  if (signature === lastRegisteredSignature) {
    return;
  }

  await invokeSupabaseFunction('register-push-token', {
    appVersion: getCurrentAppVersion(),
    deviceId,
    deviceName: getCurrentDeviceName(),
    enabled: true,
    expoPushToken,
    platform: Platform.OS,
  });

  lastDisabledDeviceId = null;
  lastRegisteredSignature = signature;
}

export async function disableCurrentPushDevice(userId: string, deviceId: string): Promise<void> {
  const signature = `${userId}|${deviceId}`;
  if (lastDisabledDeviceId === signature) {
    return;
  }

  await invokeSupabaseFunction('register-push-token', {
    deviceId,
    enabled: false,
  });

  lastDisabledDeviceId = signature;
  lastRegisteredSignature = null;
}
