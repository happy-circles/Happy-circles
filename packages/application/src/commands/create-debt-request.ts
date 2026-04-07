import type { FinancialRequest } from '@happy-circles/domain';
import { createFinancialRequest } from '@happy-circles/domain';
import type { RequestId, UserId } from '@happy-circles/shared';

import type { FinancialRequestRepository, IdGeneratorPort } from '../ports';

export interface CreateDebtRequestInput {
  readonly creatorUserId: UserId;
  readonly responderUserId: UserId;
  readonly debtorUserId: UserId;
  readonly creditorUserId: UserId;
  readonly amountMinor: number;
  readonly description: string;
}

export async function createDebtRequestCommand(
  deps: {
    readonly ids: IdGeneratorPort;
    readonly requests: FinancialRequestRepository;
  },
  input: CreateDebtRequestInput,
): Promise<FinancialRequest> {
  const request = createFinancialRequest({
    id: deps.ids.uuid() as RequestId,
    requestType: 'debt',
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
