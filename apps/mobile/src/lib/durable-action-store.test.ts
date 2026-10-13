import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DurableActionRegistry, durableActionSignature } from './durable-action';
import type * as NativeStore from './durable-action-store';

const mocks = vi.hoisted(() => ({ openDatabaseAsync: vi.fn() }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: mocks.openDatabaseAsync }));

function sqliteAdapter(database: DatabaseSync) {
  return {
    execAsync: async (sql: string) => database.exec(sql),
    getFirstAsync: async (sql: string, ...params: SQLInputValue[]) =>
      database.prepare(sql).get(...params) ?? null,
    runAsync: async (sql: string, ...params: SQLInputValue[]) =>
      database.prepare(sql).run(...params),
  };
}

describe('SQLite durable action journal', () => {
  let database: DatabaseSync;
  let store: typeof NativeStore.durableActionStore;
  let directory: string;
  let databasePath: string;

  async function open() {
    vi.resetModules();
    database = new DatabaseSync(databasePath);
    mocks.openDatabaseAsync.mockResolvedValue(sqliteAdapter(database));
    store = (await import('./durable-action-store')).durableActionStore;
  }

  beforeEach(async () => {
    mocks.openDatabaseAsync.mockReset();
    directory = mkdtempSync(join(tmpdir(), 'happy-circles-durable-test-'));
    databasePath = join(directory, 'actions.db');
    await open();
  });

  afterEach(() => {
    database.close();
    if (!directory.startsWith(join(tmpdir(), 'happy-circles-durable-test-'))) {
      throw new Error('Unexpected test directory.');
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('reuses a lost-response key after closing and reopening the database', async () => {
    const signature = durableActionSignature({
      backendScope: 'https://test.supabase.co',
      actorUserId: 'actor-a',
      operation: 'create-balance-request',
      payload: { amountMinor: 1200 },
    });
    let sentKey = '';
    await expect(
      new DurableActionRegistry(store).run(signature, 'create', async (key) => {
        sentKey = key;
        throw new Error('response lost after commit');
      }),
    ).rejects.toThrow('response lost');
    database.close();
    await open();

    const registry = new DurableActionRegistry(store);
    expect(await registry.run(signature, 'create', async (key) => key)).toBe(sentKey);
    database.close();
    await open();
    expect(
      await new DurableActionRegistry(store).run(signature, 'create', async (key) => key),
    ).not.toBe(sentKey);
  });

  it('atomically reserves one key for concurrent callers and ignores stale acknowledgements', async () => {
    const keys = await Promise.all([
      store.acquire('intent', 'candidate-one'),
      store.acquire('intent', 'candidate-two'),
    ]);
    expect(keys).toEqual(['candidate-one', 'candidate-one']);
    await store.confirm('intent', 'candidate-one');
    expect(await store.acquire('intent', 'new-intention')).toBe('new-intention');
    await store.confirm('intent', 'candidate-one');
    expect(await store.acquire('intent', 'another-candidate')).toBe('new-intention');
  });

  it('never sends a replacement key if storage fails during reservation', async () => {
    await store.acquire('intent', 'retained-key');
    database.exec(`CREATE TRIGGER reject_action_write BEFORE INSERT ON durable_action_intentions
      BEGIN SELECT RAISE(ABORT, 'disk full'); END;`);
    const execute = vi.fn(async (key: string) => key);
    await expect(
      new DurableActionRegistry(store).run('intent', 'create', execute),
    ).rejects.toMatchObject({ code: 'durable_action_storage_unavailable' });
    expect(execute).not.toHaveBeenCalled();
    database.exec('DROP TRIGGER reject_action_write');
    expect(await new DurableActionRegistry(store).run('intent', 'create', execute)).toBe(
      'retained-key',
    );
  });

  it('can durably replace an acknowledged key even when writing its receipt failed', async () => {
    await store.acquire('intent', 'acknowledged-key');
    database.exec(`CREATE TRIGGER reject_confirmation BEFORE UPDATE ON durable_action_intentions
      WHEN NEW.status = 'confirmed' BEGIN SELECT RAISE(ABORT, 'disk full'); END;`);
    const registry = new DurableActionRegistry(store);
    expect(await registry.run('intent', 'create', async (key) => key)).toBe('acknowledged-key');
    const nextKey = await registry.run('intent', 'create', async (key) => key);
    expect(nextKey).not.toBe('acknowledged-key');
    database.exec('DROP TRIGGER reject_confirmation');
    database.close();
    await open();
    expect(await store.acquire('intent', 'should-not-replace')).toBe(nextKey);
  });

  it('recovers from an initial database opening failure without sending from memory', async () => {
    mocks.openDatabaseAsync.mockRejectedValueOnce(new Error('unavailable'));
    const execute = vi.fn(async (key: string) => key);
    const registry = new DurableActionRegistry(store);
    await expect(registry.run('intent', 'create', execute)).rejects.toThrow('guardar la operación');
    expect(execute).not.toHaveBeenCalled();
    expect(await registry.run('intent', 'create', execute)).toBeTypeOf('string');
  });
});
