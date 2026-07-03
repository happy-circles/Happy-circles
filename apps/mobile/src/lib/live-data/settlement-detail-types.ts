import type { SettlementVersionTimelineItemDto } from './settlement-version-types';

export interface SettlementMovement {
  readonly debtor_user_id: string;
  readonly creditor_user_id: string;
  readonly amount_minor: number;
}

export type SettlementDetailDecision = 'approved' | 'pending' | 'rejected';
export type SettlementParticipantDecisionSource = 'manual' | 'carried';

export interface SettlementDetailParticipantDto {
  readonly userId: string;
  readonly label: string;
  readonly decision: SettlementDetailDecision;
  readonly decisionSource?: SettlementParticipantDecisionSource;
}

export interface SettlementDetailMovementDto {
  readonly id: string;
  readonly debtorUserId: string;
  readonly debtorLabel: string;
  readonly creditorUserId: string;
  readonly creditorLabel: string;
  readonly amountMinor: number;
}

export interface SettlementDetailTreasureAwardDto {
  readonly id: string;
  readonly awardedAt: string;
  readonly claimedAt: string | null;
  readonly scoreDelta: number;
}

export interface SettlementDetailDto {
  readonly id: string;
  readonly happyCircleCaseId: string | null;
  readonly versionNumber: number | null;
  readonly isCurrentVersion: boolean;
  readonly replacesProposalId: string | null;
  readonly replacedByProposalId: string | null;
  readonly staleReason: string | null;
  readonly status: string;
  readonly snapshotHash: string;
  readonly participants: readonly string[];
  readonly participantDecisions: readonly SettlementDetailParticipantDto[];
  readonly participantStatuses: readonly string[];
  readonly participantCount: number;
  readonly approvedCount: number;
  readonly approvalsPending: number;
  readonly totalAmountMinor: number;
  readonly personalAmountMinor: number;
  readonly movementCount: number;
  readonly personalMovementCount: number;
  readonly originalMovementCount: number;
  readonly personalOriginalMovementCount: number;
  readonly savedMovementsCount: number;
  readonly personalSavedMovementsCount: number;
  readonly movementDetails: readonly SettlementDetailMovementDto[];
  readonly originalMovementDetails: readonly SettlementDetailMovementDto[];
  readonly movements: readonly string[];
  readonly impactLines: readonly string[];
  readonly explainers: readonly string[];
  readonly treasureAward: SettlementDetailTreasureAwardDto | null;
  readonly timeline: readonly SettlementVersionTimelineItemDto[];
}
