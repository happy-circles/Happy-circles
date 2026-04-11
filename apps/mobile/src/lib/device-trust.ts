import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getStoredItem, setStoredItem } from './storage';

const DEVICE_ID_KEY = 'happy_circles.device_id';

function generateDeviceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const randomValues = new Uint8Array(24);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let index = 0; index < randomValues.length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getStoredItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextDeviceId = generateDeviceId();
  await setStoredItem(DEVICE_ID_KEY, nextDeviceId);
  return nextDeviceId;
}

export function getCurrentAppVersion(): string | null {
  const legacyManifest = Constants.manifest as { readonly version?: string } | null;
  const embeddedManifest = Constants.manifest2 as {
    readonly extra?: {
      readonly expoClient?: {
        readonly version?: string;
      };
    };
  } | null;

  return (
    Constants.expoConfig?.version ??
    embeddedManifest?.extra?.expoClient?.version ??
    legacyManifest?.version ??
    null
  );
}

export function getCurrentDeviceName(): string | null {
  const runtimeName =
    typeof Constants.deviceName === 'string' && Constants.deviceName.trim().length > 0
      ? Constants.deviceName.trim()
      : null;

  if (runtimeName) {
    return runtimeName;
  }

  return Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Web';
}
