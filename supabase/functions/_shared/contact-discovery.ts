// These limits are separate from invitation writes. A first scan of 10,000
// numbers takes 167 batches; the client reserves capacity for user actions.
export const CONTACT_RESOLUTION_RATE_LIMITS = [
  { scope: 'resolve-people-targets', limit: 60, windowSeconds: 60 },
  { scope: 'resolve-people-targets:hour', limit: 1200, windowSeconds: 3600 },
] as const;

// Watch registration does not resolve profiles or relationships. Its own budget
// prevents a large first registration from starving visible-row resolution.
export const CONTACT_DISCOVERY_REGISTRATION_RATE_LIMITS = [
  { scope: 'register-contact-discovery', limit: 60, windowSeconds: 60 },
  { scope: 'register-contact-discovery:hour', limit: 1200, windowSeconds: 3600 },
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readDiscoverySessionId(value: unknown, required = false): string | null {
  if (value === undefined && !required) return null;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error('Invalid discoverySessionId');
  }
  return value;
}

export function validateContactPhoneBatch(phones: readonly string[]): void {
  if (
    phones.length < 1 ||
    phones.length > 60 ||
    phones.some((phone) => !/^\+[1-9]\d{7,14}$/.test(phone))
  ) {
    throw new Error('Invalid phoneE164List');
  }
}

export function validateDiscoveryWatchBatch(watchIds: readonly string[]): void {
  if (
    watchIds.length < 1 ||
    watchIds.length > 60 ||
    watchIds.some((watchId) => !UUID_PATTERN.test(watchId))
  ) {
    throw new Error('Invalid watchIds');
  }
}
