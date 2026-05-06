import { STEP_UP_WINDOW_MS } from './constants';

export interface RecentPasswordAuth {
  readonly userId: string;
  readonly expiresAt: number;
}

export function createRecentPasswordAuth(
  userId: string,
  now = Date.now(),
  windowMs = STEP_UP_WINDOW_MS,
): RecentPasswordAuth {
  return {
    userId,
    expiresAt: now + windowMs,
  };
}

export function isRecentPasswordAuthValid(input: {
  readonly recentPasswordAuth: RecentPasswordAuth | null;
  readonly userId: string | null | undefined;
  readonly now?: number;
}): boolean {
  const now = input.now ?? Date.now();

  return Boolean(
    input.userId &&
    input.recentPasswordAuth &&
    input.recentPasswordAuth.userId === input.userId &&
    input.recentPasswordAuth.expiresAt > now,
  );
}
