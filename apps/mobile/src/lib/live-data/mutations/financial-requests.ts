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
import { confirmCreatedRequestInCache } from './confirmed-request-cache';
import {
  recordFinancialRequestAccepted,
  recordFinancialRequestCreated,
  recordFinancialRequestStarted,
} from './product-events';
import { useSensitiveMutationGuard } from './sensitive-action-guard';

interface FinancialRequestMutationOptions {
  readonly runRequest?: (action: () => Promise<unknown>) => Promise<unknown>;
}

interface ConfirmationRecovery {
  readonly forceConfirmation?: 'device' | 'sensitive';
}

export function useCreateRequestMutation(options: FinancialRequestMutationOptions = {}) {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (input: CreateRequestInput & ConfirmationRecovery) => {
      const category = input.category ?? DEFAULT_TRANSACTION_CATEGORY;
      recordFinancialRequestStarted(category);
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

      return guardSensitiveAction(
        'crear el movimiento',
        (expectedUserId) => {
          const sendRequest = async () => {
            const response = await invokeSupabaseFunction('create-balance-request', payload, {
              expectedUserId,
            });
            confirmCreatedRequestInCache(expectedUserId, input, response);
            return response;
          };
          return options.runRequest ? options.runRequest(sendRequest) : sendRequest();
        },
        input.forceConfirmation,
      );
    },
    onSuccess: () => {
      recordFinancialRequestCreated();
      // The command is committed; screen synchronization must not prolong saving
      // or turn a successful financial request into an apparent failure.
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}

export function useAcceptFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const payload = parseEdgePayload(
        requestDecisionSchema,
        withIdempotencyKey('accept_request', {
          requestId,
        }),
      );

      return guardSensitiveAction('aceptar la solicitud', (expectedUserId) =>
        invokeSupabaseFunction('accept-financial-request', payload, { expectedUserId }),
      );
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
      const payload = parseEdgePayload(
        requestDecisionSchema,
        withIdempotencyKey('reject_request', {
          requestId,
        }),
      );

      return guardSensitiveAction('rechazar la solicitud', (expectedUserId) =>
        invokeSupabaseFunction('reject-financial-request', payload, { expectedUserId }),
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}

export function useAmendFinancialRequestMutation(options: FinancialRequestMutationOptions = {}) {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (input: {
      readonly requestId: string;
      readonly amountMinor: number;
      readonly description: string;
      readonly category?: TransactionCategory;
      readonly forceConfirmation?: ConfirmationRecovery['forceConfirmation'];
    }) => {
      const payload = parseEdgePayload(
        amendFinancialRequestSchema,
        withIdempotencyKey('amend_request', {
          requestId: input.requestId,
          amountMinor: input.amountMinor,
          description: input.description,
          category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
        }),
      );

      return guardSensitiveAction(
        'proponer un nuevo monto',
        (expectedUserId) => {
          const sendRequest = () =>
            invokeSupabaseFunction('amend-financial-request', payload, { expectedUserId });
          return options.runRequest ? options.runRequest(sendRequest) : sendRequest();
        },
        input.forceConfirmation,
      );
    },
    onSuccess: invalidateAppSnapshot,
  });
}
