import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function canUseWebStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined';
}

export async function getStoredItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return canUseWebStorage() ? globalThis.localStorage.getItem(key) : null;
  }

  return SecureStore.getItemAsync(key);
}

export async function setStoredItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (canUseWebStorage()) {
      globalThis.localStorage.setItem(key, value);
    }
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function removeStoredItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (canUseWebStorage()) {
      globalThis.localStorage.removeItem(key);
    }
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
