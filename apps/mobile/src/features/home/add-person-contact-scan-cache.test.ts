import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearWarmContactScanCache,
  readWarmContactScanCache,
  writeWarmContactScanCache,
  updateWarmContactScanTargetCache,
} from './add-person-contact-scan-cache';

afterEach(() => clearWarmContactScanCache('actor'));
describe('warm contact snapshot', () => {
  it('reuses rows and states by reference on reopening and scopes them to the account', () => {
    const contacts: ContactCandidate[] = [];
    const targetCache = {};
    writeWarmContactScanCache({
      userId: 'actor',
      contactsPermissionStatus: 'granted',
      contacts,
      targetCache,
    });
    const first = readWarmContactScanCache('actor');
    expect(readWarmContactScanCache('actor')).toBe(first);
    expect(first?.contacts).toBe(contacts);
    expect(first?.targetCache).toBe(targetCache);
    expect(readWarmContactScanCache('different-account')).toBeNull();
    const next = {};
    updateWarmContactScanTargetCache('actor', next);
    expect(readWarmContactScanCache('actor')?.contacts).toBe(contacts);
    expect(readWarmContactScanCache('actor')?.targetCache).toBe(next);
    clearWarmContactScanCache('actor');
    expect(readWarmContactScanCache('actor')).toBeNull();
  });
});
