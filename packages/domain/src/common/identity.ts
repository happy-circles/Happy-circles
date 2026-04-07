import type { UserId } from '@happy-circles/shared';

export interface CanonicalPair {
  readonly userLowId: UserId;
  readonly userHighId: UserId;
}

export function toCanonicalPair(left: UserId, right: UserId): CanonicalPair {
  return left < right
    ? { userLowId: left, userHighId: right }
    : { userLowId: right, userHighId: left };
}
