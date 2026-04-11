import type { FinancialRequest } from '@happy-circles/domain';
import { createFinancialRequest } from '@happy-circles/domain';
import type { RequestId, RequestType, UserId } from '@happy-circles/shared';

import type { FinancialRequestRepository, IdGeneratorPort } from '../ports';

export interface CreateBalanceRequestInput {
  readonly creatorUserId: UserId;
  readonly responderUserId: UserId;
  readonly debtorUserId: UserId;
  readonly creditorUserId: UserId;
  readonly amountMinor: number;
  readonly description: string;
  readonly requestKind: Extract<RequestType, 'balance_increase'>;
}

export async function createBalanceRequestCommand(
  deps: {
    readonly ids: IdGeneratorPort;
    readonly requests: FinancialRequestRepository;
  },
  input: CreateBalanceRequestInput,
): Promise<FinancialRequest> {
  const request = createFinancialRequest({
    id: deps.ids.uuid() as RequestId,
    requestKind: input.requestKind,
    creatorUserId: input.creatorUserId,
    responderUserId: input.responderUserId,
    debtorUserId: input.debtorUserId,
    creditorUserId: input.creditorUserId,
    amountMinor: input.amountMinor,
    description: input.description,
  });

  await deps.requests.insert(request);
  return request;
}
