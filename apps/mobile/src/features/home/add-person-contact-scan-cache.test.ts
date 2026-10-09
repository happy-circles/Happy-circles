import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearWarmContactScanCache,
  readWarmContactScanCache,
  writeWarmContactScanCache,
  updateWarmContactScanTargetCache,
  subscribeWarmContactScanCache,
} from './add-person-contact-scan-cache';

afterEach(() => clearWarmContactScanCache('actor'));
describe('warm contact snapshot', () => {
  it('notifies an already mounted subscriber only when the agenda snapshot changes', () => {
    const available = vi.fn();
    const otherActor = vi.fn();
    const unsubscribe = subscribeWarmContactScanCache('actor', available);
    const unsubscribeOther = subscribeWarmContactScanCache('other', otherActor);
    const contacts: ContactCandidate[] = [];
    const snapshot = {
      userId: 'actor',
      contactsPermissionStatus: 'granted' as const,
      contacts,
      targetCache: {},
    };
    writeWarmContactScanCache(snapshot);
    expect(available).toHaveBeenCalledOnce();
    updateWarmContactScanTargetCache('actor', {});
    writeWarmContactScanCache({ ...snapshot, targetCache: {} });
    expect(available).toHaveBeenCalledOnce();
    expect(otherActor).not.toHaveBeenCalled();
    unsubscribe();
    unsubscribeOther();
    writeWarmContactScanCache({ ...snapshot, contacts: [] });
    expect(available).toHaveBeenCalledOnce();
  });
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
