export interface HomeSummaryDto {
  readonly netBalanceMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}

export interface RelationshipListItemDto {
  readonly userId: string;
  readonly displayName: string;
  readonly netAmountMinor: number;
  readonly direction: 'i_owe' | 'owes_me';
}

export interface InboxItemDto {
  readonly id: string;
  readonly kind: 'financial_request' | 'settlement_proposal';
  readonly title: string;
  readonly subtitle: string;
  readonly status: string;
}
