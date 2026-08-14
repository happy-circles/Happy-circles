import { useMutation, useQuery } from '@tanstack/react-query';

import {
  accountInvitePreviewSchema,
  activateAccountFromInviteSchema,
  cancelAccountInviteSchema,
  resumeAccountInviteSchema,
  reviewAccountInviteSchema,
} from '@happy-circles/shared';

import { useSession } from '@/providers/session-provider';

import { invalidateAppSnapshot } from '../client';
import type { AccountInviteActionResult, AccountInvitePreviewResult } from '../types';
import { invokeParsedEdgeFunction, withIdempotencyKey } from './edge-action';

export function useAccountInvitePreviewQuery(deliveryToken: string | null) {
  const { userId } = useSession();

  return useQuery({
    queryKey: ['account-invite-preview', userId ?? 'signed-out', deliveryToken ?? 'missing'],
    enabled: Boolean(deliveryToken),
    queryFn: async () => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof accountInvitePreviewSchema.parse>,
        AccountInvitePreviewResult
      >(
        'get-account-invite-preview-public',
        accountInvitePreviewSchema,
        { deliveryToken },
        userId ? undefined : { authorization: 'omit' },
      );
    },
  });
}

export function useActivateAccountFromInviteMutation() {
  const session = useSession();

  return useMutation({
    mutationFn: async (input: {
      readonly deliveryToken: string;
      readonly currentDeviceId: string;
      readonly idempotencyKey?: string;
    }) => {
      if (session.deviceTrustState !== 'trusted') {
        throw new Error('Este teléfono aún no es confiable. Confíalo primero desde seguridad.');
      }

      return invokeParsedEdgeFunction<
        ReturnType<typeof activateAccountFromInviteSchema.parse>,
        AccountInviteActionResult
      >(
        'activate-account-from-invite',
        activateAccountFromInviteSchema,
        input.idempotencyKey
          ? {
              deliveryToken: input.deliveryToken,
              currentDeviceId: input.currentDeviceId,
              idempotencyKey: input.idempotencyKey,
            }
          : withIdempotencyKey('activate_account_from_invite', {
              deliveryToken: input.deliveryToken,
              currentDeviceId: input.currentDeviceId,
            }),
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useResumeAccountInviteMutation() {
  const session = useSession();

  return useMutation({
    mutationFn: async (input: {
      readonly currentDeviceId: string;
      readonly idempotencyKey?: string;
    }) => {
      if (session.deviceTrustState !== 'trusted') {
        throw new Error('Este teléfono aún no es confiable. Confíalo primero desde seguridad.');
      }

      return invokeParsedEdgeFunction<
        ReturnType<typeof resumeAccountInviteSchema.parse>,
        AccountInviteActionResult
      >(
        'resume-account-invite',
        resumeAccountInviteSchema,
        input.idempotencyKey
          ? {
              currentDeviceId: input.currentDeviceId,
              idempotencyKey: input.idempotencyKey,
            }
          : withIdempotencyKey('resume_account_invite', {
              currentDeviceId: input.currentDeviceId,
            }),
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useReviewAccountInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly inviteId: string;
      readonly decision: 'approve' | 'reject';
    }) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof reviewAccountInviteSchema.parse>,
        AccountInviteActionResult
      >(
        'review-account-invite',
        reviewAccountInviteSchema,
        withIdempotencyKey(`review_account_invite_${input.decision}`, {
          inviteId: input.inviteId,
          decision: input.decision,
        }),
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useCancelAccountInviteMutation() {
  return useMutation({
    mutationFn: async (inviteId: string) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof cancelAccountInviteSchema.parse>,
        AccountInviteActionResult
      >(
        'cancel-account-invite',
        cancelAccountInviteSchema,
        withIdempotencyKey('cancel_account_invite', {
          inviteId,
        }),
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}
