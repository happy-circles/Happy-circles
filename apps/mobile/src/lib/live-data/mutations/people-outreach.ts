import { useMutation } from '@tanstack/react-query';

import { createPeopleOutreachSchema } from '@happy-circles/shared';

import { resolveContactPhones } from '@/features/home/contact-resolution-service';
import { useSession } from '@/providers/session-provider';

import { invalidateInvitationState } from './contact-invalidation';
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
  return useMutation({
    mutationFn: async (input: {
      readonly channel: 'remote' | 'qr';
      readonly sourceContext?: string;
      readonly intendedRecipientAlias: string;
      readonly intendedRecipientPhoneE164: string;
      readonly intendedRecipientPhoneLabel?: string;
    }) => {
      return invokeParsedEdgeFunction<
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
    },
    onSuccess: (data, input) =>
      invalidateInvitationState(
        { phoneE164: input.intendedRecipientPhoneE164 },
        data.result?.status ?? data.status,
      ),
  });
}
