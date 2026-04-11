import type {
  AccountKind,
  CurrencyCode,
  EntrySide,
  LedgerAccountId,
  LedgerTransactionId,
  RequestType,
  TransactionSourceType,
  TransactionType,
  UserId,
} from '@happy-circles/shared';

import { CURRENCY_CODE } from '@happy-circles/shared';

import { DomainError } from '../common/domain-error';
import type { FinancialRequest } from '../requests/financial-request';

export interface LedgerAccount {
  readonly id: LedgerAccountId;
  readonly ownerUserId: UserId;
  readonly counterpartyUserId: UserId;
  readonly accountKind: AccountKind;
  readonly currencyCode: CurrencyCode;
}

export interface LedgerEntry {
  readonly ledgerAccountId: LedgerAccountId;
  readonly entrySide: EntrySide;
  readonly amountMinor: number;
  readonly entryOrder: number;
}

export interface LedgerTransaction {
  readonly id: LedgerTransactionId;
  readonly transactionType: TransactionType;
  readonly sourceType: TransactionSourceType;
  readonly description: string;
  readonly originRequestId?: string;
  readonly reversesTransactionId?: LedgerTransactionId;
  readonly entries: readonly LedgerEntry[];
}

export interface LedgerAccountsByPair {
  readonly debtorPayableAccount: LedgerAccount;
  readonly creditorReceivableAccount: LedgerAccount;
}

export function buildAcceptedRequestTransaction(
  transactionId: LedgerTransactionId,
  request: FinancialRequest,
  accounts: LedgerAccountsByPair,
): LedgerTransaction {
  if (request.requestKind === 'transaction_reversal') {
    throw new DomainError(
      'ledger.reversal_requires_original_transaction',
      'Use buildReversalTransaction for transaction reversals.',
    );
  }

  const entries =
    buildBalanceIncreaseAcceptanceEntries(request.amount.amountMinor, accounts);

  assertBalanced(entries);

  return {
    id: transactionId,
    transactionType: mapRequestKindToTransactionType(request.requestKind),
    sourceType: 'user',
    description: request.description,
    originRequestId: request.id,
    entries,
  };
}

export function buildReversalTransaction(
  transactionId: LedgerTransactionId,
  original: LedgerTransaction,
): LedgerTransaction {
  const reversedEntries = original.entries.map((entry) => ({
    ...entry,
    entrySide: reverseEntrySide(entry.entrySide),
  }));

  assertBalanced(reversedEntries);

  return {
    id: transactionId,
    transactionType: 'transaction_reversal_acceptance',
    sourceType: 'user',
    description: `Reversal of ${original.id}`,
    reversesTransactionId: original.id,
    entries: reversedEntries,
  };
}

export function entrySignedAmount(entry: LedgerEntry, accountKind: AccountKind): number {
  if (accountKind === 'receivable') {
    return entry.entrySide === 'debit' ? entry.amountMinor : -entry.amountMinor;
  }

  return entry.entrySide === 'credit' ? entry.amountMinor : -entry.amountMinor;
}

export function accountBalance(accountKind: AccountKind, entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + entrySignedAmount(entry, accountKind), 0);
}

export function assertCopCurrency(currencyCode: CurrencyCode): void {
  if (currencyCode !== CURRENCY_CODE) {
    throw new DomainError('ledger.invalid_currency', 'Happy Circles MVP only supports COP.');
  }
}

function buildBalanceIncreaseAcceptanceEntries(
  amountMinor: number,
  accounts: LedgerAccountsByPair,
): readonly LedgerEntry[] {
  return [
    {
      ledgerAccountId: accounts.creditorReceivableAccount.id,
      entrySide: 'debit',
      amountMinor,
      entryOrder: 1,
    },
    {
      ledgerAccountId: accounts.debtorPayableAccount.id,
      entrySide: 'credit',
      amountMinor,
      entryOrder: 2,
    },
  ];
}

function mapRequestKindToTransactionType(requestKind: RequestType): TransactionType {
  switch (requestKind) {
    case 'balance_increase':
      return 'balance_increase_acceptance';
    case 'transaction_reversal':
      return 'transaction_reversal_acceptance';
    default: {
      throw new DomainError('ledger.unsupported_request_type', 'Unsupported request type.');
    }
  }
}

function reverseEntrySide(side: EntrySide): EntrySide {
  return side === 'debit' ? 'credit' : 'debit';
}

function assertBalanced(entries: readonly LedgerEntry[]): void {
  const signedTotal = entries.reduce(
    (sum, entry) => sum + (entry.entrySide === 'debit' ? entry.amountMinor : -entry.amountMinor),
    0,
  );

  if (signedTotal !== 0) {
    throw new DomainError('ledger.unbalanced_transaction', 'Ledger entries must balance to zero.');
  }
}
