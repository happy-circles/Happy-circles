import type * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export function generateSecureNonce(length = 32): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const randomValues = new Uint8Array(length);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let index = 0; index < randomValues.length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
}

export async function hashNonceForApple(rawNonce: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
}

export function buildAppleFullName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null | undefined,
): string | null {
  if (!fullName) {
    return null;
  }

  const normalized = [
    fullName.givenName?.trim(),
    fullName.middleName?.trim(),
    fullName.familyName?.trim(),
  ].filter((part): part is string => Boolean(part));

  if (normalized.length === 0) {
    return null;
  }

  return normalized.join(' ');
}
