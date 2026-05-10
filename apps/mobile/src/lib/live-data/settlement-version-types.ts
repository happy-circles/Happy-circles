export interface SettlementVersionTimelineItemDto {
  readonly proposalId: string;
  readonly versionNumber: number | null;
  readonly status: string;
  readonly title: string;
  readonly detail: string;
  readonly amountMinor: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isCurrent: boolean;
  readonly replacesProposalId: string | null;
  readonly replacedByProposalId: string | null;
  readonly staleReason: string | null;
}
