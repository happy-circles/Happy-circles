import Constants from 'expo-constants';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { getStoredItem, setStoredItem } from './storage';

const DEVICE_ID_KEY = 'happy_circles.device_id';
const DEVICE_ID_DB_NAME = 'happy-circles-device.db';
const DEVICE_ID_BACKUP_KEY = 'current';

interface DeviceIdRow {
  readonly device_id: string;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DEVICE_ID_DB_NAME).then(async (database) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS device_identity (
          key TEXT PRIMARY KEY NOT NULL,
          device_id TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      return database;
    });
  }

  return databasePromise;
}

function normalizeDeviceId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length >= 8 && normalized.length <= 128 ? normalized : null;
}

async function readBackupDeviceId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  const database = await getDatabase();
  const row = await database.getFirstAsync<DeviceIdRow>(
    'SELECT device_id FROM device_identity WHERE key = ? LIMIT 1',
    DEVICE_ID_BACKUP_KEY,
  );

  return normalizeDeviceId(row?.device_id);
}

async function persistBackupDeviceId(deviceId: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  const database = await getDatabase();
  await database.runAsync(
    `
      INSERT INTO device_identity (key, device_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        device_id = excluded.device_id,
        updated_at = excluded.updated_at
    `,
    DEVICE_ID_BACKUP_KEY,
    deviceId,
    new Date().toISOString(),
  );
}

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
  const existing = normalizeDeviceId(await getStoredItem(DEVICE_ID_KEY));
  if (existing) {
    await persistBackupDeviceId(existing).catch(() => undefined);
    return existing;
  }

  const backedUp = await readBackupDeviceId().catch(() => null);
  if (backedUp) {
    await setStoredItem(DEVICE_ID_KEY, backedUp).catch(() => undefined);
    return backedUp;
  }

  const nextDeviceId = generateDeviceId();
  const persistResults = await Promise.allSettled([
    setStoredItem(DEVICE_ID_KEY, nextDeviceId),
    persistBackupDeviceId(nextDeviceId),
  ]);

  if (persistResults.every((result) => result.status === 'rejected')) {
    throw new Error('No se pudo guardar el identificador de este telefono.');
  }

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
