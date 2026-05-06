import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSupabaseClient: vi.fn(),
  createIdempotencyKey: vi.fn((prefix: string) => `${prefix}_fixed`),
  createSupportId: vi.fn(() => 'HC-TEST-0000-0000'),
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

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
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

vi.mock('../../idempotency', () => ({
  createIdempotencyKey: mocks.createIdempotencyKey,
}));

vi.mock('../../support-errors', () => ({
  createSupportId: mocks.createSupportId,
  readFunctionErrorDetails: mocks.readFunctionErrorDetails,
  reportAndCreateSupportError: mocks.reportAndCreateSupportError,
}));

import { useAccountInvitePreviewQuery } from './account-invites';
import { resolveAvatarUploadMetadata, uploadAvatar } from './avatar-upload';
import { withIdempotencyKey } from './edge-action';
import { useCreateRequestMutation } from './financial-requests';
import { markNotificationItemsViewed } from './notifications';
import { useApproveSettlementMutation } from './settlements';
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

function trustedSession(overrides: Partial<SensitiveMutationSession> = {}) {
  return {
    biometricLabel: 'Face ID',
    deviceTrustState: 'trusted',
    isEmailConfirmed: true,
    profileCompletionState: 'complete',
    stepUpAuth: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  } satisfies SensitiveMutationSession;
}

describe('live-data mutation helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIdempotencyKey.mockImplementation((prefix: string) => `${prefix}_fixed`);
    mocks.invokeSupabaseFunction.mockResolvedValue({});
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

    await expect(guardSensitiveMutationAction(session, 'crear el movimiento')).rejects.toThrow(
      'Confirma tu correo antes de mover dinero o aprobar cambios sensibles.',
    );
    expect(session.stepUpAuth).not.toHaveBeenCalled();
  });

  it('preserves step-up failure messages for sensitive actions', async () => {
    const session = trustedSession({
      stepUpAuth: vi.fn().mockResolvedValue({ success: false, error: 'authentication_failed' }),
    });

    await expect(guardSensitiveMutationAction(session, 'aprobar el Happy Circle')).rejects.toThrow(
      'No se pudo validar Face ID para aprobar el Happy Circle.',
    );
  });
});

describe('live-data mutation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIdempotencyKey.mockImplementation((prefix: string) => `${prefix}_fixed`);
    mocks.invokeSupabaseFunction.mockResolvedValue({});
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

    expect(session.stepUpAuth).toHaveBeenCalledTimes(1);
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith(
      'create-balance-request',
      expect.objectContaining({
        amountMinor: 1200,
        category: 'food_drinks',
        idempotencyKey: 'mobile_balance_increase_fixed',
        requestKind: 'balance_increase',
      }),
    );

    await mutation.onSuccess?.();
    expect(mocks.recordProductEventSafe).toHaveBeenCalledWith({
      eventName: 'financial_request_created',
      screenName: 'register',
    });
    expect(mocks.invalidateAppSnapshot).toHaveBeenCalled();
  });

  it('guards settlement approval and records the approval event', async () => {
    const session = trustedSession();
    mocks.useSession.mockReturnValue({ ...session, userId: 'user-1' });
    const mutation = useApproveSettlementMutation() as unknown as MutationOptions<string>;

    await mutation.mutationFn('44444444-4444-4444-8444-444444444444');

    expect(session.stepUpAuth).toHaveBeenCalledTimes(1);
    expect(mocks.invokeSupabaseFunction).toHaveBeenCalledWith('approve-cycle-settlement', {
      idempotencyKey: 'approve_settlement_fixed',
      proposalId: '44444444-4444-4444-8444-444444444444',
    });

    await mutation.onSuccess?.();
    expect(mocks.recordProductEventSafe).toHaveBeenCalledWith({
      eventName: 'settlement_proposal_approved',
      screenName: 'settlement_detail',
    });
    expect(mocks.invalidateAppSnapshot).toHaveBeenCalled();
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
});
