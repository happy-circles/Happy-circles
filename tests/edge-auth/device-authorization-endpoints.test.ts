import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  context: {
    accessToken: 'verified-token',
    actorUserId: 'user-1',
    claims: { session_id: 'session-1' },
  },
  body: {} as Record<string, unknown>,
  readDevice: vi.fn(),
  rpc: vi.fn(),
  avatarList: vi.fn(),
  avatarRemove: vi.fn(),
  deleteUser: vi.fn(),
  recentProof: vi.fn<
    (context: unknown) => {
      sessionId: string;
      method: string;
      authenticatedAt: string;
    }
  >(),
  verifiedClient: vi.fn(),
}));

vi.mock('../../supabase/functions/_shared/http.ts', () => ({
  handleRpc: (
    _request: Request,
    handler: (
      body: Record<string, unknown>,
      actorUserId: string,
      context: typeof state.context,
    ) => Promise<unknown>,
  ) => handler(state.body, state.context.actorUserId, state.context),
  createVerifiedUserClient: (context: typeof state.context) => {
    state.verifiedClient(context);
    const query = {
      eq: () => query,
      is: () => query,
      limit: () => query,
      maybeSingle: state.readDevice,
    };
    return { from: () => ({ select: () => query }) };
  },
  createServiceRoleClient: () => ({
    rpc: state.rpc,
    storage: { from: () => ({ list: state.avatarList, remove: state.avatarRemove }) },
    auth: { admin: { deleteUser: state.deleteUser } },
  }),
  requireString: (value: unknown, name: string) => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}`);
    return value.trim();
  },
  requireRecentAuthentication: (context: typeof state.context) => state.recentProof(context),
}));
vi.mock('../../supabase/functions/_shared/cycle-worker.ts', () => ({
  triggerGraphCycleWorker: vi.fn(),
}));
vi.mock('../../supabase/functions/_shared/push-notifications.ts', () => ({
  notifyFinancialRequestPending: vi.fn(),
  notifySettlementProposalPending: vi.fn(),
  readPayloadString: () => null,
}));

type EndpointHandler = (request: Request) => Promise<unknown>;
const handlers = new Map<string, EndpointHandler>();
const normalEndpoints = [
  'create-balance-request',
  'accept-financial-request',
  'reject-financial-request',
  'amend-financial-request',
  'approve-cycle-settlement',
  'reject-cycle-settlement',
  'execute-approved-cycle-settlement',
] as const;
const trustedRow = {
  user_id: 'user-1',
  device_id: 'device-1',
  trusted_session_id: 'session-1',
  trust_state: 'trusted',
  trusted_at: '2026-10-07T10:00:00Z',
  revoked_at: null,
};

async function invoke(endpoint: string) {
  const handler = handlers.get(endpoint);
  if (!handler) throw new Error(`Missing handler for ${endpoint}`);
  return handler(new Request('https://example.test', { method: 'POST' }));
}

beforeAll(async () => {
  let loadingEndpoint = '';
  vi.stubGlobal('Deno', {
    serve: (handler: EndpointHandler) => handlers.set(loadingEndpoint, handler),
  });
  for (const endpoint of [...normalEndpoints, 'trust-current-device', 'request-account-deletion']) {
    loadingEndpoint = endpoint;
    await import(`../../supabase/functions/${endpoint}/index.ts`);
  }
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  state.body = {
    idempotencyKey: 'action-1',
    requestKind: 'balance_increase',
    responderUserId: 'user-2',
    debtorUserId: 'user-1',
    creditorUserId: 'user-2',
    amountMinor: 100,
    description: 'Shared bill',
    category: 'food_drinks',
    requestId: 'request-1',
    proposalId: 'proposal-1',
  };
  state.readDevice.mockResolvedValue({ data: trustedRow, error: null });
  state.rpc.mockResolvedValue({ data: { status: 'pending' }, error: null });
  state.avatarList.mockResolvedValue({ data: [{ name: 'photo.jpg' }], error: null });
  state.avatarRemove.mockResolvedValue({ data: [], error: null });
  state.deleteUser.mockResolvedValue({ data: null, error: null });
  state.recentProof.mockReturnValue({
    sessionId: 'session-1',
    method: 'password',
    authenticatedAt: '2026-10-07T10:02:00Z',
  });
});

describe('request-account-deletion device authorization', () => {
  it.each([null, { ...trustedRow, trust_state: 'revoked' }])(
    'rejects an unauthorized or revoked session before deleting any data: %j',
    async (data) => {
      state.readDevice.mockResolvedValue({ data, error: null });
      await expect(invoke('request-account-deletion')).rejects.toThrow(
        'device_authorization_required',
      );
      expect(state.avatarList).not.toHaveBeenCalled();
      expect(state.avatarRemove).not.toHaveBeenCalled();
      expect(state.rpc).not.toHaveBeenCalled();
      expect(state.deleteUser).not.toHaveBeenCalled();
    },
  );

  it('preserves deletion behavior for the authorized session after explicit client confirmation', async () => {
    await expect(invoke('request-account-deletion')).resolves.toEqual({
      status: 'pending',
      avatarObjectsRemoved: 1,
      authUserDeleted: true,
    });
    expect(state.avatarRemove).toHaveBeenCalledWith(['user-1/photo.jpg']);
    expect(state.rpc).toHaveBeenCalledWith('request_account_deletion', {
      p_actor_user_id: 'user-1',
      p_idempotency_key: 'action-1',
    });
    expect(state.deleteUser).toHaveBeenCalledWith('user-1', true);
    expect(state.recentProof).not.toHaveBeenCalled();
  });
});

describe.each(normalEndpoints)('%s device authorization', (endpoint) => {
  it('accepts the existing payload with no device ID and no fresh proof', async () => {
    await expect(invoke(endpoint)).resolves.toEqual({ status: 'pending' });
    expect(state.verifiedClient).toHaveBeenCalledWith(state.context);
    expect(state.rpc).toHaveBeenCalledOnce();
    expect(state.rpc.mock.calls[0]?.[1]).toMatchObject({ p_actor_user_id: 'user-1' });
    expect(state.recentProof).not.toHaveBeenCalled();
  });

  it('does not invoke the mutation when its verified session is unregistered', async () => {
    state.readDevice.mockResolvedValue({ data: null, error: null });
    // Client-controlled assertions must not authorize the request.
    state.body.deviceId = 'device-1';
    state.body.deviceAuthorized = true;
    await expect(invoke(endpoint)).rejects.toThrow('device_authorization_required');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('does not invoke the mutation after revocation or verification failure', async () => {
    state.readDevice.mockResolvedValue({
      data: { ...trustedRow, trust_state: 'revoked' },
      error: null,
    });
    await expect(invoke(endpoint)).rejects.toThrow('device_authorization_required');
    state.readDevice.mockResolvedValue({ data: null, error: new Error('database unavailable') });
    await expect(invoke(endpoint)).rejects.toThrow('database unavailable');
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe('trust-current-device authorization', () => {
  beforeEach(() => {
    state.body = { deviceId: 'device-1', platform: 'ios' };
  });

  it('returns existing trust without invoking a proof check or renewing its timestamp', async () => {
    state.recentProof.mockImplementation(() => {
      throw new Error('recent_auth_required');
    });
    await expect(invoke('trust-current-device')).resolves.toEqual({
      deviceId: 'device-1',
      trustState: 'trusted',
      trustedAt: trustedRow.trusted_at,
    });
    expect(state.recentProof).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...trustedRow, trust_state: 'pending', trusted_session_id: null },
    { ...trustedRow, trusted_session_id: 'previous-session' },
  ])('still requires a fresh verified proof to create or bind trust: %j', async (data) => {
    state.readDevice.mockResolvedValue({ data, error: null });
    state.recentProof.mockImplementation(() => {
      throw new Error('recent_auth_required');
    });
    await expect(invoke('trust-current-device')).rejects.toThrow('recent_auth_required');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('cannot reauthorize a revoked device with the login from before revocation', async () => {
    state.readDevice.mockResolvedValue({
      data: { ...trustedRow, trust_state: 'revoked', revoked_at: '2026-10-07T10:01:00Z' },
      error: null,
    });
    state.recentProof.mockReturnValue({
      sessionId: 'session-1',
      method: 'password',
      authenticatedAt: '2026-10-07T10:00:59Z',
    });
    await expect(invoke('trust-current-device')).rejects.toThrow('recent_auth_required');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('reauthorizes with a server proof from after revocation', async () => {
    state.readDevice.mockResolvedValue({
      data: { ...trustedRow, trust_state: 'revoked', revoked_at: '2026-10-07T10:01:00Z' },
      error: null,
    });
    await invoke('trust-current-device');
    expect(state.rpc).toHaveBeenCalledWith('trust_current_device', {
      p_actor_user_id: 'user-1',
      p_device_id: 'device-1',
      p_platform: 'ios',
      p_device_name: null,
      p_app_version: null,
      p_session_id: 'session-1',
      p_proof_method: 'password',
      p_proof_at: '2026-10-07T10:02:00Z',
    });
  });
});
