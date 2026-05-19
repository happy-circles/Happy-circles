import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256',
  },
  digestStringAsync: vi.fn(async (algorithm: string, value: string) => `${algorithm}:${value}`),
}));

import { generateSecureNonce, hashNonceForApple } from './apple-auth';

describe('Apple auth helpers', () => {
  it('hashes the raw nonce before sending it to Apple', async () => {
    await expect(hashNonceForApple('raw-nonce')).resolves.toBe('SHA-256:raw-nonce');
  });

  it('generates non-empty nonce values', () => {
    expect(generateSecureNonce()).toHaveLength(32);
  });
});
