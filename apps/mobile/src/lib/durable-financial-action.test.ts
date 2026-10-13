import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(async (_signature: string, key: string) => key),
  confirm: vi.fn(async () => undefined),
  generation: 0,
  backendScope: 'https://production.supabase.co',
}));

vi.mock('./config', () => ({
  appConfig: {
    get supabaseUrl() {
      return mocks.backendScope;
    },
  },
}));
vi.mock('./durable-action-store', () => ({
  durableActionStore: { acquire: mocks.acquire, confirm: mocks.confirm },
}));
vi.mock('./session-data-boundary', () => ({
  captureSessionDataGeneration: () => mocks.generation,
  assertSessionDataGeneration: (expected: number) => {
    if (expected !== mocks.generation) throw new Error('La sesión cambió.');
  },
}));

import { runDurableFinancialAction } from './durable-financial-action';

describe('durable financial session boundary', () => {
  beforeEach(() => {
    mocks.generation = 0;
    mocks.backendScope = 'https://production.supabase.co';
    mocks.acquire.mockReset().mockImplementation(async (_signature: string, key: string) => key);
    mocks.confirm.mockReset().mockResolvedValue(undefined);
  });

  it('does not send after an A -> B -> A account change during durable reservation', async () => {
    let finish!: (key: string) => void;
    mocks.acquire.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const execute = vi.fn(async () => 'confirmed');
    const pending = runDurableFinancialAction(
      'actor-a',
      'create',
      { amountMinor: 100 },
      'create',
      execute,
    );
    expect(execute).not.toHaveBeenCalled();
    mocks.generation += 2;
    finish('original-durable-key');
    await expect(pending).rejects.toThrow('La sesión cambió.');
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('checks a generation captured before an outer save request waits', () => {
    const generationAfterAuthorization = mocks.generation;
    mocks.generation += 2;
    const execute = vi.fn(async () => 'confirmed');
    expect(() =>
      runDurableFinancialAction(
        'actor-a',
        'create',
        {},
        'create',
        execute,
        generationAfterAuthorization,
      ),
    ).toThrow('La sesión cambió.');
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps a received confirmation successful if logout happens while its receipt is stored', async () => {
    mocks.confirm.mockImplementationOnce(async () => {
      mocks.generation += 1;
    });
    const response = { requestId: 'confirmed-request', status: 'pending' };
    await expect(
      runDurableFinancialAction('actor-a', 'create', {}, 'create', async () => response),
    ).resolves.toBe(response);
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it('scopes journal entries by backend, actor, operation and transmitted payload without credentials', async () => {
    const execute = vi.fn(async (key: string) => key);
    await runDurableFinancialAction('actor-a', 'create', { amountMinor: 100 }, 'create', execute);
    await runDurableFinancialAction('actor-b', 'create', { amountMinor: 100 }, 'create', execute);
    await runDurableFinancialAction(
      'actor-a',
      'accept',
      { requestId: 'request' },
      'accept',
      execute,
    );
    mocks.backendScope = 'https://staging.supabase.co';
    await runDurableFinancialAction('actor-a', 'create', { amountMinor: 100 }, 'create', execute);
    const signatures = mocks.acquire.mock.calls.map(
      ([signature]) => JSON.parse(signature) as unknown,
    );
    expect(signatures).toEqual([
      ['https://production.supabase.co', 'actor-a', 'create', { amountMinor: 100 }],
      ['https://production.supabase.co', 'actor-b', 'create', { amountMinor: 100 }],
      ['https://production.supabase.co', 'actor-a', 'accept', { requestId: 'request' }],
      ['https://staging.supabase.co', 'actor-a', 'create', { amountMinor: 100 }],
    ]);
  });
});
