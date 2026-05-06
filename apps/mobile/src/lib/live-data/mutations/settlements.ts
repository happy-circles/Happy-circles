import { useMutation } from '@tanstack/react-query';

import {
  cycleSettlementDecisionSchema,
  cycleSettlementExecutionSchema,
} from '@happy-circles/shared';

import { invalidateAppSnapshot, invokeSupabaseFunction } from '../client';
import { parseEdgePayload, withIdempotencyKey } from './edge-action';
import { recordSettlementApproved, recordSettlementExecuted } from './product-events';
import { useSensitiveMutationGuard } from './sensitive-action-guard';

export function useApproveSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      await guardSensitiveAction('aprobar el Happy Circle');

      const payload = parseEdgePayload(
        cycleSettlementDecisionSchema,
        withIdempotencyKey('approve_settlement', {
          proposalId,
        }),
      );

      return invokeSupabaseFunction('approve-cycle-settlement', payload);
    },
    onSuccess: async () => {
      recordSettlementApproved();
      await invalidateAppSnapshot();
    },
  });
}

export function useRejectSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      await guardSensitiveAction('no aprobar el Happy Circle');

      const payload = parseEdgePayload(
        cycleSettlementDecisionSchema,
        withIdempotencyKey('reject_settlement', {
          proposalId,
        }),
      );

      return invokeSupabaseFunction('reject-cycle-settlement', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useExecuteSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      await guardSensitiveAction('completar el Happy Circle');

      const payload = parseEdgePayload(
        cycleSettlementExecutionSchema,
        withIdempotencyKey('execute_settlement', {
          proposalId,
        }),
      );

      return invokeSupabaseFunction('execute-approved-cycle-settlement', payload);
    },
    onSuccess: async () => {
      recordSettlementExecuted();
      await invalidateAppSnapshot();
    },
  });
}
