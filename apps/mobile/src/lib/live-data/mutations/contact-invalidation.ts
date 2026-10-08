import {
  invalidatePeopleTargetResolutionCache,
  savePeopleTargetResolutionsToCache,
} from '@/features/home/people-target-resolution-cache';
import { forgetImmediateInviteRequest } from '@/features/people/immediate-invite-request';
import {
  applyContactActionResult,
  invalidateContactResolutions,
  readContactResolutionPhonesForTarget,
  readContactResolutions,
  type ContactResolutionTarget,
} from '@/lib/contact-resolution-state';
import { queryClient } from '@/lib/query-client';
import { assertSupabaseClient, invalidateAppSnapshot } from '../client';
import { forgetInvitationIntentions } from './edge-action';

export function refreshInvitationStateQueries() {
  // A committed action must not wait for unrelated screen queries to finish.
  void Promise.allSettled([
    invalidateAppSnapshot(),
    queryClient.invalidateQueries({ queryKey: ['friendship-invite-preview'] }),
    queryClient.invalidateQueries({ queryKey: ['account-invite-preview'] }),
  ]);
}

export async function invalidateInvitationState(
  target: ContactResolutionTarget = {},
  status?: string,
) {
  const { data } = await assertSupabaseClient().auth.getSession();
  const userId = data.session?.user.id;
  const hasContactTarget = Boolean(
    target.phoneE164 ||
    target.matchedUserId ||
    target.inviteId ||
    target.relationshipId ||
    target.watchIds?.length,
  );
  if (userId && hasContactTarget) {
    const scoped = { ...target, userId };
    const affectedPhones = readContactResolutionPhonesForTarget(userId, target);
    if (status && ['accepted', 'rejected', 'canceled', 'expired'].includes(status)) {
      forgetInvitationIntentions(userId, target);
      if (target.inviteId) forgetImmediateInviteRequest(userId, target.inviteId);
      for (const phone of affectedPhones) {
        const row = readContactResolutions(userId)[phone];
        if (!row) continue;
        forgetInvitationIntentions(userId, {
          phoneE164: row.phoneE164,
          matchedUserId: row.matchedUserId,
        });
        if (row.friendshipInviteId) forgetImmediateInviteRequest(userId, row.friendshipInviteId);
        if (row.accountInviteId) forgetImmediateInviteRequest(userId, row.accountInviteId);
      }
    }
    if (status) applyContactActionResult(scoped, status);
    else invalidateContactResolutions(scoped);
    void invalidatePeopleTargetResolutionCache(userId, target)
      .then(() =>
        savePeopleTargetResolutionsToCache(
          userId,
          affectedPhones.flatMap((phone) => {
            const row = readContactResolutions(userId)[phone];
            return row?.resolvedAt ? [row] : [];
          }),
        ),
      )
      .catch(() => undefined);
  }
  refreshInvitationStateQueries();
}
