import { useMutation } from '@tanstack/react-query';

import {
  amendFinancialRequestSchema,
  createBalanceRequestSchema,
  requestDecisionSchema,
  type TransactionCategory,
} from '@happy-circles/shared';

import { DEFAULT_TRANSACTION_CATEGORY } from '../../transaction-categories';
import { invalidateAppSnapshot, invokeSupabaseFunction } from '../client';
import type { CreateRequestInput } from '../types';
import { parseEdgePayload, withIdempotencyKey } from './edge-action';
import {
  recordFinancialRequestAccepted,
  recordFinancialRequestCreated,
  recordFinancialRequestStarted,
} from './product-events';
import { useSensitiveMutationGuard } from './sensitive-action-guard';

export function useCreateRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (input: CreateRequestInput) => {
      const category = input.category ?? DEFAULT_TRANSACTION_CATEGORY;
      recordFinancialRequestStarted(category);
      await guardSensitiveAction('crear el movimiento');

      const payload = parseEdgePayload(
        createBalanceRequestSchema,
        withIdempotencyKey('mobile_balance_increase', {
          responderUserId: input.responderUserId,
          debtorUserId: input.debtorUserId,
          creditorUserId: input.creditorUserId,
          amountMinor: input.amountMinor,
          description: input.description,
          category,
          requestKind: 'balance_increase',
        }),
      );

      return invokeSupabaseFunction('create-balance-request', payload);
    },
    onSuccess: async () => {
      recordFinancialRequestCreated();
      await invalidateAppSnapshot();
    },
  });
}

export function useAcceptFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (requestId: string) => {
      await guardSensitiveAction('aceptar la solicitud');

      const payload = parseEdgePayload(
        requestDecisionSchema,
        withIdempotencyKey('accept_request', {
          requestId,
        }),
      );

      return invokeSupabaseFunction('accept-financial-request', payload);
    },
    onSuccess: async () => {
      recordFinancialRequestAccepted();
      await invalidateAppSnapshot();
    },
  });
}

export function useRejectFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (requestId: string) => {
      await guardSensitiveAction('rechazar la solicitud');

      const payload = parseEdgePayload(
        requestDecisionSchema,
        withIdempotencyKey('reject_request', {
          requestId,
        }),
      );

      return invokeSupabaseFunction('reject-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useAmendFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (input: {
      readonly requestId: string;
      readonly amountMinor: number;
      readonly description: string;
      readonly category?: TransactionCategory;
    }) => {
      await guardSensitiveAction('proponer un nuevo monto');

      const payload = parseEdgePayload(
        amendFinancialRequestSchema,
        withIdempotencyKey('amend_request', {
          requestId: input.requestId,
          amountMinor: input.amountMinor,
          description: input.description,
          category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
        }),
      );

      return invokeSupabaseFunction('amend-financial-request', payload);
    },
    onSuccess: invalidateAppSnapshot,
  });
}
