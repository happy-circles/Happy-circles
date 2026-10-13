import { useMutation } from '@tanstack/react-query';

import {
  cycleSettlementDecisionSchema,
  cycleSettlementExecutionSchema,
} from '@happy-circles/shared';

import { runDurableFinancialAction } from '../../durable-financial-action';
import { assertSupabaseClient, invalidateAppSnapshot, invokeSupabaseFunction } from '../client';
import { parseEdgePayload } from './edge-action';
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
    onSuccess: () => {
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}

function sendSettlementCommand(
  expectedUserId: string,
  name: string,
  proposalId: string,
  prefix: string,
  schema: typeof cycleSettlementDecisionSchema | typeof cycleSettlementExecutionSchema,
) {
  const intent = schema.omit({ idempotencyKey: true }).parse({ proposalId });
  return runDurableFinancialAction(expectedUserId, name, intent, prefix, (idempotencyKey) =>
    invokeSupabaseFunction(name, parseEdgePayload(schema, { ...intent, idempotencyKey }), {
      expectedUserId,
    }),
  );
}

export function useApproveSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: (proposalId: string) =>
      guardSensitiveAction('aprobar el Happy Circle', (expectedUserId) =>
        sendSettlementCommand(
          expectedUserId,
          'approve-cycle-settlement',
          proposalId,
          'approve_settlement',
          cycleSettlementDecisionSchema,
        ),
      ),
    onSuccess: () => {
      recordSettlementApproved();
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}

export function useRejectSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: (proposalId: string) =>
      guardSensitiveAction('no aprobar el Happy Circle', (expectedUserId) =>
        sendSettlementCommand(
          expectedUserId,
          'reject-cycle-settlement',
          proposalId,
          'reject_settlement',
          cycleSettlementDecisionSchema,
        ),
      ),
    onSuccess: () => {
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}

export function useExecuteSettlementMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: (proposalId: string) =>
      guardSensitiveAction('completar el Happy Circle', (expectedUserId) =>
        sendSettlementCommand(
          expectedUserId,
          'execute-approved-cycle-settlement',
          proposalId,
          'execute_settlement',
          cycleSettlementExecutionSchema,
        ),
      ),
    onSuccess: () => {
      recordSettlementExecuted();
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}
