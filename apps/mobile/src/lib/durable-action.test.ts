import { describe, expect, it, vi } from 'vitest';

import {
  DurableActionRegistry,
  durableActionSignature,
  type DurableActionStore,
} from './durable-action';

const identity = {
  backendScope: 'https://production.supabase.co',
  actorUserId: 'actor-a',
  operation: 'create-balance-request',
  payload: { amountMinor: 1200, responderUserId: 'person-a' },
};

function memoryStore(): DurableActionStore {
  const records = new Map<string, { key: string; status: 'pending' | 'confirmed' }>();
  return {
    async acquire(signature, candidateKey, retiredKey) {
      const previous = records.get(signature);
      const key =
        previous?.status === 'pending' && previous.key !== retiredKey ? previous.key : candidateKey;
      records.set(signature, { key, status: 'pending' });
      return key;
    },
    async confirm(signature, key) {
      if (records.get(signature)?.key === key) records.set(signature, { key, status: 'confirmed' });
    },
  };
}

describe('durable financial intentions', () => {
  it('canonicalizes payloads and isolates actor, backend, operation and payload', () => {
    const signature = durableActionSignature(identity);
    expect(
      durableActionSignature({
        ...identity,
        payload: { responderUserId: 'person-a', unused: undefined, amountMinor: 1200 },
      }),
    ).toBe(signature);
    for (const override of [
      { backendScope: 'https://test.supabase.co' },
      { actorUserId: 'actor-b' },
      { operation: 'another-operation' },
      { payload: { ...identity.payload, amountMinor: 1500 } },
    ]) {
      expect(durableActionSignature({ ...identity, ...override })).not.toBe(signature);
    }
  });

  it('coalesces concurrent submissions before storage finishes', async () => {
    const store = memoryStore();
    let finish!: (key: string) => void;
    const acquire = vi.spyOn(store, 'acquire').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const registry = new DurableActionRegistry(store);
    const execute = vi.fn(async (key: string) => key);
    const first = registry.run('same-intent', 'request', execute);
    const second = registry.run('same-intent', 'request', execute);
    expect(first).toBe(second);
    expect(acquire).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    finish('durable-key');
    expect(await first).toBe('durable-key');
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    new Error('lost response'),
    Object.assign(new Error('aborted'), { name: 'AbortError' }),
    Object.assign(new Error('confirm identity'), { status: 403 }),
  ])('keeps the key until a response confirms the command: %s', async (error) => {
    const store = memoryStore();
    const first = new DurableActionRegistry(store);
    let originalKey = '';
    await expect(
      first.run('intent', 'request', async (key) => {
        originalKey = key;
        throw error;
      }),
    ).rejects.toThrow(error.message);

    const restarted = new DurableActionRegistry(store);
    const execute = vi.fn(async (key: string) => key);
    expect(execute).not.toHaveBeenCalled();
    expect(await restarted.run('intent', 'request', execute)).toBe(originalKey);
    expect(await restarted.run('intent', 'request', execute)).not.toBe(originalKey);
  });

  it('does not submit when the durable reservation fails', async () => {
    const store = memoryStore();
    vi.spyOn(store, 'acquire').mockRejectedValue(new Error('disk full'));
    const execute = vi.fn();
    await expect(
      new DurableActionRegistry(store).run('intent', 'request', execute),
    ).rejects.toMatchObject({ code: 'durable_action_storage_unavailable' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps a confirmed command successful when the receipt write fails', async () => {
    const store = memoryStore();
    vi.spyOn(store, 'confirm').mockRejectedValue(new Error('disk full'));
    const registry = new DurableActionRegistry(store);
    const key = await registry.run('intent', 'request', async (value) => value);
    const laterKey = await registry.run('intent', 'request', async (value) => value);
    expect(laterKey).not.toBe(key);
  });

  it('cannot replay without an explicit submit, even if an unacknowledged receipt survived a crash', async () => {
    const store = memoryStore();
    vi.spyOn(store, 'confirm').mockRejectedValueOnce(new Error('disk full'));
    const key = await new DurableActionRegistry(store).run(
      'intent',
      'request',
      async (value) => value,
    );
    const restarted = new DurableActionRegistry(store);
    const execute = vi.fn(async (value: string) => value);
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();
    expect(await restarted.run('intent', 'request', execute)).toBe(key);
    expect(await restarted.run('intent', 'request', execute)).not.toBe(key);
  });
});
