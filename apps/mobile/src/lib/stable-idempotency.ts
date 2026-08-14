import { createIdempotencyKey } from './idempotency';

export interface StableIdempotencyKey {
  readonly key: string;
  readonly signature: string;
}

export function resolveStableIdempotencyKey(
  current: StableIdempotencyKey | null,
  signature: string,
  prefix: string,
): StableIdempotencyKey {
  if (current?.signature === signature) {
    return current;
  }

  return {
    key: createIdempotencyKey(prefix),
    signature,
  };
}
