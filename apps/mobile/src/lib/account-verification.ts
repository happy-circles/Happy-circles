import { getStoredItem, removeStoredItem, setStoredItem } from './storage';

const PENDING_ACCOUNT_VERIFICATION_KEY = 'happy_circles.pending_account_verification';
export const PENDING_ACCOUNT_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
let accountVerificationStorageTail: Promise<void> = Promise.resolve();

export interface PendingAccountVerification {
  readonly createdAt: string;
  readonly email: string;
  readonly resendAvailableAt: number;
  readonly token: string;
}

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase('en-US');
}

export function pendingVerificationMatchesSessionEmail(input: {
  readonly pendingEmail: string | null | undefined;
  readonly sessionEmail: string | null | undefined;
}): boolean {
  if (!input.pendingEmail || !input.sessionEmail) {
    return false;
  }

  return normalizeEmail(input.pendingEmail) === normalizeEmail(input.sessionEmail);
}

function isPendingAccountVerification(value: unknown): value is PendingAccountVerification {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record['token'] === 'string' &&
    record['token'].trim().length >= 12 &&
    typeof record['email'] === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record['email'].trim()) &&
    typeof record['createdAt'] === 'string' &&
    typeof record['resendAvailableAt'] === 'number' &&
    Number.isFinite(record['resendAvailableAt'])
  );
}

function isFresh(createdAt: string) {
  const createdAtMs = Date.parse(createdAt);
  const ageMs = Date.now() - createdAtMs;
  return Number.isFinite(createdAtMs) && ageMs >= 0 && ageMs <= PENDING_ACCOUNT_VERIFICATION_TTL_MS;
}

function withAccountVerificationStorageLock<T>(action: () => Promise<T>): Promise<T> {
  const pending = accountVerificationStorageTail.then(action, action);
  accountVerificationStorageTail = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

async function readPendingAccountVerificationUnlocked(
  expectedToken?: string,
): Promise<PendingAccountVerification | null> {
  try {
    const storedValue = await getStoredItem(PENDING_ACCOUNT_VERIFICATION_KEY);
    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(storedValue) as unknown;
    if (!isPendingAccountVerification(parsed) || !isFresh(parsed.createdAt)) {
      await removeStoredItem(PENDING_ACCOUNT_VERIFICATION_KEY).catch(() => undefined);
      return null;
    }

    if (expectedToken !== undefined && parsed.token.trim() !== expectedToken.trim()) {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      email: normalizeEmail(parsed.email),
      resendAvailableAt: parsed.resendAvailableAt,
      token: parsed.token.trim(),
    };
  } catch {
    await removeStoredItem(PENDING_ACCOUNT_VERIFICATION_KEY).catch(() => undefined);
    return null;
  }
}

export function readPendingAccountVerification(
  expectedToken?: string,
): Promise<PendingAccountVerification | null> {
  return withAccountVerificationStorageLock(() =>
    readPendingAccountVerificationUnlocked(expectedToken),
  );
}

export function writePendingAccountVerification(input: {
  readonly createdAt?: string;
  readonly email: string;
  readonly resendAvailableAt: number;
  readonly token: string;
}): Promise<PendingAccountVerification> {
  const pending: PendingAccountVerification = {
    createdAt: input.createdAt ?? new Date().toISOString(),
    email: normalizeEmail(input.email),
    resendAvailableAt: input.resendAvailableAt,
    token: input.token.trim(),
  };

  return withAccountVerificationStorageLock(async () => {
    await setStoredItem(PENDING_ACCOUNT_VERIFICATION_KEY, JSON.stringify(pending));
    return pending;
  });
}

export function clearPendingAccountVerificationIfMatches(input: {
  readonly createdAt: string;
  readonly email: string | null | undefined;
  readonly token: string;
}): Promise<boolean> {
  return withAccountVerificationStorageLock(async () => {
    const pending = await readPendingAccountVerificationUnlocked(input.token);
    if (
      !pending ||
      pending.createdAt !== input.createdAt ||
      !pendingVerificationMatchesSessionEmail({
        pendingEmail: pending.email,
        sessionEmail: input.email,
      })
    ) {
      return false;
    }

    await removeStoredItem(PENDING_ACCOUNT_VERIFICATION_KEY);
    return true;
  });
}

export function reconcilePendingAccountVerificationForSession(input: {
  readonly isEmailConfirmed: boolean;
  readonly sessionEmail: string | null | undefined;
}): Promise<boolean> {
  if (!input.isEmailConfirmed || !input.sessionEmail) {
    return Promise.resolve(false);
  }

  return withAccountVerificationStorageLock(async () => {
    const pending = await readPendingAccountVerificationUnlocked();
    if (
      !pending ||
      !pendingVerificationMatchesSessionEmail({
        pendingEmail: pending.email,
        sessionEmail: input.sessionEmail,
      })
    ) {
      return false;
    }

    await removeStoredItem(PENDING_ACCOUNT_VERIFICATION_KEY);
    return true;
  }).catch(() => false);
}
