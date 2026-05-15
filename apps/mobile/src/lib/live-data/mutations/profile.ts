import { useMutation } from '@tanstack/react-query';

import { requestAccountDeletionSchema } from '@happy-circles/shared';

import { useSession } from '@/providers/session-provider';
import { queryClient } from '../../query-client';

import { assertSupabaseClient, invalidateAppSnapshot } from '../client';
import { APP_SNAPSHOT_QUERY_KEY } from '../constants';
import {
  replaceCurrentUserAvatarInSnapshot,
  updateCachedSnapshotCurrentUserAvatar,
} from '../snapshot-cache';
import type { AccountDeletionRequestResult } from '../types';
import type { AppSnapshot } from '../types';
import { prefetchAvatarPaths } from '../../avatar-prefetch';
import { uploadAvatar } from './avatar-upload';
import { invokeParsedEdgeFunction, withIdempotencyKey } from './edge-action';

export function useUpdateProfileAvatarMutation() {
  const session = useSession();

  return useMutation({
    mutationFn: async (input: { readonly uri: string; readonly contentType?: string | null }) => {
      const userId = session.userId;
      if (!userId) {
        throw new Error('No hay una sesión activa.');
      }

      return uploadAvatar(assertSupabaseClient(), input);
    },
    onSuccess: async (avatarPath) => {
      const userId = session.userId;
      if (userId) {
        queryClient.setQueryData<AppSnapshot>(
          [APP_SNAPSHOT_QUERY_KEY, userId],
          (currentSnapshot) =>
            currentSnapshot
              ? replaceCurrentUserAvatarInSnapshot(currentSnapshot, avatarPath)
              : currentSnapshot,
        );
        void updateCachedSnapshotCurrentUserAvatar(userId, avatarPath).catch(() => undefined);
      }

      await prefetchAvatarPaths([avatarPath], { timeoutMs: 700 }).catch(() => false);
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
