import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactResolutionScheduler } from './contact-resolution-scheduler';
import type { PeopleTargetResolution } from './live-data/types-runtime';

function row(phoneE164: string): PeopleTargetResolution {
  return {
    phoneE164,
    status: 'active_user',
    accountInviteId: null,
    accountInviteStatus: null,
    avatarPath: null,
    displayName: null,
    friendshipInviteId: null,
    matchedUserId: null,
    relationshipId: null,
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('shared discovery budget', () => {
  it.each([1000, 10000])(
    'resolves %i phones in batches without blocking user work',
    async (count) => {
      const calls: { at: number; phones: readonly string[] }[] = [];
      const scheduler = new ContactResolutionScheduler(async (phones) => {
        calls.push({ at: Date.now(), phones });
        return phones.map(row);
      });
      const result = scheduler.request(
        Array.from({ length: count }, (_, index) => `+57${index}`),
        'background',
      );
      await vi.runAllTimersAsync();
      expect(await result).toHaveLength(count);
      expect(calls).toHaveLength(Math.ceil(count / 60));
      expect(Math.max(...calls.map((call) => call.phones.length))).toBeLessThanOrEqual(60);
      for (const call of calls)
        expect(
          calls.filter((other) => other.at >= call.at && other.at < call.at + 60_000).length,
        ).toBeLessThanOrEqual(45);
    },
  );

  it('reserves ten requests for events and five more for explicit actions after background work', async () => {
    const calls: readonly string[][] = [];
    const collected = calls as string[][];
    const scheduler = new ContactResolutionScheduler(async (phones) => {
      collected.push([...phones]);
      return phones.map(row);
    });
    const background = scheduler.request(
      Array.from({ length: 2760 }, (_, i) => `background-${i}`),
      'background',
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(collected).toHaveLength(45);
    for (let index = 0; index < 10; index += 1) {
      const phone = `changed-contact-${index}`;
      const event = scheduler.request([phone], 'event');
      await vi.advanceTimersByTimeAsync(10);
      expect((await event)[0].phoneE164).toBe(phone);
      expect(collected[45 + index]).toContain(phone);
    }
    const waitingEvent = scheduler.request(['waiting-event'], 'event');
    await vi.advanceTimersByTimeAsync(10);
    expect(collected).toHaveLength(55);
    const interactive = scheduler.request(['selected-contact'], 'interactive');
    await vi.advanceTimersByTimeAsync(10);
    expect((await interactive)[0].phoneE164).toBe('selected-contact');
    expect(collected[55]).toContain('selected-contact');
    await vi.runAllTimersAsync();
    await background;
    await waitingEvent;
  });

  it('deduplicates callers but queues a forced recheck after an invalidated in-flight read', async () => {
    let release!: (rows: readonly PeopleTargetResolution[]) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockImplementation(async (phones: readonly string[]) => phones.map(row));
    const scheduler = new ContactResolutionScheduler(fetch);
    const first = scheduler.request(['same'], 'visible');
    const duplicate = scheduler.request(['same'], 'visible');
    await vi.advanceTimersByTimeAsync(1);
    const afterCancel = scheduler.request(['same'], 'interactive', true);
    release([{ ...row('same'), status: 'pending_friendship' }]);
    await vi.runAllTimersAsync();
    expect((await first)[0].status).toBe('pending_friendship');
    expect(await duplicate).toEqual(await first);
    expect((await afterCancel)[0].status).toBe('active_user');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not execute queued work after the authenticated account changes', async () => {
    const fetch = vi.fn(async (phones: readonly string[]) => phones.map(row));
    const scheduler = new ContactResolutionScheduler(fetch);
    const result = scheduler
      .request(['private-contact'], 'interactive')
      .catch((error: unknown) => error);
    scheduler.cancelAll();
    await vi.runAllTimersAsync();
    expect(await result).toBeInstanceOf(Error);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('backs off after a failed read instead of burning the discovery quota', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (phones: readonly string[]) => phones.map(row));
    const scheduler = new ContactResolutionScheduler(fetch);
    const first = scheduler.request(['a'], 'visible').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBeInstanceOf(Error);
    const second = scheduler.request(['a'], 'interactive');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await second).toHaveLength(1);
  });

  it('reserves management capacity while retiring a large agenda snapshot', async () => {
    const fetch = vi.fn(async (phones: readonly string[]) => phones.map(row));
    const scheduler = new ContactResolutionScheduler(fetch, {
      background: 15,
      visible: 15,
      event: 17,
      interactive: 18,
    });
    const removals = scheduler.request(
      Array.from({ length: 960 }, (_, index) => `removed-${index}`),
      'background',
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(15);
    await vi.advanceTimersByTimeAsync(59_901);
    expect(await removals).toHaveLength(960);
    expect(fetch).toHaveBeenCalledTimes(16);
  });
});
