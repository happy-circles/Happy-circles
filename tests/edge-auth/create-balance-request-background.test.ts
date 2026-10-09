import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  authorizeDevice: vi.fn(),
  notify: vi.fn(),
  context: { actorUserId: 'user-1', accessToken: 'verified-token', claims: {} },
  body: {
    idempotencyKey: 'create-1',
    requestKind: 'balance_increase',
    responderUserId: 'user-2',
    debtorUserId: 'user-1',
    creditorUserId: 'user-2',
    amountMinor: 1200,
    description: 'Shared bill',
    category: 'food_drinks',
  },
}));

vi.mock('../../supabase/functions/_shared/http.ts', () => ({
  handleRpc: async (
    _request: Request,
    handler: (
      body: Record<string, unknown>,
      actorUserId: string,
      context: typeof state.context,
    ) => Promise<unknown>,
  ) => Response.json(await handler(state.body, state.context.actorUserId, state.context)),
  createVerifiedUserClient: () => ({}),
  createServiceRoleClient: () => ({ rpc: state.rpc }),
  requireString: (value: unknown, name: string) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}`);
    return value.trim();
  },
}));
vi.mock('../../supabase/functions/_shared/authorized-device-session.ts', () => ({
  requireAuthorizedDeviceSession: state.authorizeDevice,
}));
vi.mock('../../supabase/functions/_shared/push-notifications.ts', () => ({
  notifyFinancialRequestPending: state.notify,
  readPayloadString: (data: { requestId: string }) => data.requestId,
}));

let handleRequest: (request: Request) => Promise<Response>;
const committedRequest = { requestId: 'request-1', status: 'pending' };

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function invoke() {
  return handleRequest(
    new Request('https://example.test/create-balance-request', { method: 'POST' }),
  );
}

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    serve: (handler: typeof handleRequest) => {
      handleRequest = handler;
    },
  });
  await import('../../supabase/functions/create-balance-request/index.ts');
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.resetAllMocks();
  state.authorizeDevice.mockResolvedValue(undefined);
  state.rpc.mockResolvedValue({ data: committedRequest, error: null });
  state.notify.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('create-balance-request background notification', () => {
  it('returns the committed request while notification preparation is still pending', async () => {
    const notification = deferred();
    state.notify.mockReturnValue(notification.promise);
    const waitUntil = vi.fn();
    vi.stubGlobal('EdgeRuntime', { waitUntil });

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(committedRequest);
    expect(state.rpc).toHaveBeenCalledOnce();
    expect(state.notify).toHaveBeenCalledWith({ rpc: state.rpc }, 'user-1', 'request-1');
    expect(waitUntil).toHaveBeenCalledOnce();
    notification.resolve();
    await waitUntil.mock.calls[0]?.[0];
  });

  it('handles a failed background notification without changing the successful response', async () => {
    const notification = deferred();
    state.notify.mockReturnValue(notification.promise);
    const waitUntil = vi.fn();
    vi.stubGlobal('EdgeRuntime', { waitUntil });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await invoke();
    notification.reject(new Error('Push database unavailable'));

    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
    expect(await response.json()).toEqual(committedRequest);
    expect(log).toHaveBeenCalledWith('financial_request_push_failed', {
      actorUserId: 'user-1',
      requestId: 'request-1',
      detail: 'Push database unavailable',
    });
  });

  it.each([false, true])(
    'finishes notification preparation once when background registration is unavailable (throws=%s)',
    async (throws) => {
      const notification = deferred();
      state.notify.mockReturnValue(notification.promise);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      if (throws) {
        vi.stubGlobal('EdgeRuntime', {
          waitUntil: () => {
            throw new Error('Runtime unavailable');
          },
        });
      }
      let responded = false;
      const response = invoke().then((value) => {
        responded = true;
        return value;
      });

      await vi.waitFor(() => expect(state.notify).toHaveBeenCalledOnce());
      expect(responded).toBe(false);
      notification.resolve();

      expect(await (await response).json()).toEqual(committedRequest);
      expect(state.notify).toHaveBeenCalledOnce();
    },
  );

  it('logs a notification failure in the awaited fallback without reporting the committed creation as failed', async () => {
    state.notify.mockRejectedValue(new Error('Push database unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await (await invoke()).json()).toEqual(committedRequest);
    expect(log).toHaveBeenCalledWith('financial_request_push_failed', expect.any(Object));
  });

  it('does not schedule a notification if the create RPC fails', async () => {
    state.rpc.mockResolvedValue({ data: null, error: new Error('active_relationship_required') });
    const waitUntil = vi.fn();
    vi.stubGlobal('EdgeRuntime', { waitUntil });

    await expect(invoke()).rejects.toThrow('active_relationship_required');
    expect(state.notify).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
