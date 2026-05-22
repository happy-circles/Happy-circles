import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getStoredItem: vi.fn(),
  setStoredItem: vi.fn(),
}));

const sqliteMocks = vi.hoisted(() => ({
  database: {
    execAsync: vi.fn(),
    getFirstAsync: vi.fn(),
    runAsync: vi.fn(),
  },
  openDatabaseAsync: vi.fn(),
}));

vi.mock('./storage', () => storageMocks);

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: sqliteMocks.openDatabaseAsync,
}));

vi.mock('expo-constants', () => ({
  default: {
    deviceName: 'Pixel',
    expoConfig: { version: '1.0.0' },
    manifest: null,
    manifest2: null,
  },
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

import { getCurrentAppVersion, getCurrentDeviceName, getOrCreateDeviceId } from './device-trust';

describe('device trust helpers', () => {
  beforeEach(() => {
    storageMocks.getStoredItem.mockReset();
    storageMocks.setStoredItem.mockReset();
    sqliteMocks.database.execAsync.mockReset();
    sqliteMocks.database.getFirstAsync.mockReset();
    sqliteMocks.database.runAsync.mockReset();
    sqliteMocks.openDatabaseAsync.mockReset();
    sqliteMocks.openDatabaseAsync.mockResolvedValue(sqliteMocks.database);
    sqliteMocks.database.execAsync.mockResolvedValue(undefined);
    sqliteMocks.database.runAsync.mockResolvedValue(undefined);
    storageMocks.setStoredItem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the SecureStore device id and mirrors it into the backup store', async () => {
    storageMocks.getStoredItem.mockResolvedValueOnce('secure-device-id');

    await expect(getOrCreateDeviceId()).resolves.toBe('secure-device-id');
    expect(sqliteMocks.database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO device_identity'),
      'current',
      'secure-device-id',
      expect.any(String),
    );
  });

  it('restores SecureStore from the backup store when Android returns no device id', async () => {
    storageMocks.getStoredItem.mockResolvedValueOnce(null);
    sqliteMocks.database.getFirstAsync.mockResolvedValueOnce({
      device_id: 'backup-device-id',
    });

    await expect(getOrCreateDeviceId()).resolves.toBe('backup-device-id');
    expect(storageMocks.setStoredItem).toHaveBeenCalledWith(
      'happy_circles.device_id',
      'backup-device-id',
    );
  });

  it('creates and persists a new id only when both local stores are empty', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'generated-device-id',
    });
    storageMocks.getStoredItem.mockResolvedValueOnce(null);
    sqliteMocks.database.getFirstAsync.mockResolvedValueOnce(null);

    await expect(getOrCreateDeviceId()).resolves.toBe('generated-device-id');
    expect(storageMocks.setStoredItem).toHaveBeenCalledWith(
      'happy_circles.device_id',
      'generated-device-id',
    );
    expect(sqliteMocks.database.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO device_identity'),
      'current',
      'generated-device-id',
      expect.any(String),
    );
  });

  it('reads app version and native device name from Expo constants', () => {
    expect(getCurrentAppVersion()).toBe('1.0.0');
    expect(getCurrentDeviceName()).toBe('Pixel');
  });
});
