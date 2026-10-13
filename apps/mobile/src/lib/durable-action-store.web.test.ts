import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DurableActionRegistry } from './durable-action';

/** Exposes transaction completion separately from successful IndexedDB requests. */
function indexedDbHarness() {
  const records = new Map<string, unknown>();
  const transactions: {
    complete(): void;
    fail(): void;
  }[] = [];
  const database = {
    createObjectStore: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn(() => {
      const staged = new Map<string, unknown>();
      const transaction = {
        error: null as Error | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        oncomplete: null as (() => void) | null,
        abort: () => {
          transaction.onabort?.();
        },
        objectStore: () => ({
          get: (signature: string) => {
            const request = {
              result: records.get(signature),
              onsuccess: null as (() => void) | null,
            };
            queueMicrotask(() => request.onsuccess?.());
            return request;
          },
          put: (value: unknown, signature: string) => {
            staged.set(signature, value);
          },
        }),
      };
      transactions.push({
        complete: () => {
          for (const [key, value] of staged) records.set(key, value);
          transaction.oncomplete?.();
        },
        fail: () => {
          transaction.error = new Error('Disk write failed');
          transaction.onabort?.();
        },
      });
      return transaction;
    }),
  };
  const factory = {
    open: vi.fn(() => {
      const request = { result: database, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }),
  };
  return { records, transactions, database, factory };
}

describe('web durable action journal', () => {
  let harness: ReturnType<typeof indexedDbHarness>;

  beforeEach(() => {
    vi.resetModules();
    harness = indexedDbHarness();
    vi.stubGlobal('indexedDB', harness.factory);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function waitForTransaction(index: number) {
    await vi.waitFor(() => expect(harness.transactions).toHaveLength(index + 1));
    await Promise.resolve();
    return harness.transactions[index];
  }

  it('waits for a strict durable transaction to commit before exposing its key', async () => {
    const { durableActionStore } = await import('./durable-action-store.web');
    const resolved = vi.fn();
    const pending = durableActionStore.acquire('intent', 'candidate-key').then(resolved);
    const transaction = await waitForTransaction(0);
    expect(harness.database.transaction).toHaveBeenCalledWith('intentions', 'readwrite', {
      durability: 'strict',
    });
    expect(resolved).not.toHaveBeenCalled();
    transaction.complete();
    await pending;
    expect(resolved).toHaveBeenCalledWith('candidate-key');
  });

  it('does not send or discard a pending key if the reservation transaction aborts', async () => {
    harness.records.set('intent', { key: 'retained-key', status: 'pending' });
    const { durableActionStore } = await import('./durable-action-store.web');
    const execute = vi.fn(async () => 'confirmed');
    const pending = new DurableActionRegistry(durableActionStore).run('intent', 'create', execute);
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'durable_action_storage_unavailable',
    });
    (await waitForTransaction(0)).fail();
    await rejected;
    expect(execute).not.toHaveBeenCalled();
    expect(harness.records.get('intent')).toEqual({ key: 'retained-key', status: 'pending' });
  });

  it('keeps a confirmed intention replaceable and ignores acknowledgements for an old key', async () => {
    harness.records.set('intent', { key: 'old-confirmed-key', status: 'confirmed' });
    const { durableActionStore } = await import('./durable-action-store.web');
    const acquired = durableActionStore.acquire('intent', 'new-intention-key');
    (await waitForTransaction(0)).complete();
    await expect(acquired).resolves.toBe('new-intention-key');
    const staleAcknowledgement = durableActionStore.confirm('intent', 'old-confirmed-key');
    (await waitForTransaction(1)).complete();
    await staleAcknowledgement;
    expect(harness.records.get('intent')).toEqual({ key: 'new-intention-key', status: 'pending' });
  });

  it('fails closed on a malformed stored intention', async () => {
    harness.records.set('intent', { unexpected: 'corrupt record' });
    const { durableActionStore } = await import('./durable-action-store.web');
    const execute = vi.fn(async () => 'confirmed');
    await expect(
      new DurableActionRegistry(durableActionStore).run('intent', 'create', execute),
    ).rejects.toMatchObject({ code: 'durable_action_storage_unavailable' });
    expect(execute).not.toHaveBeenCalled();
    expect(harness.records.get('intent')).toEqual({ unexpected: 'corrupt record' });
  });
});
