import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SECURE_STORE_CHUNK_SIZE = 1800;
const SECURE_STORE_CHUNKED_VALUE_PREFIX = 'happy-circles:secure-store-chunks:v1:';
const SECURE_STORE_VALID_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

function canUseWebStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined';
}

function nativeSecureStoreKey(key: string): string {
  if (SECURE_STORE_VALID_KEY_PATTERN.test(key)) {
    return key;
  }

  const encodedKey = Array.from(key)
    .map((character) => character.codePointAt(0)?.toString(16).padStart(4, '0') ?? '0000')
    .join('.');

  return `happy_circles.key.${encodedKey}`;
}

function chunkKey(nativeKey: string, index: number): string {
  return `${nativeKey}.chunk.${index}`;
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

async function removeStoredChunks(nativeKey: string, chunkCount: number | null): Promise<void> {
  if (!chunkCount) {
    return;
  }

  await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(nativeKey, index)),
    ),
  );
}

async function getNativeStoredItem(key: string): Promise<string | null> {
  const nativeKey = nativeSecureStoreKey(key);
  const storedValue = await SecureStore.getItemAsync(nativeKey);
  if (!storedValue?.startsWith(SECURE_STORE_CHUNKED_VALUE_PREFIX)) {
    return storedValue;
  }

  const chunkCount = parseChunkCount(storedValue);
  if (!chunkCount) {
    await SecureStore.deleteItemAsync(nativeKey);
    return null;
  }

  const chunks = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(nativeKey, index)),
    ),
  );

  if (chunks.some((chunk) => chunk === null)) {
    await removeNativeStoredItem(key);
    return null;
  }

  return chunks.join('');
}

async function setNativeStoredItem(key: string, value: string): Promise<void> {
  const nativeKey = nativeSecureStoreKey(key);
  const previousValue = await SecureStore.getItemAsync(nativeKey);
  const previousChunkCount = previousValue ? parseChunkCount(previousValue) : null;

  if (value.length <= SECURE_STORE_CHUNK_SIZE) {
    await SecureStore.setItemAsync(nativeKey, value);
    await removeStoredChunks(nativeKey, previousChunkCount);
    return;
  }

  const chunks = splitIntoChunks(value);

  await Promise.all(
    chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(nativeKey, index), chunk)),
  );
  await SecureStore.setItemAsync(nativeKey, `${SECURE_STORE_CHUNKED_VALUE_PREFIX}${chunks.length}`);

  if (previousChunkCount && previousChunkCount > chunks.length) {
    await Promise.all(
      Array.from({ length: previousChunkCount - chunks.length }, (_, index) =>
        SecureStore.deleteItemAsync(chunkKey(nativeKey, chunks.length + index)),
      ),
    );
  }
}

async function removeNativeStoredItem(key: string): Promise<void> {
  const nativeKey = nativeSecureStoreKey(key);
  const previousValue = await SecureStore.getItemAsync(nativeKey);
  const previousChunkCount = previousValue ? parseChunkCount(previousValue) : null;

  await SecureStore.deleteItemAsync(nativeKey);
  await removeStoredChunks(nativeKey, previousChunkCount);
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
