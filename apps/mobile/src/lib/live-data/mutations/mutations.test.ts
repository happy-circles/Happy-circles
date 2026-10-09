import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSupabaseClient: vi.fn(),
  createIdempotencyKey: vi.fn((prefix: string) => `${prefix}_fixed`),
  createSupportId: vi.fn(() => 'HC-TEST-0000-0000'),
  confirmIdentity: vi.fn(),
  confirmCreatedRequestInCache: vi.fn(),
  invalidateAppSnapshot: vi.fn(),
  invokeSupabaseFunction: vi.fn(),
  readFunctionErrorDetails: vi.fn(),
  recordProductEventSafe: vi.fn(),
  reportAndCreateSupportError: vi.fn((input: { readonly error: Error }) => input.error),
  useMutation: vi.fn((options: unknown) => options),
  useQuery: vi.fn((options: unknown) => options),
  useSession: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: mocks.useMutation,
  useQuery: mocks.useQuery,
}));

vi.mock('react', () => ({ useRef: (current: unknown) => ({ current }) }));

vi.mock('@/providers/identity-confirmation-provider', () => ({
  useIdentityConfirmation: () => ({ confirmIdentity: mocks.confirmIdentity }),
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

vi.mock('@/features/home/people-target-resolution-cache', () => ({
  invalidatePeopleTargetResolutionCache: vi.fn(async () => undefined),
}));

vi.mock('@/lib/query-client', () => ({
  queryClient: { invalidateQueries: vi.fn(async () => undefined) },
}));

vi.mock('@/providers/session-provider', () => ({
  useSession: mocks.useSession,
}));

vi.mock('../client', () => ({
  assertSupabaseClient: mocks.assertSupabaseClient,
  invalidateAppSnapshot: mocks.invalidateAppSnapshot,
  invokeSupabaseFunction: mocks.invokeSupabaseFunction,
}));

vi.mock('../../analytics-client', () => ({
  recordProductEventSafe: mocks.recordProductEventSafe,
}));

vi.mock('./confirmed-request-cache', () => ({
  confirmCreatedRequestInCache: mocks.confirmCreatedRequestInCache,
}));

vi.mock('../../avatar-prefetch', () => ({ prefetchAvatarPaths: vi.fn() }));
vi.mock('../snapshot-cache', () => ({
  replaceCurrentUserAvatarInSnapshot: vi.fn(),
  updateCachedSnapshotCurrentUserAvatar: vi.fn(),
}));

vi.mock('../../idempotency', () => ({
  createIdempotencyKey: mocks.createIdempotencyKey,
}));

vi.mock('../../support-errors', () => ({
  createSupportId: mocks.createSupportId,
  readFunctionErrorDetails: mocks.readFunctionErrorDetails,
  reportAndCreateSupportError: mocks.reportAndCreateSupportError,
}));

import {
  useAccountInvitePreviewQuery,
  useActivateAccountFromInviteMutation,
  useResumeAccountInviteMutation,
} from './account-invites';
import { resolveAvatarUploadMetadata, uploadAvatar } from './avatar-upload';
import { invokeParsedEdgeFunction, withIdempotencyKey } from './edge-action';
import {
  useAcceptFinancialRequestMutation,
  useAmendFinancialRequestMutation,
  useCreateRequestMutation,
  useRejectFinancialRequestMutation,
} from './financial-requests';
import { markNotificationItemsViewed, markNotificationViewsViewed } from './notifications';
import { useRequestAccountDeletionMutation } from './profile';
import {
  useApproveSettlementMutation,
  useExecuteSettlementMutation,
  useRejectSettlementMutation,
} from './settlements';
import {
  guardSensitiveMutationAction,
  type SensitiveMutationSession,
} from './sensitive-action-check';

interface MutationOptions<TInput = unknown> {
  readonly mutationFn: (input: TInput) => Promise<unknown>;
  readonly onSuccess?: (data?: unknown, input?: TInput) => Promise<void> | void;
}

interface QueryOptions {
  readonly enabled: boolean;
  readonly queryFn: () => Promise<unknown>;
  readonly queryKey: readonly unknown[];
}

function trustedSession(
  overrides: Partial<SensitiveMutationSession> & { readonly deviceTrustState?: string } = {},
) {
  return {
    biometricLabel: 'Face ID',
    deviceTrustState: 'trusted',
    isEmailConfirmed: true,
    profileCompletionState: 'complete',
    userId: 'user-1',
    isAuthorizedDeviceSession: true,
    isLocked: false,
    stepUpAuth: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe('live-data mutation helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIdempotencyKey.mockImplementation((prefix: string) => `${prefix}_fixed`);
    mocks.invokeSupabaseFunction.mockResolvedValue({});
    mocks.invalidateAppSnapshot.mockReset().mockResolvedValue(undefined);
    mocks.confirmIdentity.mockResolvedValue(true);
    mocks.readFunctionErrorDetails.mockResolvedValue({
      code: 'edge_failed',
      message: 'Edge failed',
      requestId: 'request-1',
      status: 500,
    });
    mocks.useSession.mockReturnValue({
      ...trustedSession(),
      refreshAccountState: vi.fn(),
      userId: 'user-1',
    });
  });

  it('builds idempotent payload inputs without hiding the original fields', () => {
    expect(withIdempotencyKey('create_thing', { inviteId: 'invite-1' })).toEqual({
      idempotencyKey: 'create_thing_fixed',
      inviteId: 'invite-1',
    });
  });

  it('rejects a provided actor mismatch before creating a retriable intention or invoking Edge', async () => {
    mocks.assertSupabaseClient.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'account-b' } } } }) },
    });
    const payload = {
      idempotencyKey: 'outreach-retry-key',
      intendedRecipientPhoneE164: '+573001234567',
    };
    await expect(
      invokeParsedEdgeFunction('create-people-outreach', { parse: () => payload }, payload, {
        expectedUserId: 'account-a',
      }),
    ).rejects.toThrow('sesión cambió');
    expect(mocks.invokeSupabaseFunction).not.toHaveBeenCalled();
    expect(mocks.createIdempotencyKey).not.toHaveBeenCalled();
  });

  it('preserves a provided matching actor when invoking the retriable command', async () => {
    mocks.assertSupabaseClient.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'account-a' } } } }) },
    });
    const payload = { idempotencyKey: 'outreach-matching-key' };
    await invokeParsedEdgeFunction('create-people-outreach', { parse: () => payload }, payload, {
      expectedUserId: 'account-a',
      authorization: 'session',
    });
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledExactlyOnceWith(
      'create-people-outreach',
      expect.any(Object),
      { expectedUserId: 'account-a', authorization: 'session' },
    );
  });

  it('keeps legacy invitation commands bound to the current actor when no option is provided', async () => {
    mocks.assertSupabaseClient.mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'legacy-actor' } } } }) },
    });
    const payload = { idempotencyKey: 'outreach-legacy-key' };
    await invokeParsedEdgeFunction('create-people-outreach', { parse: () => payload }, payload);
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledExactlyOnceWith(
      'create-people-outreach',
      expect.any(Object),
      { expectedUserId: 'legacy-actor' },
    );
  });

  it('normalizes avatar upload metadata from content type or URI', () => {
    expect(resolveAvatarUploadMetadata({ uri: 'file:///avatar.PNG' })).toEqual({
      contentType: 'image/png',
      fileExtension: 'png',
    });
    expect(
      resolveAvatarUploadMetadata({ contentType: ' image/webp ', uri: 'file:///avatar.jpg' }),
    ).toEqual({
      contentType: 'image/webp',
      fileExtension: 'webp',
    });
    expect(resolveAvatarUploadMetadata({ uri: 'file:///avatar.heic' })).toEqual({
      contentType: 'image/heic',
      fileExtension: 'heic',
    });
  });

  it('reports empty avatar upload payloads through support errors', async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    };

    await expect(uploadAvatar(client, { uri: 'file:///avatar.jpg' })).rejects.toThrow(
      'No se pudo actualizar la foto.',
    );
    expect(mocks.reportAndCreateSupportError).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'empty_payload',
        functionName: 'upload-avatar',
      }),
    );
  });

  it('blocks sensitive actions before step-up when account state is incomplete', async () => {
    const session = trustedSession({ isEmailConfirmed: false });

    await expect(
      guardSensitiveMutationAction(session, 'crear el movimiento', mocks.confirmIdentity),
    ).rejects.toThrow('Confirma tu correo antes de mover dinero o aprobar cambios sensibles.');
    expect(session.stepUpAuth).not.toHaveBeenCalled();
    expect(mocks.confirmIdentity).not.toHaveBeenCalled();
  });

  it('reports a declined inline confirmation as cancellation', async () => {
    const session = trustedSession({ isAuthorizedDeviceSession: false });
    mocks.confirmIdentity.mockResolvedValue(false);

    await expect(
      guardSensitiveMutationAction(session, 'aprobar el Happy Circle', mocks.confirmIdentity),
    ).rejects.toMatchObject({ name: 'IdentityConfirmationCancelledError' });
  });
});

