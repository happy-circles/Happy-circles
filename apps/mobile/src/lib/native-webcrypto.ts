import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

type DigestAlgorithm = string | { readonly name?: string };

interface CryptoShim {
  readonly getRandomValues?: typeof ExpoCrypto.getRandomValues;
  readonly randomUUID?: () => string;
  readonly subtle?: {
    readonly digest?: (algorithm: DigestAlgorithm, data: BufferSource) => Promise<ArrayBuffer>;
  };
}

function normalizeDigestAlgorithm(algorithm: DigestAlgorithm): string {
  const name = typeof algorithm === 'string' ? algorithm : (algorithm.name ?? '');
  return name.toLocaleUpperCase('en-US').replace('_', '-');
}

export function installNativeWebCryptoShim(): void {
  if (Platform.OS === 'web') {
    return;
  }

  const currentCrypto = globalThis.crypto as CryptoShim | undefined;
  if (currentCrypto?.subtle?.digest) {
    return;
  }

  const getRandomValues =
    currentCrypto?.getRandomValues?.bind(currentCrypto) ?? ExpoCrypto.getRandomValues;
  const randomUUID = currentCrypto?.randomUUID?.bind(currentCrypto) ?? ExpoCrypto.randomUUID;
  const nextCrypto = {
    ...currentCrypto,
    getRandomValues,
    randomUUID,
    subtle: {
      ...currentCrypto?.subtle,
      digest: async (algorithm: DigestAlgorithm, data: BufferSource) => {
        if (normalizeDigestAlgorithm(algorithm) !== 'SHA-256') {
          throw new Error('Unsupported digest algorithm');
        }

        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
      },
    },
  };

  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: nextCrypto,
      writable: true,
    });
  } catch {
    (globalThis as unknown as { crypto: CryptoShim }).crypto = nextCrypto;
  }
}
