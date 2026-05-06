import { useMutation, useQuery } from '@tanstack/react-query';

import {
  cancelFriendshipInviteSchema,
  claimExternalFriendshipInviteSchema,
  createExternalFriendshipInviteSchema,
  createInternalFriendshipInviteSchema,
  friendshipInviteDecisionSchema,
  friendshipInvitePreviewSchema,
  reviewExternalFriendshipInviteSchema,
} from '@happy-circles/shared';

import { useSession } from '@/providers/session-provider';

import { invalidateAppSnapshot } from '../client';
import type {
  FriendshipInviteActionResult,
  FriendshipInviteDeliveryResult,
  FriendshipInvitePreviewResult,
} from '../types';
import { invokeParsedEdgeFunction, withIdempotencyKey } from './edge-action';
import { recordFriendshipInviteAccepted, recordFriendshipInviteCreated } from './product-events';

export function useCreateInternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly targetUserId: string;
      readonly sourceContext?: string;
    }) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof createInternalFriendshipInviteSchema.parse>,
        FriendshipInviteActionResult
      >(
        'create-internal-friendship-invite',
        createInternalFriendshipInviteSchema,
        withIdempotencyKey('create_internal_friendship_invite', {
          targetUserId: input.targetUserId,
          sourceContext: input.sourceContext,
        }),
      );
    },
    onSuccess: async (_data, input) => {
      recordFriendshipInviteCreated({
        flow: 'internal',
        source: input.sourceContext ?? 'direct',
      });
      await invalidateAppSnapshot();
    },
  });
}

export function useCreateExternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly channel: 'remote' | 'qr';
      readonly sourceContext?: string;
      readonly intendedRecipientAlias?: string;
      readonly intendedRecipientPhoneE164?: string;
      readonly intendedRecipientPhoneLabel?: string;
    }) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof createExternalFriendshipInviteSchema.parse>,
        FriendshipInviteDeliveryResult
      >(
        'create-external-friendship-invite',
        createExternalFriendshipInviteSchema,
        withIdempotencyKey(`create_external_friendship_invite_${input.channel}`, {
          channel: input.channel,
          sourceContext: input.sourceContext,
          intendedRecipientAlias: input.intendedRecipientAlias,
          intendedRecipientPhoneE164: input.intendedRecipientPhoneE164,
          intendedRecipientPhoneLabel: input.intendedRecipientPhoneLabel,
        }),
      );
    },
    onSuccess: async (_data, input) => {
      recordFriendshipInviteCreated({
        channel: input.channel,
        flow: 'external',
        source: input.sourceContext ?? 'share',
      });
      await invalidateAppSnapshot();
    },
  });
}

export function useFriendshipInvitePreviewQuery(deliveryToken: string | null) {
  const { userId } = useSession();

  return useQuery({
    queryKey: ['friendship-invite-preview', userId ?? 'signed-out', deliveryToken ?? 'missing'],
    enabled: Boolean(userId && deliveryToken),
    queryFn: async () => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof friendshipInvitePreviewSchema.parse>,
        FriendshipInvitePreviewResult
      >('get-friendship-invite-preview', friendshipInvitePreviewSchema, {
        deliveryToken,
      });
    },
  });
}

export function useClaimExternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (deliveryToken: string) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof claimExternalFriendshipInviteSchema.parse>,
        FriendshipInviteActionResult
      >(
        'claim-external-friendship-invite',
        claimExternalFriendshipInviteSchema,
        withIdempotencyKey('claim_external_friendship_invite', {
          deliveryToken,
        }),
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useReviewExternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly inviteId: string;
      readonly decision: 'approve' | 'reject';
    }) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof reviewExternalFriendshipInviteSchema.parse>,
        FriendshipInviteActionResult
      >(
        'review-external-friendship-invite',
        reviewExternalFriendshipInviteSchema,
        withIdempotencyKey(`review_external_friendship_invite_${input.decision}`, {
          inviteId: input.inviteId,
          decision: input.decision,
        }),
      );
    },
    onSuccess: async (_data, input) => {
      if (input.decision === 'approve') {
        recordFriendshipInviteAccepted({
          flow: 'external',
          decision: input.decision,
        });
      }
      await invalidateAppSnapshot();
    },
  });
}

export function useRespondInternalFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (input: {
      readonly inviteId: string;
      readonly decision: 'accept' | 'reject';
    }) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof friendshipInviteDecisionSchema.parse>,
        FriendshipInviteActionResult
      >(
        'respond-internal-friendship-invite',
        friendshipInviteDecisionSchema,
        withIdempotencyKey(`respond_internal_friendship_invite_${input.decision}`, {
          inviteId: input.inviteId,
          decision: input.decision,
        }),
      );
    },
    onSuccess: async (_data, input) => {
      if (input.decision === 'accept') {
        recordFriendshipInviteAccepted({
          flow: 'internal',
          decision: input.decision,
        });
      }
      await invalidateAppSnapshot();
    },
  });
}

export function useCancelFriendshipInviteMutation() {
  return useMutation({
    mutationFn: async (inviteId: string) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof cancelFriendshipInviteSchema.parse>,
        FriendshipInviteActionResult
      >(
        'cancel-friendship-invite',
        cancelFriendshipInviteSchema,
        withIdempotencyKey('cancel_friendship_invite', {
          inviteId,
        }),
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}
