import { useMutation } from '@tanstack/react-query';

import { createPeopleOutreachSchema, resolvePeopleTargetsSchema } from '@happy-circles/shared';

import { invalidateAppSnapshot } from '../client';
import type { PeopleOutreachResult, PeopleTargetResolution } from '../types';
import { invokeParsedEdgeFunction, withIdempotencyKey } from './edge-action';

export function useResolvePeopleTargetsMutation() {
  return useMutation({
    mutationFn: async (phoneE164List: readonly string[]) => {
      return invokeParsedEdgeFunction<
        ReturnType<typeof resolvePeopleTargetsSchema.parse>,
        PeopleTargetResolution[]
      >('resolve-people-targets', resolvePeopleTargetsSchema, {
        phoneE164List,
      });
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
    onSuccess: invalidateAppSnapshot,
  });
}
