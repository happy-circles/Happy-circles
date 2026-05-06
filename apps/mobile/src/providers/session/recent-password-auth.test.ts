import { describe, expect, it } from 'vitest';

import { createRecentPasswordAuth, isRecentPasswordAuthValid } from './recent-password-auth';

describe('recent password auth', () => {
  it('is valid for the same user before it expires', () => {
    const recentPasswordAuth = createRecentPasswordAuth('user-1', 1_000, 5_000);

    expect(
      isRecentPasswordAuthValid({
        recentPasswordAuth,
        userId: 'user-1',
        now: 5_999,
      }),
    ).toBe(true);
  });

  it('is invalid for another user', () => {
    const recentPasswordAuth = createRecentPasswordAuth('user-1', 1_000, 5_000);

    expect(
      isRecentPasswordAuthValid({
        recentPasswordAuth,
        userId: 'user-2',
        now: 2_000,
      }),
    ).toBe(false);
  });

  it('is invalid after it expires', () => {
    const recentPasswordAuth = createRecentPasswordAuth('user-1', 1_000, 5_000);

    expect(
      isRecentPasswordAuthValid({
        recentPasswordAuth,
        userId: 'user-1',
        now: 6_000,
      }),
    ).toBe(false);
  });

  it('is invalid when no marker exists', () => {
    expect(
      isRecentPasswordAuthValid({
        recentPasswordAuth: null,
        userId: 'user-1',
        now: 2_000,
      }),
    ).toBe(false);
  });
});
