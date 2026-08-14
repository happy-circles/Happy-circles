import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FunctionErrorDetails {
  readonly code?: string;
  readonly message: string;
  readonly status?: number;
}

const mocks = vi.hoisted(() => ({
  createSupportId: vi.fn(() => 'HC-TEST-0000-0000'),
  invoke: vi.fn(),
  isJwtAuthError: vi.fn(() => false),
  publicInvoke: vi.fn(),
  readFunctionErrorDetails: vi.fn(
    (error: Error): Promise<FunctionErrorDetails> => Promise.resolve({ message: error.message }),
  ),
  refreshSession: vi.fn(),
  reportAndCreateSupportError: vi.fn((input: { readonly error: Error }) => input.error),
  signOut: vi.fn(),
}));

vi.mock('../query-client', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('../supabase', () => ({
  publicEdgeSupabase: {
    functions: { invoke: mocks.publicInvoke },
  },
  supabase: {
    auth: {
      refreshSession: mocks.refreshSession,
      signOut: mocks.signOut,
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('../support-errors', () => ({
  createSupportId: mocks.createSupportId,
  isJwtAuthError: mocks.isJwtAuthError,
  readFunctionErrorDetails: mocks.readFunctionErrorDetails,
  reportAndCreateSupportError: mocks.reportAndCreateSupportError,
}));

import { EDGE_FUNCTION_TIMEOUT_MS } from './constants';
import { invokeSupabaseFunction } from './client';

describe('live-data client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isJwtAuthError.mockReturnValue(false);
    mocks.readFunctionErrorDetails.mockImplementation((error: Error) =>
      Promise.resolve({ message: error.message }),
    );
  });

  it('bounds every Edge Function request and preserves its response', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(invokeSupabaseFunction('example-action', { value: 1 })).resolves.toEqual({
      ok: true,
    });
    expect(mocks.invoke).toHaveBeenCalledWith('example-action', {
      body: { value: 1 },
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': 'HC-TEST-0000-0000',
      },
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    });
    expect(mocks.publicInvoke).not.toHaveBeenCalled();
  });

  it('uses the authorization-free client only when omission is explicit', async () => {
    mocks.publicInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(
      invokeSupabaseFunction(
        'public-preview',
        { token: 'delivery-token' },
        {
          authorization: 'omit',
        },
      ),
    ).resolves.toEqual({ ok: true });

    expect(mocks.publicInvoke).toHaveBeenCalledWith('public-preview', {
      body: { token: 'delivery-token' },
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': 'HC-TEST-0000-0000',
      },
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('does not refresh or sign out a session for a public invocation error', async () => {
    mocks.isJwtAuthError.mockReturnValue(true);
    mocks.readFunctionErrorDetails.mockResolvedValue({
      code: 'auth_required',
      message: 'Authentication required',
      status: 401,
    });
    mocks.publicInvoke.mockResolvedValue({
      data: null,
      error: new Error('Authentication required'),
    });

    await expect(
      invokeSupabaseFunction('public-preview', {}, { authorization: 'omit' }),
    ).rejects.toThrow('Authentication required');

    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('turns an aborted request into a recoverable timeout message', async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { context: { name: 'AbortError' }, name: 'FunctionsFetchError' },
    });

    await expect(invokeSupabaseFunction('slow-action', {})).rejects.toThrow(
      'La solicitud tardó demasiado. Revisa tu conexión e intenta de nuevo.',
    );
    expect(mocks.reportAndCreateSupportError).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'request_timeout',
        functionName: 'slow-action',
      }),
    );
  });
});
