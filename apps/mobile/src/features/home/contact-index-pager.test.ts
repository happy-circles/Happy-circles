import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContactCandidate } from '@/features/invites/people-outreach-utils';
import type { ContactIndexReadResult } from './add-person-contact-index';
import { ContactIndexPager } from './contact-index-pager';

function contact(
  index: number,
  phoneE164 = `+57300${String(index).padStart(7, '0')}`,
): ContactCandidate {
  const phone = { id: `phone-${index}`, label: 'mobile', maskedPhone: '***0000', phoneE164 };
  return {
    contactId: `contact-${index}`,
    alias: `Persona ${index}`,
    phoneOptions: [phone],
    primaryPhone: phone,
    searchKey: `persona ${index} ${phoneE164}`,
  };
}

function result(contacts: readonly ContactCandidate[], matchingCount = 3): ContactIndexReadResult {
  return {
    contacts,
    matchingCount,
    loadedCount: matchingCount,
    permissionStatus: 'granted',
    status: 'ready',
    lastCompletedAt: 100,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('contact index paging lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reopens at the warm offset without reading completed pages again', async () => {
    const pager = new ContactIndexPager();
    const contacts = [contact(1), contact(2), contact(3)];
    let warm = result(contacts.slice(0, 1));
    const readPage = vi.fn(async (offset: number) => result(contacts.slice(offset, offset + 1)));
    const onPage = vi.fn((page: ContactIndexReadResult) => {
      warm = page;
    });
    const start = () =>
      pager.start({
        userId: 'owner',
        revision: 1,
        result: warm,
        shouldContinue: () => true,
        readPage,
        onPage,
      });

    start();
    await vi.advanceTimersByTimeAsync(700);
    expect(warm.contacts).toEqual(contacts.slice(0, 2));
    pager.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(readPage.mock.calls.map(([offset]) => offset)).toEqual([1]);

    start();
    await vi.advanceTimersByTimeAsync(700);
    expect(readPage.mock.calls.map(([offset]) => offset)).toEqual([1, 2]);
    expect(warm.contacts).toEqual(contacts);
    await vi.advanceTimersByTimeAsync(1000);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('does not read while backgrounded and can resume when foregrounded', async () => {
    const pager = new ContactIndexPager();
    let foreground = false;
    const readPage = vi.fn(async () => result([contact(2)], 2));
    const onPage = vi.fn();
    const start = () =>
      pager.start({
        userId: 'owner',
        revision: 1,
        result: result([contact(1)], 2),
        shouldContinue: () => foreground,
        readPage,
        onPage,
      });
    start();
    await vi.advanceTimersByTimeAsync(700);
    expect(readPage).not.toHaveBeenCalled();
    foreground = true;
    start();
    await vi.advanceTimersByTimeAsync(700);
    expect(readPage).toHaveBeenCalledOnce();
    expect(onPage).toHaveBeenCalledOnce();
  });

  it('discards a page that arrives after foreground access was withdrawn', async () => {
    const pager = new ContactIndexPager();
    const pending = deferred<ContactIndexReadResult>();
    let foreground = true;
    const onPage = vi.fn();
    pager.start({
      userId: 'owner',
      revision: 1,
      result: result([contact(1)]),
      shouldContinue: () => foreground,
      readPage: () => pending.promise,
      onPage,
    });
    await vi.advanceTimersByTimeAsync(700);
    foreground = false;
    pending.resolve(result([contact(2)]));
    await vi.advanceTimersByTimeAsync(0);
    expect(onPage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a canceled read failure without disrupting the replacement run', async () => {
    const pager = new ContactIndexPager();
    const pending = deferred<ContactIndexReadResult>();
    const staleError = vi.fn();
    const stalePage = vi.fn();
    pager.start({
      userId: 'old-owner',
      revision: 1,
      result: result([contact(1)], 2),
      shouldContinue: () => true,
      readPage: () => pending.promise,
      onPage: stalePage,
      onError: staleError,
    });
    await vi.advanceTimersByTimeAsync(700);
    pager.cancel();
    const nextPage = vi.fn();
    pager.start({
      userId: 'new-owner',
      revision: 2,
      result: result([contact(10)], 2),
      shouldContinue: () => true,
      readPage: async () => result([contact(11)], 2),
      onPage: nextPage,
    });
    pending.reject(new Error('Old read failed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(staleError).not.toHaveBeenCalled();
    expect(stalePage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(nextPage).toHaveBeenCalledOnce();
  });

  it('does not publish a stale successful page into another users replacement pass', async () => {
    const pager = new ContactIndexPager();
    const pending = deferred<ContactIndexReadResult>();
    const oldPage = vi.fn();
    pager.start({
      userId: 'old-owner',
      revision: 1,
      result: result([contact(1)], 2),
      shouldContinue: () => true,
      readPage: () => pending.promise,
      onPage: oldPage,
    });
    await vi.advanceTimersByTimeAsync(700);
    const newPage = vi.fn();
    pager.start({
      userId: 'new-owner',
      revision: 2,
      result: result([contact(10)], 2),
      shouldContinue: () => true,
      readPage: async () => result([contact(11)], 2),
      onPage: newPage,
    });
    pending.resolve(result([contact(2)], 2));
    await vi.advanceTimersByTimeAsync(700);
    expect(oldPage).not.toHaveBeenCalled();
    expect((newPage.mock.calls[0][0] as ContactIndexReadResult).contacts).toEqual([
      contact(10),
      contact(11),
    ]);
  });

  it.each(['ready', 'permission_blocked'] as const)(
    'stops a previous pass when replaced with %s data requiring no reads',
    async (status) => {
      const pager = new ContactIndexPager();
      const readPage = vi.fn(async () => result([contact(2)]));
      const onPage = vi.fn();
      pager.start({
        userId: 'owner',
        revision: 1,
        result: result([contact(1)]),
        shouldContinue: () => true,
        readPage,
        onPage,
      });
      pager.start({
        userId: 'owner',
        revision: 2,
        result: { ...result([contact(1)], 1), status },
        shouldContinue: () => true,
        readPage,
        onPage,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(readPage).not.toHaveBeenCalled();
      expect(onPage).not.toHaveBeenCalled();
    },
  );

  it('keeps distinct local contacts sharing a phone while excluding repeated contact IDs', async () => {
    const pager = new ContactIndexPager();
    const first = contact(1);
    const samePhone = contact(2, first.primaryPhone.phoneE164);
    const onPage = vi.fn();
    pager.start({
      userId: 'owner',
      revision: 1,
      result: result([first], 2),
      shouldContinue: () => true,
      readPage: async () => result([first, samePhone], 2),
      onPage,
    });
    await vi.advanceTimersByTimeAsync(700);
    expect((onPage.mock.calls[0][0] as ContactIndexReadResult).contacts).toEqual([
      first,
      samePhone,
    ]);
    expect(onPage).toHaveBeenCalledOnce();
  });

  it('does not schedule a second pass for repeated start calls on the current revision', async () => {
    const pager = new ContactIndexPager();
    const readPage = vi.fn(async () => result([contact(2)], 2));
    const input = {
      userId: 'owner',
      revision: 1,
      result: result([contact(1)], 2),
      shouldContinue: () => true,
      readPage,
      onPage: vi.fn(),
    };
    pager.start(input);
    pager.start(input);
    await vi.advanceTimersByTimeAsync(1000);
    expect(readPage).toHaveBeenCalledOnce();
    expect(input.onPage).toHaveBeenCalledOnce();
  });
});
