import { invalidatePeopleTargetResolutionCache } from '@/features/home/people-target-resolution-cache';
import {
  applyContactActionResult,
  invalidateContactResolutions,
  readContactResolutions,
  type ContactResolutionTarget,
} from '@/lib/contact-resolution-state';
import { queryClient } from '@/lib/query-client';
import { assertSupabaseClient, invalidateAppSnapshot } from '../client';
import { forgetInvitationIntentions } from './edge-action';

export async function invalidateInvitationState(
  target: ContactResolutionTarget = {},
  status?: string,
) {
  const { data } = await assertSupabaseClient().auth.getSession();
  const userId = data.session?.user.id;
  if (userId) {
    const scoped = { ...target, userId };
    if (status && ['accepted', 'rejected', 'canceled', 'expired'].includes(status)) {
      forgetInvitationIntentions(userId, target);
      for (const row of Object.values(readContactResolutions(userId))) {
        if (row.friendshipInviteId === target.inviteId || row.accountInviteId === target.inviteId) {
          forgetInvitationIntentions(userId, {
            phoneE164: row.phoneE164,
            matchedUserId: row.matchedUserId,
          });
        }
      }
    }
    if (status) applyContactActionResult(scoped, status);
    else invalidateContactResolutions(scoped);
    await invalidatePeopleTargetResolutionCache(userId).catch(() => undefined);
  }
  await Promise.all([
    invalidateAppSnapshot(),
    queryClient.invalidateQueries({ queryKey: ['friendship-invite-preview'] }),
    queryClient.invalidateQueries({ queryKey: ['account-invite-preview'] }),
  ]);
}
