export interface SettlementVersionTimelineItemDto {
  readonly proposalId: string;
  readonly versionNumber: number | null;
  readonly displayVersionNumber: number | null;
  readonly status: string;
  readonly title: string;
  readonly detail: string;
  readonly amountMinor: number;
  readonly previousAmountMinor?: number;
  readonly amountChanged?: boolean;
  readonly addedParticipantCount?: number;
  readonly removedParticipantCount?: number;
  readonly carriedApprovalCount?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isCurrent: boolean;
  readonly replacesProposalId: string | null;
  readonly replacedByProposalId: string | null;
  readonly staleReason: string | null;
}
