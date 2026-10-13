import { useMutation } from '@tanstack/react-query';

import {
  amendFinancialRequestSchema,
  cancelFinancialRequestSchema,
  correctFinancialRequestSchema,
  createBalanceRequestSchema,
  requestDecisionSchema,
  type TransactionCategory,
} from '@happy-circles/shared';

import { DEFAULT_TRANSACTION_CATEGORY } from '../../transaction-categories';
import { RetriableActionRegistry } from '../../retriable-action';
import { invalidateAppSnapshot, invokeSupabaseFunction } from '../client';
import type { CreateRequestInput } from '../types';
import { parseEdgePayload } from './edge-action';
import { confirmCreatedRequestInCache } from './confirmed-request-cache';
import { confirmSenderRequestInCache } from './confirmed-sender-request-cache';
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

const senderRequestIntentions = new RetriableActionRegistry();
const creationRequestIntentions = new RetriableActionRegistry();

interface SenderRequestInput extends ConfirmationRecovery {
  readonly requestId: string;
  readonly expectedVersion?: number;
}

interface CorrectFinancialRequestInput extends SenderRequestInput {
  readonly amountMinor: number;
  readonly description: string;
  readonly category?: TransactionCategory;
}

export function isFinancialRequestConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { readonly status?: number; readonly code?: string };
  return (
    details.status === 409 ||
    details.code === 'financial_request_version_conflict' ||
    details.code === 'financial_request_not_current' ||
    details.code === 'financial_request_not_pending'
  );
}

async function sendFinancialRequestCommand(
  expectedUserId: string,
  name: string,
  intent: Record<string, unknown>,
  schema:
    | typeof cancelFinancialRequestSchema
    | typeof correctFinancialRequestSchema
    | typeof requestDecisionSchema
    | typeof amendFinancialRequestSchema,
  keyPrefix = name,
): Promise<unknown> {
  const signature = JSON.stringify([expectedUserId, name, intent]);
  try {
    return await senderRequestIntentions.run(signature, keyPrefix, async (idempotencyKey) => {
      const payload = parseEdgePayload(schema, { ...intent, idempotencyKey });
      const response = await invokeSupabaseFunction(name, payload, { expectedUserId });
      // A committed command remains successful even if the next network refresh fails.
      await confirmSenderRequestInCache(expectedUserId, response).catch(() => undefined);
      return response;
    });
  } catch (error) {
    if (isFinancialRequestConflict(error)) {
      void invalidateAppSnapshot().catch(() => undefined);
    }
    throw error;
  }
}

export function useCorrectFinancialRequestMutation(options: FinancialRequestMutationOptions = {}) {
  const guardSensitiveAction = useSensitiveMutationGuard();
  return useMutation({
    mutationFn: (input: CorrectFinancialRequestInput) =>
      guardSensitiveAction(
        'corregir la solicitud',
        (expectedUserId) => {
          const sendRequest = () =>
            sendFinancialRequestCommand(
              expectedUserId,
              'correct-financial-request',
              {
                requestId: input.requestId,
                amountMinor: input.amountMinor,
                description: input.description.trim(),
                category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
                ...(input.expectedVersion === undefined
                  ? {}
                  : { expectedVersion: input.expectedVersion }),
              },
              correctFinancialRequestSchema,
            );
          return options.runRequest ? options.runRequest(sendRequest) : sendRequest();
        },
        input.forceConfirmation,
      ),
    onSuccess: () => {
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}

export function useCancelFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();
  return useMutation({
    mutationFn: (input: SenderRequestInput) =>
      guardSensitiveAction(
        'cancelar la solicitud',
        (expectedUserId) =>
          sendFinancialRequestCommand(
            expectedUserId,
            'cancel-financial-request',
            {
              requestId: input.requestId,
              ...(input.expectedVersion === undefined
                ? {}
                : { expectedVersion: input.expectedVersion }),
            },
            cancelFinancialRequestSchema,
          ),
        input.forceConfirmation,
      ),
    onSuccess: () => {
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}

export function useCreateRequestMutation(options: FinancialRequestMutationOptions = {}) {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (input: CreateRequestInput & ConfirmationRecovery) => {
      const category = input.category ?? DEFAULT_TRANSACTION_CATEGORY;
      recordFinancialRequestStarted(category);
      const intent = {
        responderUserId: input.responderUserId,
        debtorUserId: input.debtorUserId,
        creditorUserId: input.creditorUserId,
        amountMinor: input.amountMinor,
        description: input.description,
        category,
        requestKind: 'balance_increase',
      };

      return guardSensitiveAction(
        'crear el movimiento',
        (expectedUserId) => {
          const signature = JSON.stringify([expectedUserId, 'create-balance-request', intent]);
          const sendRequest = () =>
            creationRequestIntentions.run(
              signature,
              'mobile_balance_increase',
              async (idempotencyKey) => {
                const payload = parseEdgePayload(createBalanceRequestSchema, {
                  ...intent,
                  idempotencyKey,
                });
                const response = await invokeSupabaseFunction('create-balance-request', payload, {
                  expectedUserId,
                });
                confirmCreatedRequestInCache(expectedUserId, input, response);
                return response;
              },
            );
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
      return guardSensitiveAction('aceptar la solicitud', (expectedUserId) =>
        sendFinancialRequestCommand(
          expectedUserId,
          'accept-financial-request',
          { requestId },
          requestDecisionSchema,
          'accept_request',
        ),
      );
    },
    onSuccess: () => {
      recordFinancialRequestAccepted();
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}

export function useRejectFinancialRequestMutation() {
  const guardSensitiveAction = useSensitiveMutationGuard();

  return useMutation({
    mutationFn: async (requestId: string) => {
      return guardSensitiveAction('rechazar la solicitud', (expectedUserId) =>
        sendFinancialRequestCommand(
          expectedUserId,
          'reject-financial-request',
          { requestId },
          requestDecisionSchema,
          'reject_request',
        ),
      );
    },
    onSuccess: () => {
      void invalidateAppSnapshot().catch(() => undefined);
    },
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
      return guardSensitiveAction(
        'proponer un nuevo monto',
        (expectedUserId) => {
          const sendRequest = () =>
            sendFinancialRequestCommand(
              expectedUserId,
              'amend-financial-request',
              {
                requestId: input.requestId,
                amountMinor: input.amountMinor,
                description: input.description,
                category: input.category ?? DEFAULT_TRANSACTION_CATEGORY,
              },
              amendFinancialRequestSchema,
              'amend_request',
            );
          return options.runRequest ? options.runRequest(sendRequest) : sendRequest();
        },
        input.forceConfirmation,
      );
    },
    onSuccess: () => {
      void invalidateAppSnapshot().catch(() => undefined);
    },
  });
}
