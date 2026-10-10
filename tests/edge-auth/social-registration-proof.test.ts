import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  readSocialRegistrationAudiences,
  verifySocialRegistrationCredential,
} from '../../supabase/functions/_shared/social-registration-proof';

const now = 1_790_000_000;
const configuration = { googleAudiences: ['google-app'], appleAudiences: ['com.happycircles.app'] };
let signingPair: CryptoKeyPair;
let publicKey: JsonWebKey & { kid: string };

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

async function sign(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<string> {
  const headerPart = base64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: 'test-key', ...header })),
  );
  const payloadPart = base64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const content = `${headerPart}.${payloadPart}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingPair.privateKey,
    new TextEncoder().encode(content),
  );
  return `${content}.${base64Url(new Uint8Array(signature))}`;
}

function googleClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: 'google-app',
    sub: 'google-subject',
    email: 'Person@Example.com',
    email_verified: true,
    iat: now,
    exp: now + 600,
    ...overrides,
  };
}

function options() {
  return { nowSeconds: now, getSigningKeys: vi.fn(async () => [publicKey]) };
}

beforeAll(async () => {
  signingPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  publicKey = {
    ...(await crypto.subtle.exportKey('jwk', signingPair.publicKey)),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  };
});

describe('social registration identity proof', () => {
  it('verifies the signature and returns only the identity needed for the private permit', async () => {
    const result = await verifySocialRegistrationCredential(
      { provider: 'google', idToken: await sign(googleClaims()) },
      configuration,
      options(),
    );
    expect(result).toEqual({
      provider: 'google',
      subject: 'google-subject',
      email: 'person@example.com',
      expiresAt: new Date((now + 600) * 1000).toISOString(),
    });
    expect(result).not.toHaveProperty('idToken');
  });

  it('rejects a payload changed after signing instead of trusting decoded email or subject', async () => {
    const token = await sign(googleClaims());
    const parts = token.split('.');
    parts[1] = base64Url(
      new TextEncoder().encode(JSON.stringify(googleClaims({ sub: 'forged-subject' }))),
    );
    await expect(
      verifySocialRegistrationCredential(
        { provider: 'google', idToken: parts.join('.') },
        configuration,
        options(),
      ),
    ).rejects.toThrow('Invalid social registration proof');
  });

  it.each([
    { aud: 'a-different-app' },
    { iss: 'https://attacker.example' },
    { exp: now },
    { iat: now + 61 },
    { nbf: now + 1 },
    { email_verified: false },
    { email_verified: 'true' },
    { sub: '' },
  ])('rejects otherwise correctly signed but unauthorized claims %j', async (claims) => {
    await expect(
      verifySocialRegistrationCredential(
        { provider: 'google', idToken: await sign(googleClaims(claims)) },
        configuration,
        options(),
      ),
    ).rejects.toThrow('Invalid social registration proof');
  });

  it('rejects algorithm changes before fetching keys and fails closed with no server audiences', async () => {
    const verification = options();
    const unsignedAlgorithm = await sign(googleClaims(), { alg: 'none' });
    await expect(
      verifySocialRegistrationCredential(
        { provider: 'google', idToken: unsignedAlgorithm },
        configuration,
        verification,
      ),
    ).rejects.toThrow('Invalid social registration proof');
    await expect(
      verifySocialRegistrationCredential(
        { provider: 'google', idToken: await sign(googleClaims()) },
        { googleAudiences: [], appleAudiences: [] },
        verification,
      ),
    ).rejects.toThrow('Invalid social registration proof');
    expect(verification.getSigningKeys).not.toHaveBeenCalled();
  });

  it('requires a unique matching provider signing key', async () => {
    const idToken = await sign(googleClaims());
    await expect(
      verifySocialRegistrationCredential({ provider: 'google', idToken }, configuration, {
        nowSeconds: now,
        getSigningKeys: async () => [{ ...publicKey, kid: 'other-key' }],
      }),
    ).rejects.toThrow('Invalid social registration proof');
    await expect(
      verifySocialRegistrationCredential({ provider: 'google', idToken }, configuration, {
        nowSeconds: now,
        getSigningKeys: async () => [publicKey, publicKey],
      }),
    ).rejects.toThrow('Invalid social registration proof');
  });

  it('accepts Apple relay email with the original nonce and rejects replay with a different nonce', async () => {
    const nonce = 'original-random-apple-nonce-123';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
    const hashedNonce = Buffer.from(digest).toString('hex');
    const claims = {
      ...googleClaims(),
      iss: 'https://appleid.apple.com',
      aud: 'com.happycircles.app',
      email: 'private@privaterelay.appleid.com',
      email_verified: 'true',
      nonce: hashedNonce,
    };
    const idToken = await sign(claims);
    const result = await verifySocialRegistrationCredential(
      { provider: 'apple', idToken, nonce },
      configuration,
      options(),
    );
    expect(result.email).toBe('private@privaterelay.appleid.com');
    for (const suppliedNonce of [undefined, 'incorrect-random-nonce-123']) {
      await expect(
        verifySocialRegistrationCredential(
          { provider: 'apple', idToken, nonce: suppliedNonce },
          configuration,
          options(),
        ),
      ).rejects.toThrow('Invalid social registration proof');
    }
  });

  it('returns the same safe error on key network failures without exposing their contents', async () => {
    const idToken = await sign(googleClaims());
    await expect(
      verifySocialRegistrationCredential({ provider: 'google', idToken }, configuration, {
        nowSeconds: now,
        getSigningKeys: async () => {
          throw new Error(`provider secret ${idToken}`);
        },
      }),
    ).rejects.toThrow(/^Invalid social registration proof$/);
  });

  it('reads only explicit server audiences and normalizes duplicate entries', () => {
    expect(readSocialRegistrationAudiences(undefined)).toEqual([]);
    expect(readSocialRegistrationAudiences(' web-client,ios-client,web-client, ')).toEqual([
      'web-client',
      'ios-client',
    ]);
  });
});