describe('live-data mutation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIdempotencyKey.mockImplementation((prefix: string) => `${prefix}_fixed`);
    mocks.invokeSupabaseFunction.mockResolvedValue({});
    mocks.invalidateAppSnapshot.mockReset().mockResolvedValue(undefined);
    mocks.confirmIdentity.mockResolvedValue(true);
    mocks.useSession.mockReturnValue({
      ...trustedSession(),
      refreshAccountState: vi.fn(),
      userId: 'user-1',
    });
  });

  it('keeps account invite preview query keys and enabled state stable', async () => {
    const missingTokenQuery = useAccountInvitePreviewQuery(null) as unknown as QueryOptions;
    expect(missingTokenQuery.queryKey).toEqual(['account-invite-preview', 'user-1', 'missing']);
    expect(missingTokenQuery.enabled).toBe(false);

    const deliveryToken = 'delivery-token-123';
    const query = useAccountInvitePreviewQuery(deliveryToken) as unknown as QueryOptions;
    expect(query.queryKey).toEqual(['account-invite-preview', 'user-1', deliveryToken]);
    expect(query.enabled).toBe(true);
    await query.queryFn();
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith('get-account-invite-preview-public', {
      deliveryToken,
    });
  });

  it('omits Authorization only for a signed-out account invite preview', async () => {
    mocks.useSession.mockReturnValue({
      ...trustedSession(),
      refreshAccountState: vi.fn(),
      userId: null,
    });
    const deliveryToken = 'delivery-token-public';

    const query = useAccountInvitePreviewQuery(deliveryToken) as unknown as QueryOptions;
    expect(query.queryKey).toEqual(['account-invite-preview', 'signed-out', deliveryToken]);
    await query.queryFn();

    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith(
      'get-account-invite-preview-public',
      { deliveryToken },
      { authorization: 'omit' },
    );
  });

  it('blocks account invite activation from untrusted devices before invoking Edge', async () => {
    mocks.useSession.mockReturnValue({
      ...trustedSession({ deviceTrustState: 'pending' }),
      refreshAccountState: vi.fn(),
      userId: 'user-1',
    });
    const mutation = useActivateAccountFromInviteMutation() as unknown as MutationOptions<{
      readonly currentDeviceId: string;
      readonly deliveryToken: string;
    }>;

    await expect(
      mutation.mutationFn({
        currentDeviceId: 'device-1',
        deliveryToken: 'delivery-token-123',
      }),
    ).rejects.toThrow('Este teléfono aún no es confiable. Confíalo primero desde seguridad.');
    expect(mocks.invokeSupabaseFunction).not.toHaveBeenCalled();
  });

  it('passes account invite activation through for trusted devices', async () => {
    const mutation = useActivateAccountFromInviteMutation() as unknown as MutationOptions<{
      readonly currentDeviceId: string;
      readonly deliveryToken: string;
    }>;

    await mutation.mutationFn({
      currentDeviceId: 'device-1',
      deliveryToken: 'delivery-token-123',
    });

    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith('activate-account-from-invite', {
      currentDeviceId: 'device-1',
      deliveryToken: 'delivery-token-123',
      idempotencyKey: 'activate_account_from_invite_fixed',
    });
  });

  it('preserves a caller idempotency key across activation retries', async () => {
    const mutation = useActivateAccountFromInviteMutation() as unknown as MutationOptions<{
      readonly currentDeviceId: string;
      readonly deliveryToken: string;
      readonly idempotencyKey: string;
    }>;

    const input = {
      currentDeviceId: 'device-1',
      deliveryToken: 'delivery-token-123',
      idempotencyKey: 'activate_account_from_invite_same_attempt',
    };
    await mutation.mutationFn(input);
    await mutation.mutationFn(input);

    expect(mocks.invokeSupabaseFunction).toHaveBeenNthCalledWith(
      1,
      'activate-account-from-invite',
      input,
    );
    expect(mocks.invokeSupabaseFunction).toHaveBeenNthCalledWith(
      2,
      'activate-account-from-invite',
      input,
    );
    expect(mocks.createIdempotencyKey).not.toHaveBeenCalled();
  });

  it('resumes a claimed invite without requiring its original delivery token', async () => {
    const mutation = useResumeAccountInviteMutation() as unknown as MutationOptions<{
      readonly currentDeviceId: string;
      readonly idempotencyKey: string;
    }>;
    const input = {
      currentDeviceId: 'device-1',
      idempotencyKey: 'resume_account_invite_same_attempt',
    };

    await mutation.mutationFn(input);

    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith('resume-account-invite', input);
  });

  it('guards financial request creation before invoking the Edge Function', async () => {
    const session = trustedSession();
    mocks.useSession.mockReturnValue({ ...session, userId: 'user-1' });
    const mutation = useCreateRequestMutation() as unknown as MutationOptions<{
      readonly amountMinor: number;
      readonly category: 'food_drinks';
      readonly creditorUserId: string;
      readonly debtorUserId: string;
      readonly description: string;
      readonly responderUserId: string;
    }>;

    await mutation.mutationFn({
      amountMinor: 1200,
      category: 'food_drinks',
      creditorUserId: '33333333-3333-4333-8333-333333333333',
      debtorUserId: '22222222-2222-4222-8222-222222222222',
      description: 'Lunch',
      responderUserId: '11111111-1111-4111-8111-111111111111',
    });

    expect(session.stepUpAuth).not.toHaveBeenCalled();
    expect(mocks.confirmIdentity).not.toHaveBeenCalled();
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith(
      'create-balance-request',
      expect.objectContaining({
        amountMinor: 1200,
        category: 'food_drinks',
        idempotencyKey: 'mobile_balance_increase_fixed',
        requestKind: 'balance_increase',
      }),
      { expectedUserId: 'user-1' },
    );

    await mutation.onSuccess?.();
    expect(mocks.recordProductEventSafe).toHaveBeenCalledWith({
      eventName: 'financial_request_created',
      screenName: 'register',
    });
    expect(mocks.invalidateAppSnapshot).toHaveBeenCalled();
  });

  it('starts creation feedback only after authorization and reuses the intention on server recovery', async () => {
    mocks.useSession.mockReturnValue(trustedSession({ isAuthorizedDeviceSession: false }));
    let finishConfirmation: (value: boolean) => void = () => undefined;
    mocks.confirmIdentity.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishConfirmation = resolve;
        }),
    );
    mocks.invokeSupabaseFunction
      .mockRejectedValueOnce(
        Object.assign(new Error('Authorization required'), {
          code: 'device_authorization_required',
        }),
      )
      .mockResolvedValueOnce({ requestId: 'created', status: 'pending' });
    const runRequest = vi.fn((action: () => Promise<unknown>) => action());
    const input = {
      amountMinor: 1200,
      creditorUserId: '33333333-3333-4333-8333-333333333333',
      debtorUserId: '22222222-2222-4222-8222-222222222222',
      description: 'Lunch',
      responderUserId: '11111111-1111-4111-8111-111111111111',
    };
    const mutation = useCreateRequestMutation({ runRequest }) as unknown as MutationOptions<
      typeof input
    >;
    const save = mutation.mutationFn(input);
    expect(runRequest).not.toHaveBeenCalled();
    expect(mocks.invokeSupabaseFunction).not.toHaveBeenCalled();
    finishConfirmation(true);
    await expect(save).resolves.toEqual({ requestId: 'created', status: 'pending' });
    expect(runRequest).toHaveBeenCalledTimes(2);
    expect(mocks.confirmIdentity).toHaveBeenCalledTimes(2);
    const calls = mocks.invokeSupabaseFunction.mock.calls;
    expect(calls[0]?.[1]).toEqual(calls[1]?.[1]);
    expect(calls[0]?.[2]).toEqual({ expectedUserId: 'user-1' });
    expect(calls[1]?.[2]).toEqual({ expectedUserId: 'user-1' });
  });

  it.each(['pending', 'failed'] as const)(
    'finishes confirmed movement creation while screen synchronization is %s',
    async (refreshState) => {
      const response = { requestId: 'created-request', status: 'pending' };
      const input = {
        amountMinor: 1200,
        creditorUserId: '33333333-3333-4333-8333-333333333333',
        debtorUserId: '22222222-2222-4222-8222-222222222222',
        description: 'Lunch',
        responderUserId: '11111111-1111-4111-8111-111111111111',
      };
      mocks.invokeSupabaseFunction.mockResolvedValue(response);
      if (refreshState === 'pending') {
        mocks.invalidateAppSnapshot.mockImplementation(() => new Promise(() => {}));
      } else {
        mocks.invalidateAppSnapshot.mockRejectedValue(new Error('Synchronization failed'));
      }
      const mutation = useCreateRequestMutation() as unknown as MutationOptions<typeof input>;
      const save = async () => {
        const data = await mutation.mutationFn(input);
        await mutation.onSuccess?.(data, input);
        return data;
      };

      await expect(save()).resolves.toEqual(response);
      expect(mocks.confirmCreatedRequestInCache).toHaveBeenCalledWith('user-1', input, response);
      expect(mocks.invalidateAppSnapshot).toHaveBeenCalledOnce();
      expect(mocks.invokeSupabaseFunction).toHaveBeenCalledOnce();
    },
  );

  it('does not publish a pending movement when the server rejects creation', async () => {
    mocks.invokeSupabaseFunction.mockRejectedValue(new Error('Creation failed'));
    const mutation = useCreateRequestMutation() as unknown as MutationOptions;

    await expect(
      mutation.mutationFn({
        amountMinor: 1200,
        creditorUserId: '33333333-3333-4333-8333-333333333333',
        debtorUserId: '22222222-2222-4222-8222-222222222222',
        description: 'Lunch',
        responderUserId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow('Creation failed');
    expect(mocks.confirmCreatedRequestInCache).not.toHaveBeenCalled();
    expect(mocks.invalidateAppSnapshot).not.toHaveBeenCalled();
  });

  it('binds forced authorization to the submitted intention without sending UI recovery fields', async () => {
    const input = {
      amountMinor: 1200,
      creditorUserId: '33333333-3333-4333-8333-333333333333',
      debtorUserId: '22222222-2222-4222-8222-222222222222',
      description: 'Lunch',
      responderUserId: '11111111-1111-4111-8111-111111111111',
      forceConfirmation: 'device' as const,
    };
    const mutation = useCreateRequestMutation() as unknown as MutationOptions<typeof input>;
    await mutation.mutationFn(input);
    expect(mocks.confirmIdentity).toHaveBeenCalledExactlyOnceWith({
      actionLabel: 'crear el movimiento',
      purpose: 'device',
      force: true,
    });
    expect(mocks.invokeSupabaseFunction.mock.calls[0]?.[1]).not.toHaveProperty('forceConfirmation');
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledOnce();
  });

  it('guards settlement approval and records the approval event', async () => {
    const session = trustedSession();
    mocks.useSession.mockReturnValue({ ...session, userId: 'user-1' });
    const mutation = useApproveSettlementMutation() as unknown as MutationOptions<string>;

    await mutation.mutationFn('44444444-4444-4444-8444-444444444444');

    expect(session.stepUpAuth).not.toHaveBeenCalled();
    expect(mocks.confirmIdentity).not.toHaveBeenCalled();
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith(
      'approve-cycle-settlement',
      {
        idempotencyKey: 'approve_settlement_fixed',
        proposalId: '44444444-4444-4444-8444-444444444444',
      },
      { expectedUserId: 'user-1' },
    );

    await mutation.onSuccess?.();
    expect(mocks.recordProductEventSafe).toHaveBeenCalledWith({
      eventName: 'settlement_proposal_approved',
      screenName: 'settlement_detail',
    });
    expect(mocks.invalidateAppSnapshot).toHaveBeenCalled();
  });

  it.each([
    [
      'accept-financial-request',
      useAcceptFinancialRequestMutation,
      '55555555-5555-4555-8555-555555555555',
    ],
    [
      'reject-financial-request',
      useRejectFinancialRequestMutation,
      '55555555-5555-4555-8555-555555555555',
    ],
    [
      'amend-financial-request',
      useAmendFinancialRequestMutation,
      {
        requestId: '55555555-5555-4555-8555-555555555555',
        amountMinor: 1400,
        description: 'Updated lunch',
        category: 'food_drinks',
      },
    ],
    [
      'reject-cycle-settlement',
      useRejectSettlementMutation,
      '44444444-4444-4444-8444-444444444444',
    ],
    [
      'execute-approved-cycle-settlement',
      useExecuteSettlementMutation,
      '44444444-4444-4444-8444-444444444444',
    ],
  ] as const)(
    'binds %s to the initiating account and keeps cancellation from sending',
    async (functionName, hook, input) => {
      const mutation = hook() as unknown as MutationOptions;
      await mutation.mutationFn(input);
      expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith(functionName, expect.any(Object), {
        expectedUserId: 'user-1',
      });

      mocks.invokeSupabaseFunction.mockClear();
      mocks.useSession.mockReturnValue(trustedSession({ isAuthorizedDeviceSession: false }));
      mocks.confirmIdentity.mockResolvedValue(false);
      const blockedMutation = hook() as unknown as MutationOptions;
      await expect(blockedMutation.mutationFn(input)).rejects.toMatchObject({
        name: 'IdentityConfirmationCancelledError',
      });
      expect(mocks.invokeSupabaseFunction).not.toHaveBeenCalled();
    },
  );

  it('retries a definitive authorization rejection once with the identical request body and key', async () => {
    mocks.invokeSupabaseFunction.mockRejectedValueOnce(
      Object.assign(new Error('Authorize device'), { code: 'device_authorization_required' }),
    );
    const mutation = useApproveSettlementMutation() as unknown as MutationOptions<string>;
    await mutation.mutationFn('44444444-4444-4444-8444-444444444444');

    expect(mocks.confirmIdentity).toHaveBeenCalledExactlyOnceWith({
      actionLabel: 'aprobar el Happy Circle',
      purpose: 'device',
      force: true,
    });
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledTimes(2);
    const firstBody = mocks.invokeSupabaseFunction.mock.calls[0]?.[1] as unknown;
    expect(mocks.invokeSupabaseFunction.mock.calls[1]?.[1]).toBe(firstBody);
    expect(mocks.createIdempotencyKey).toHaveBeenCalledOnce();
    expect(mocks.invokeSupabaseFunction.mock.calls[1]?.[2]).toEqual({ expectedUserId: 'user-1' });
  });

  it('does not retry a financial mutation after an ambiguous network failure', async () => {
    const failure = new Error('Network request failed');
    mocks.invokeSupabaseFunction.mockRejectedValueOnce(failure);
    const mutation = useApproveSettlementMutation() as unknown as MutationOptions<string>;
    await expect(mutation.mutationFn('44444444-4444-4444-8444-444444444444')).rejects.toBe(failure);
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledOnce();
    expect(mocks.confirmIdentity).not.toHaveBeenCalled();
  });

  it('binds account deletion to the initiating account without repeating identity confirmation', async () => {
    const mutation = useRequestAccountDeletionMutation() as unknown as MutationOptions<undefined>;
    await mutation.mutationFn(undefined);
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledExactlyOnceWith(
      'request-account-deletion',
      { idempotencyKey: 'request_account_deletion_fixed' },
      { expectedUserId: 'user-1' },
    );
    expect(mocks.confirmIdentity).not.toHaveBeenCalled();
  });

  it('recovers a definitive deletion authorization rejection with the same payload and key', async () => {
    mocks.invokeSupabaseFunction.mockRejectedValueOnce(
      Object.assign(new Error('Authorize device'), { code: 'device_authorization_required' }),
    );
    const mutation = useRequestAccountDeletionMutation() as unknown as MutationOptions<undefined>;
    await mutation.mutationFn(undefined);
    expect(mocks.confirmIdentity).toHaveBeenCalledExactlyOnceWith({
      actionLabel: 'eliminar tu cuenta',
      purpose: 'device',
      force: true,
    });
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledTimes(2);
    expect(mocks.invokeSupabaseFunction.mock.calls[1]?.[1]).toStrictEqual(
      mocks.invokeSupabaseFunction.mock.calls[0]?.[1],
    );
    expect(mocks.invokeSupabaseFunction.mock.calls[1]?.[2]).toEqual({ expectedUserId: 'user-1' });
    expect(mocks.createIdempotencyKey).toHaveBeenCalledOnce();
  });

  it('dedupes notification views before upserting and invalidating', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    mocks.assertSupabaseClient.mockReturnValue({ from });

    await markNotificationItemsViewed('user-1', [
      { id: 'item-1', kind: 'financial_request', status: 'requires_you' },
      { id: 'item-1', kind: 'financial_request', status: 'requires_you' },
    ] as never);

    expect(from).toHaveBeenCalledWith('notification_views');
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          notification_key: 'financial_request:item-1:requires_you',
          user_id: 'user-1',
        }),
      ],
      { onConflict: 'user_id,notification_key' },
    );
    expect(mocks.invalidateAppSnapshot).toHaveBeenCalled();
  });

  it('can upsert custom notification view keys for discovery moments', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    mocks.assertSupabaseClient.mockReturnValue({ from });

    await markNotificationViewsViewed('user-1', [
      {
        notificationKey: 'circle_discovery:settlement-1',
        notificationKind: 'circle_discovery',
        notificationStatus: 'discovered',
        sourceItemId: 'settlement-1',
      },
      {
        notificationKey: 'circle_discovery:settlement-1',
        notificationKind: 'circle_discovery',
        notificationStatus: 'discovered',
        sourceItemId: 'settlement-1',
      },
    ]);

    expect(from).toHaveBeenCalledWith('notification_views');
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          notification_key: 'circle_discovery:settlement-1',
          notification_kind: 'circle_discovery',
          user_id: 'user-1',
        }),
      ],
      { onConflict: 'user_id,notification_key' },
    );
    expect(mocks.invalidateAppSnapshot).toHaveBeenCalled();
  });
});
