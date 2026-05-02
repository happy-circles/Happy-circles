import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SECURE_STORE_CHUNK_SIZE = 1800;
const SECURE_STORE_CHUNKED_VALUE_PREFIX = 'happy-circles:secure-store-chunks:v1:';

function canUseWebStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined';
}

function chunkKey(key: string, index: number): string {
  return `${key}:chunk:${index}`;
}

function splitIntoChunks(value: string): string[] {
  const chunks: string[] = [];

  for (let start = 0; start < value.length; start += SECURE_STORE_CHUNK_SIZE) {
    chunks.push(value.slice(start, start + SECURE_STORE_CHUNK_SIZE));
  }

  return chunks;
}

function parseChunkCount(value: string): number | null {
  if (!value.startsWith(SECURE_STORE_CHUNKED_VALUE_PREFIX)) {
    return null;
  }

  const chunkCount = Number.parseInt(value.slice(SECURE_STORE_CHUNKED_VALUE_PREFIX.length), 10);

  return Number.isInteger(chunkCount) && chunkCount > 0 ? chunkCount : null;
}

async function removeStoredChunks(key: string, chunkCount: number | null): Promise<void> {
  if (!chunkCount) {
    return;
  }

  await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index)),
    ),
  );
}

async function getNativeStoredItem(key: string): Promise<string | null> {
  const storedValue = await SecureStore.getItemAsync(key);
  if (!storedValue?.startsWith(SECURE_STORE_CHUNKED_VALUE_PREFIX)) {
    return storedValue;
  }

  const chunkCount = parseChunkCount(storedValue);
  if (!chunkCount) {
    await SecureStore.deleteItemAsync(key);
    return null;
  }

  const chunks = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, index)),
    ),
  );

  if (chunks.some((chunk) => chunk === null)) {
    await removeNativeStoredItem(key);
    return null;
  }

  return chunks.join('');
}

async function setNativeStoredItem(key: string, value: string): Promise<void> {
  const previousValue = await SecureStore.getItemAsync(key);
  const previousChunkCount = previousValue ? parseChunkCount(previousValue) : null;

  if (value.length <= SECURE_STORE_CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value);
    await removeStoredChunks(key, previousChunkCount);
    return;
  }

  const chunks = splitIntoChunks(value);

  await Promise.all(
    chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
  );
  await SecureStore.setItemAsync(key, `${SECURE_STORE_CHUNKED_VALUE_PREFIX}${chunks.length}`);

  if (previousChunkCount && previousChunkCount > chunks.length) {
    await Promise.all(
      Array.from({ length: previousChunkCount - chunks.length }, (_, index) =>
        SecureStore.deleteItemAsync(chunkKey(key, chunks.length + index)),
      ),
    );
  }
}

async function removeNativeStoredItem(key: string): Promise<void> {
  const previousValue = await SecureStore.getItemAsync(key);
  const previousChunkCount = previousValue ? parseChunkCount(previousValue) : null;

  await SecureStore.deleteItemAsync(key);
  await removeStoredChunks(key, previousChunkCount);
}

async function getPlatformStoredItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return canUseWebStorage() ? globalThis.localStorage.getItem(key) : null;
  }

  return getNativeStoredItem(key);
}

async function setPlatformStoredItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (canUseWebStorage()) {
      globalThis.localStorage.setItem(key, value);
    }
    return;
  }

  await setNativeStoredItem(key, value);
}

async function removePlatformStoredItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (canUseWebStorage()) {
      globalThis.localStorage.removeItem(key);
    }
    return;
  }

  await removeNativeStoredItem(key);
}

export const authStorageAdapter = {
  getItem(key: string) {
    if (Platform.OS === 'web') {
      return Promise.resolve(canUseWebStorage() ? globalThis.localStorage.getItem(key) : null);
    }

    return getNativeStoredItem(key);
  },
  setItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      if (canUseWebStorage()) {
        globalThis.localStorage.setItem(key, value);
      }
      return Promise.resolve();
    }

    return setNativeStoredItem(key, value);
  },
  removeItem(key: string) {
    if (Platform.OS === 'web') {
      if (canUseWebStorage()) {
        globalThis.localStorage.removeItem(key);
      }
      return Promise.resolve();
    }

    return removeNativeStoredItem(key);
  },
};

export async function getStoredItem(key: string): Promise<string | null> {
  return getPlatformStoredItem(key);
}

export async function setStoredItem(key: string, value: string): Promise<void> {
  await setPlatformStoredItem(key, value);
}

export async function removeStoredItem(key: string): Promise<void> {
  await removePlatformStoredItem(key);
}
