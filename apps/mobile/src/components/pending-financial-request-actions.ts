export type PendingFinancialRequestActionRole = 'sender' | 'receiver' | 'none';

export function pendingFinancialRequestActionRole(input: {
  readonly createdByCurrentUser?: boolean;
  readonly responseState: string;
}): PendingFinancialRequestActionRole {
  if (input.responseState === 'waiting_other_side' && input.createdByCurrentUser === true) {
    return 'sender';
  }
  if (input.responseState === 'requires_you' && input.createdByCurrentUser !== true) {
    return 'receiver';
  }
  return 'none';
}

export function canCorrectSenderFinancialRequest(input: {
  readonly createdByCurrentUser?: boolean;
  readonly responseState: string;
  readonly requestKind?: string;
}): boolean {
  return (
    input.requestKind === 'balance_increase' &&
    pendingFinancialRequestActionRole(input) === 'sender'
  );
}

export function assertCancellationAcknowledged(requestId: string, response: unknown): void {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const record = response as Record<string, unknown>;
    if (record.status === 'canceled' && record.requestId === requestId) return;
  }
  throw new Error('El servidor no confirmó la cancelación. Revisa el estado actualizado.');
}
