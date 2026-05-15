import { useMutation } from '@tanstack/react-query';

import {
  cycleSettlementDecisionSchema,
  cycleSettlementExecutionSchema,
} from '@happy-circles/shared';

import { assertSupabaseClient, invalidateAppSnapshot, invokeSupabaseFunction } from '../client';
import { parseEdgePayload, withIdempotencyKey } from './edge-action';
import { recordSettlementApproved, recordSettlementExecuted } from './product-events';
import { useSensitiveMutationGuard } from './sensitive-action-guard';

export interface ClaimHappyCircleTreasureResult {
  readonly scoreDelta: number;
  readonly scoreEventId: string;
  readonly settlementProposalId: string;
  readonly status: 'already_claimed' | 'claimed';
  readonly treasureClaimedAt: string;
}

function parseClaimHappyCircleTreasureResult(value: unknown): ClaimHappyCircleTreasureResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Respuesta inesperada al reclamar el tesoro.');
  }

  const record = value as Record<string, unknown>;
  const status = record.status;
  const scoreDelta = record.scoreDelta;
  const scoreEventId = record.scoreEventId;
  const settlementProposalId = record.settlementProposalId;
  const treasureClaimedAt = record.treasureClaimedAt;

  if (
    (status !== 'claimed' && status !== 'already_claimed') ||
    typeof scoreDelta !== 'number' ||
    typeof scoreEventId !== 'string' ||
    typeof settlementProposalId !== 'string' ||
    typeof treasureClaimedAt !== 'string'
  ) {
    throw new Error('Respuesta incompleta al reclamar el tesoro.');
  }

  return {
    scoreDelta,
    scoreEventId,
    settlementProposalId,
    status,
    treasureClaimedAt,
  };
}

export function useClaimHappyCircleTreasureMutation() {
  return useMutation({
    mutationFn: async (scoreEventId: string) => {
      const client = assertSupabaseClient();
      const { data, error } = await client.rpc('claim_happy_circle_treasure', {
        p_score_event_id: scoreEventId,
      });

      if (error) {
        throw new Error(error.message);
      }

      return parseClaimHappyCircleTreasureResult(data);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

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
