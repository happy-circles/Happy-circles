import { useMutation } from '@tanstack/react-query';

import { createPeopleOutreachSchema } from '@happy-circles/shared';

import { resolveContactPhones } from '@/features/home/contact-resolution-service';
import { savePeopleTargetResolutionsToCache } from '@/features/home/people-target-resolution-cache';
import { rememberImmediateInviteRequest } from '@/features/people/immediate-invite-request';
import {
  beginContactResolutionWrite,
  mergeContactResolutions,
  readContactResolutions,
} from '@/lib/contact-resolution-state';
import { useSession } from '@/providers/session-provider';

import { refreshInvitationStateQueries } from './contact-invalidation';
import {
  contactResolutionForOutreach,
  friendshipOutreachOutcome,
} from './people-outreach-confirmation';
import type { PeopleOutreachResult } from '../types';
import { invokeParsedEdgeFunction, withIdempotencyKey } from './edge-action';

export function useResolvePeopleTargetsMutation() {
  const { userId } = useSession();
  return useMutation({
    mutationFn: async (phoneE164List: readonly string[]) => {
      if (!userId) throw new Error('Inicia sesión para consultar tus contactos.');
      return resolveContactPhones(userId, phoneE164List, 'interactive', true);
    },
  });
}

export function useCreatePeopleOutreachMutation() {
  const { userId } = useSession();
  return useMutation({
    mutationFn: async (input: {
      readonly channel: 'remote' | 'qr';
      readonly sourceContext?: string;
      readonly intendedRecipientAlias: string;
      readonly intendedRecipientPhoneE164: string;
      readonly intendedRecipientPhoneLabel?: string;
    }) => {
      const phoneE164 = input.intendedRecipientPhoneE164;
      const previous = userId ? readContactResolutions(userId)[phoneE164] : undefined;
      const expectedGenerations = userId
        ? beginContactResolutionWrite(userId, [phoneE164])
        : undefined;
      try {
        const response = await invokeParsedEdgeFunction<
          ReturnType<typeof createPeopleOutreachSchema.parse>,
          PeopleOutreachResult
        >(
          'create-people-outreach',
          createPeopleOutreachSchema,
          withIdempotencyKey(`create_people_outreach_${input.channel}`, {
            channel: input.channel,
            sourceContext: input.sourceContext,
            intendedRecipientAlias: input.intendedRecipientAlias,
            intendedRecipientPhoneE164: input.intendedRecipientPhoneE164,
            intendedRecipientPhoneLabel: input.intendedRecipientPhoneLabel,
          }),
        );
        if (userId) {
          const confirmed = contactResolutionForOutreach(phoneE164, response, previous);
          const accepted = mergeContactResolutions(userId, [confirmed], { expectedGenerations });
          if (accepted.length) {
            void savePeopleTargetResolutionsToCache(userId, accepted).catch(() => undefined);
            rememberImmediateInviteRequest(userId, accepted[0], {
              alias: input.intendedRecipientAlias,
              phoneLabel: input.intendedRecipientPhoneLabel,
              expiresAt:
                response.kind === 'friendship'
                  ? friendshipOutreachOutcome(response).expiresAt
                  : response.result && 'inviteExpiresAt' in response.result
                    ? response.result.inviteExpiresAt
                    : null,
            });
          }
        }
        return response;
      } finally {
        expectedGenerations?.finish();
      }
    },
    onSuccess: refreshInvitationStateQueries,
  });
}
