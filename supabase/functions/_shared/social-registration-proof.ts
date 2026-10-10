export type SocialRegistrationProvider = 'google' | 'apple';

export interface SocialRegistrationIdentity {
  readonly provider: SocialRegistrationProvider;
  readonly subject: string;
  readonly email: string;
  readonly expiresAt: string;
}

export interface SocialRegistrationConfiguration {
  readonly googleAudiences: readonly string[];
  readonly appleAudiences: readonly string[];
}

interface SigningKey extends JsonWebKey {
  readonly kid?: string;
}

interface VerificationOptions {
  readonly nowSeconds?: number;
  readonly getSigningKeys?: (
    provider: SocialRegistrationProvider,
  ) => Promise<readonly SigningKey[]>;
}

const JWKS_URLS: Record<SocialRegistrationProvider, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  apple: 'https://appleid.apple.com/auth/keys',
};
const cachedKeys = new Map<
  SocialRegistrationProvider,
  { readonly expiresAt: number; readonly keys: readonly SigningKey[] }
>();
const pendingKeys = new Map<SocialRegistrationProvider, Promise<readonly SigningKey[]>>();
const PROOF_ERROR = 'Invalid social registration proof';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(PROOF_ERROR);
  }
  return value as Record<string, unknown>;
}

function decodeBase64Url(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(PROOF_ERROR);
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodePart(value: string): Record<string, unknown> {
  return asRecord(JSON.parse(new TextDecoder().decode(decodeBase64Url(value))));
}

async function getProviderSigningKeys(
  provider: SocialRegistrationProvider,
): Promise<readonly SigningKey[]> {
  const cached = cachedKeys.get(provider);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const pending = pendingKeys.get(provider);
  if (pending) return pending;

  const loading = (async () => {
    // Fixed first-party endpoints: never trust jku/x5u or an issuer URL supplied by the caller.
    const response = await fetch(JWKS_URLS[provider], {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(PROOF_ERROR);
    const body = asRecord(await response.json());
    if (!Array.isArray(body.keys) || body.keys.length > 32) throw new Error(PROOF_ERROR);
    const keys = body.keys.map((key) => asRecord(key) as SigningKey);
    const maxAge = Number(
      /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 300,
    );
    // A short bounded cache avoids a network call per proof while refreshing signing key rotations.
    cachedKeys.set(provider, {
      expiresAt: Date.now() + Math.min(Math.max(maxAge, 30), 300) * 1000,
      keys,
    });
    return keys;
  })();
  pendingKeys.set(provider, loading);
  try {
    return await loading;
  } finally {
    pendingKeys.delete(provider);
  }
}

export function readSocialRegistrationAudiences(value: string | undefined): readonly string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

export async function verifySocialRegistrationCredential(
  input: {
    readonly provider: unknown;
    readonly idToken: unknown;
    readonly nonce?: unknown;
  },
  configuration: SocialRegistrationConfiguration,
  options: VerificationOptions = {},
): Promise<SocialRegistrationIdentity> {
  try {
    if (input.provider !== 'google' && input.provider !== 'apple') throw new Error(PROOF_ERROR);
    const provider = input.provider;
    const allowedAudiences =
      provider === 'google' ? configuration.googleAudiences : configuration.appleAudiences;
    if (
      !allowedAudiences.length ||
      typeof input.idToken !== 'string' ||
      input.idToken.length > 32 * 1024
    ) {
      throw new Error(PROOF_ERROR);
    }
    const parts = input.idToken.split('.');
    if (parts.length !== 3) throw new Error(PROOF_ERROR);
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodePart(headerPart);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256) {
      throw new Error(PROOF_ERROR);
    }
    const keys = await (options.getSigningKeys ?? getProviderSigningKeys)(provider);
    const candidates = keys.filter(
      (key) =>
        key.kid === header.kid &&
        key.kty === 'RSA' &&
        (!key.alg || key.alg === 'RS256') &&
        (!key.use || key.use === 'sig'),
    );
    if (candidates.length !== 1) throw new Error(PROOF_ERROR);
    const signingKey = await crypto.subtle.importKey(
      'jwk',
      candidates[0],
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        signingKey,
        decodeBase64Url(signaturePart),
        new TextEncoder().encode(`${headerPart}.${payloadPart}`),
      ))
    )
      throw new Error(PROOF_ERROR);

    const claims = decodePart(payloadPart);
    const issuers =
      provider === 'google'
        ? ['https://accounts.google.com', 'accounts.google.com']
        : ['https://appleid.apple.com', 'https://account.apple.com'];
    const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (
      !issuers.includes(String(claims.iss)) ||
      !Array.isArray(audiences) ||
      !audiences.every((value) => typeof value === 'string') ||
      !audiences.some((value) => allowedAudiences.includes(value)) ||
      !Number.isInteger(claims.exp) ||
      (claims.exp as number) <= nowSeconds ||
      !Number.isInteger(claims.iat) ||
      (claims.iat as number) > nowSeconds + 60 ||
      (claims.iat as number) > (claims.exp as number) ||
      (claims.nbf !== undefined &&
        (!Number.isInteger(claims.nbf) || (claims.nbf as number) > nowSeconds)) ||
      typeof claims.sub !== 'string' ||
      !claims.sub.trim() ||
      claims.sub.length > 255 ||
      typeof claims.email !== 'string' ||
      claims.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
      (claims.email_verified !== true &&
        !(provider === 'apple' && claims.email_verified === 'true'))
    )
      throw new Error(PROOF_ERROR);

    if (provider === 'apple') {
      if (typeof input.nonce !== 'string' || input.nonce.length < 16 || input.nonce.length > 256) {
        throw new Error(PROOF_ERROR);
      }
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.nonce));
      const expectedNonce = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      if (claims.nonce !== expectedNonce) throw new Error(PROOF_ERROR);
    }

    return {
      provider,
      subject: claims.sub,
      email: claims.email.trim().toLowerCase(),
      expiresAt: new Date((claims.exp as number) * 1000).toISOString(),
    };
  } catch {
    // Never expose provider responses, decoded claims, or a credential in logs/error text.
    throw new Error(PROOF_ERROR);
  }
}
