import { describe, expect, it } from 'vitest';
import { RetriableActionRegistry } from './retriable-action';

describe('invitation intentions', () => {
  it('reuses the intention after a lost response and starts another only after success', async () => {
    const registry = new RetriableActionRegistry();
    const keys: string[] = [];
    await expect(
      registry.run('actor-a:target', 'invite', async (key) => {
        keys.push(key);
        throw new Error('network');
      }),
    ).rejects.toThrow('network');
    await registry.run('actor-a:target', 'invite', async (key) => {
      keys.push(key);
      return 'created';
    });
    await registry.run('actor-a:target', 'invite', async (key) => {
      keys.push(key);
      return 'created';
    });
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
  it('deduplicates a double tap and scopes intentions by the actor', async () => {
    const registry = new RetriableActionRegistry();
    let finish!: (value: string) => void;
    const first = registry.run(
      'a:invite',
      'invite',
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const second = registry.run('a:invite', 'invite', async () => 'duplicate');
    expect(first).toBe(second);
    expect(await registry.run('b:invite', 'invite', async () => 'different-actor')).toBe(
      'different-actor',
    );
    finish('only-result');
    expect(await second).toBe('only-result');
  });
  it('allows a new intention immediately after an explicit terminal action', async () => {
    const registry = new RetriableActionRegistry();
    let oldKey = '';
    await registry
      .run('a:invite', 'invite', async (key) => {
        oldKey = key;
        throw new Error('timeout');
      })
      .catch(() => undefined);
    registry.forgetWhere((signature) => signature === 'a:invite');
    const nextKey = await registry.run('a:invite', 'invite', async (key) => key);
    expect(nextKey).not.toBe(oldKey);
  });
});
