import { describe, expect, it, vi } from 'vitest';
import type { PeopleTargetResolution } from '@/lib/live-data/types-runtime';

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web },
}));
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));

import {
  restorePhoneOnPeopleTargetResolution,
  stripPhoneFromPeopleTargetResolution,
} from './people-target-resolution-cache';
import { mergeContactResolutions } from '@/lib/contact-resolution-state';

const live: PeopleTargetResolution = {
  phoneE164: '+573001234567',
  status: 'active_user',
  matchedUserId: '66cae267-3792-4b0b-9674-106965144100',
  displayName: 'Ana',
  avatarPath: null,
  relationshipId: null,
  friendshipInviteId: null,
  accountInviteId: null,
  accountInviteStatus: null,
  accountMatchConfirmed: true,
  resolvedAt: Date.now(),
  generation: 0,
};

describe('disk contact resolution proof boundary', () => {
  it('never persists a session account confirmation', () => {
    const stored = JSON.parse(
      JSON.stringify(stripPhoneFromPeopleTargetResolution(live)),
    ) as ReturnType<typeof stripPhoneFromPeopleTargetResolution>;
    expect(stored).not.toHaveProperty('accountMatchConfirmed');
    expect(stored).not.toHaveProperty('phoneE164');
    const restored = restorePhoneOnPeopleTargetResolution({
      phoneE164: live.phoneE164,
      storedResolution: stored,
    });
    expect(restored.status).toBe('active_user');
    expect(restored.accountMatchConfirmed).toBe(false);
    const [hydrated] = mergeContactResolutions('disk-proof-roundtrip', [restored], {
      fromCache: true,
    });
    expect(hydrated.accountMatchConfirmed).toBe(false);
  });

  it('rejects a forged stored confirmation and binds the row to the requested phone', () => {
    const forged = {
      ...stripPhoneFromPeopleTargetResolution(live),
      accountMatchConfirmed: true,
      phoneE164: '+573009876543',
    };
    const restored = restorePhoneOnPeopleTargetResolution({
      phoneE164: live.phoneE164,
      storedResolution: forged,
    });
    expect(restored.phoneE164).toBe(live.phoneE164);
    expect(restored.accountMatchConfirmed).toBe(false);
    const [hydrated] = mergeContactResolutions('disk-proof-forged', [restored], {
      fromCache: true,
    });
    expect(hydrated.phoneE164).toBe(live.phoneE164);
    expect(hydrated.accountMatchConfirmed).toBe(false);
  });
});
