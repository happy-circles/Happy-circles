import { useMutation } from '@tanstack/react-query';

import { requestAccountDeletionSchema } from '@happy-circles/shared';

import { useSession } from '@/providers/session-provider';

import { assertSupabaseClient, invalidateAppSnapshot } from '../client';
import type { AccountDeletionRequestResult } from '../types';
import { uploadAvatar } from './avatar-upload';
import { invokeParsedEdgeFunction, withIdempotencyKey } from './edge-action';

export function useUpdateProfileAvatarMutation() {
  const session = useSession();

  return useMutation({
    mutationFn: async (input: { readonly uri: string; readonly contentType?: string | null }) => {
      const userId = session.userId;
      if (!userId) {
        throw new Error('No hay una sesion activa.');
      }

      return uploadAvatar(assertSupabaseClient(), input);
    },
    onSuccess: async () => {
      await session.refreshAccountState({ preserveTrustedDeviceDuringLoad: true });
      await invalidateAppSnapshot();
    },
  });
}

export function useRequestAccountDeletionMutation() {
  return useMutation({
    mutationFn: async () => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof requestAccountDeletionSchema.parse>,
        AccountDeletionRequestResult
      >(
        'request-account-deletion',
        requestAccountDeletionSchema,
        withIdempotencyKey('request_account_deletion', {}),
      );
    },
    onSuccess: async () => {
      await invalidateAppSnapshot();
    },
  });
}
