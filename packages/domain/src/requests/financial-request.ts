import type {
  CurrencyCode,
  LedgerTransactionId,
  RequestId,
  RequestStatus,
  RequestType,
  UserId,
} from '@happy-circles/shared';
import { CURRENCY_CODE } from '@happy-circles/shared';

import { DomainError } from '../common/domain-error';
import { Money } from '../money/money';

export interface FinancialRequest {
  readonly id: RequestId;
  readonly requestType: RequestType;
  readonly status: RequestStatus;
  readonly creatorUserId: UserId;
  readonly responderUserId: UserId;
  readonly debtorUserId: UserId;
  readonly creditorUserId: UserId;
  readonly amount: Money;
  readonly description: string;
  readonly parentRequestId?: RequestId;
  readonly targetLedgerTransactionId?: LedgerTransactionId;
}

export interface CreateFinancialRequestParams {
  readonly id: RequestId;
  readonly requestType: RequestType;
  readonly creatorUserId: UserId;
  readonly responderUserId: UserId;
  readonly debtorUserId: UserId;
  readonly creditorUserId: UserId;
  readonly amountMinor: number;
  readonly description: string;
  readonly currencyCode?: CurrencyCode;
  readonly parentRequestId?: RequestId;
  readonly targetLedgerTransactionId?: LedgerTransactionId;
}

export function createFinancialRequest(params: CreateFinancialRequestParams): FinancialRequest {
  if (params.creatorUserId === params.responderUserId) {
    throw new DomainError(
      'request.same_creator_and_responder',
      'A financial request requires two different participants.',
    );
  }

  if (params.debtorUserId === params.creditorUserId) {
    throw new DomainError(
      'request.same_debtor_and_creditor',
      'The debtor and creditor must be different users.',
    );
  }

  const amount = new Money(params.amountMinor, params.currencyCode ?? CURRENCY_CODE);
  if (!amount.isPositive()) {
    throw new DomainError('request.non_positive_amount', 'Request amount must be positive.');
  }

  return {
    id: params.id,
    requestType: params.requestType,
    status: 'pending',
    creatorUserId: params.creatorUserId,
    responderUserId: params.responderUserId,
    debtorUserId: params.debtorUserId,
    creditorUserId: params.creditorUserId,
    amount,
    description: params.description.trim(),
    ...(params.parentRequestId ? { parentRequestId: params.parentRequestId } : {}),
    ...(params.targetLedgerTransactionId
      ? { targetLedgerTransactionId: params.targetLedgerTransactionId }
      : {}),
  };
}

export function acceptFinancialRequest(request: FinancialRequest): FinancialRequest {
  assertPending(request);
  return { ...request, status: 'accepted' };
}

export function rejectFinancialRequest(request: FinancialRequest): FinancialRequest {
  assertPending(request);
  return { ...request, status: 'rejected' };
}

export function counterFinancialRequest(
  request: FinancialRequest,
  nextRequest: FinancialRequest,
): { closedRequest: FinancialRequest; counterRequest: FinancialRequest } {
  assertPending(request);
  if (nextRequest.parentRequestId !== request.id) {
    throw new DomainError(
      'request.invalid_counter_parent',
      'The counteroffer must reference the original request.',
    );
  }

  return {
    closedRequest: { ...request, status: 'countered' },
    counterRequest: nextRequest,
  };
}

function assertPending(request: FinancialRequest): void {
  if (request.status !== 'pending') {
    throw new DomainError(
      'request.invalid_status_transition',
      `Request ${request.id} is already resolved.`,
    );
  }
}
