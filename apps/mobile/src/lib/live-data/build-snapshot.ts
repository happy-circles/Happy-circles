import type { BalanceOverviewDto, DashboardDto } from '@happy-circles/application';

import { resolveAvatarUrl } from '../avatar-url';
import { buildAccountInviteItems } from './builders/account-invites';
import { buildActivityState } from './builders/activity';
import { buildAuditItems } from './builders/audit-events';
import { buildBalanceAnalytics, buildBalanceProjection } from './builders/balance-analytics';
import { buildPendingFinancialRequestItems } from './builders/financial-requests';
import { buildFriendshipInviteItems } from './builders/friendship-invites';
import { buildPeopleState } from './builders/people';
import { isHistoryRowVisibleToCurrentUser } from './builders/relationship-history';
import {
  buildActiveSettlementPreview,
  buildPendingSettlementItems,
  buildSettlementDetail,
  buildSettlementMetrics,
} from './builders/settlements';
import { buildActivitySections, LIVE_DATA_ROUTES } from './presentation';
import type { AppSnapshot, LiveSnapshotRows } from './types';
import { buildLiveSnapshotContext, groupBy } from './utils/context';
import { periodRange } from './utils/dates';

type BuildLiveSnapshotInput = Omit<LiveSnapshotRows, 'avatarSignedUrlsByPath' | 'limits'> & {
  readonly avatarSignedUrlsByPath?: LiveSnapshotRows['avatarSignedUrlsByPath'];
  readonly currentUserId: string;
};

export function buildLiveSnapshot(input: BuildLiveSnapshotInput): AppSnapshot {
  const fetchedAtMs = Date.parse(input.fetchedAt);
  const snapshotNowMs = Number.isNaN(fetchedAtMs) ? 0 : fetchedAtMs;
  const snapshotNow = new Date(snapshotNowMs);
  const context = buildLiveSnapshotContext(input);
  const notificationViewedKeys = new Set(
    input.notificationViews.map((view) => view.notification_key),
  );
  const history = input.history.filter((row) =>
    isHistoryRowVisibleToCurrentUser(row, input.currentUserId, context.visibleRelationshipIds),
  );
  const openDebtsByRelationshipId = new Map(
    input.openDebts.map((row) => [row.relationship_id, row]),
  );
  const requestsByRelationshipId = groupBy(input.financialRequests, (row) => row.relationship_id);
  const financialRequestsById = new Map(
    input.financialRequests.map((request) => [request.id, request]),
  );
  const historyByRelationshipId = groupBy(history, (row) => row.relationship_id);
  const settlementParticipantsByProposalId = groupBy(
    input.settlementParticipants,
    (row) => row.settlement_proposal_id,
  );

  const friendshipState = buildFriendshipInviteItems({
    invites: input.friendshipInvites,
    deliveries: input.friendshipInviteDeliveries,
    names: context.nameByUserId,
    profiles: context.profileByUserId,
    currentUserId: input.currentUserId,
    nowMs: snapshotNowMs,
  });
  const accountInviteState = buildAccountInviteItems({
    invites: input.accountInvites,
    deliveries: input.accountInviteDeliveries,
    names: context.nameByUserId,
    profiles: context.profileByUserId,
    currentUserId: input.currentUserId,
    nowMs: snapshotNowMs,
  });
  const pendingSettlements = buildPendingSettlementItems(
    input.settlementProposals,
    settlementParticipantsByProposalId,
    context.nameByUserId,
    input.currentUserId,
    context.visibleCounterpartyUserIds,
    input.inboxItems,
    snapshotNowMs,
  );
  const peopleState = buildPeopleState({
    currentUserId: input.currentUserId,
    relationshipsByCounterpartyId: context.relationshipsByCounterpartyId,
    requestsByRelationshipId,
    financialRequestsById,
    openDebtsByRelationshipId,
    historyByRelationshipId,
    pendingSettlements,
    settlementProposals: input.settlementProposals,
    settlementParticipantsByProposalId,
    visibleCounterpartyUserIds: context.visibleCounterpartyUserIds,
    names: context.nameByUserId,
    profiles: context.profileByUserId,
    friendshipPendingItems: friendshipState.pendingItems,
    friendshipHistoryItems: friendshipState.historyItems,
    accountInvitePendingItems: accountInviteState.pendingItems,
    accountInviteHistoryItems: accountInviteState.historyItems,
    nowMs: snapshotNowMs,
  });
  const pendingRequests = buildPendingFinancialRequestItems({
    financialRequests: input.financialRequests,
    financialRequestsById,
    counterpartyByRelationshipId: context.counterpartyByRelationshipId,
    currentUserId: input.currentUserId,
    names: context.nameByUserId,
    nowMs: snapshotNowMs,
  });
  const activityState = buildActivityState({
    pendingRequests,
    pendingSettlements,
    friendshipPendingItems: friendshipState.pendingItems,
    friendshipHistoryItems: friendshipState.historyItems,
    accountInvitePendingItems: accountInviteState.pendingItems,
    accountInviteHistoryItems: accountInviteState.historyItems,
    relationshipPeopleById: peopleState.relationshipPeopleById,
    notificationViewedKeys,
  });
  const summary: DashboardDto['summary'] = input.openDebts.reduce(
    (accumulator, debt) => {
      if (debt.debtor_user_id === input.currentUserId) {
        return {
          netBalanceMinor: accumulator.netBalanceMinor - debt.amount_minor,
          totalIOweMinor: accumulator.totalIOweMinor + debt.amount_minor,
          totalOwedToMeMinor: accumulator.totalOwedToMeMinor,
        };
      }

      if (debt.creditor_user_id === input.currentUserId) {
        return {
          netBalanceMinor: accumulator.netBalanceMinor + debt.amount_minor,
          totalIOweMinor: accumulator.totalIOweMinor,
          totalOwedToMeMinor: accumulator.totalOwedToMeMinor + debt.amount_minor,
        };
      }

      return accumulator;
    },
    {
      netBalanceMinor: 0,
      totalIOweMinor: 0,
      totalOwedToMeMinor: 0,
    },
  );
  const settlementsById = Object.fromEntries(
    input.settlementProposals.map((proposal) => [
      proposal.id,
      buildSettlementDetail(
        proposal,
        settlementParticipantsByProposalId.get(proposal.id) ?? [],
        context.nameByUserId,
        input.currentUserId,
        context.visibleCounterpartyUserIds,
      ),
    ]),
  );
  const activeProposal = buildActiveSettlementPreview({
    proposals: input.settlementProposals,
    participantsByProposalId: settlementParticipantsByProposalId,
    currentUserId: input.currentUserId,
    visibleCounterpartyUserIds: context.visibleCounterpartyUserIds,
    names: context.nameByUserId,
  });
  const balanceOverview: BalanceOverviewDto = {
    updatedAt: input.fetchedAt,
    updatedAtLabel: 'Actualizado hace unos segundos',
    summary,
    projection: buildBalanceProjection({
      financialRequests: input.financialRequests,
      currentUserId: input.currentUserId,
      currentSummary: summary,
    }),
    resolution: buildSettlementMetrics({
      proposals: input.settlementProposals,
      participantsByProposalId: settlementParticipantsByProposalId,
      currentUserId: input.currentUserId,
      visibleCounterpartyUserIds: context.visibleCounterpartyUserIds,
      names: context.nameByUserId,
      activeProposal,
      range: periodRange('all', snapshotNow),
    }),
  };
  const balanceAnalytics = buildBalanceAnalytics({
    currentSummary: summary,
    people: peopleState.people,
    history,
    counterpartyByRelationshipId: context.counterpartyByRelationshipId,
    proposals: input.settlementProposals,
    participantsByProposalId: settlementParticipantsByProposalId,
    currentUserId: input.currentUserId,
    visibleCounterpartyUserIds: context.visibleCounterpartyUserIds,
    names: context.nameByUserId,
    activeProposal,
    now: snapshotNow,
  });
  const currentUserProfileRow = context.profileByUserId.get(input.currentUserId);

  return {
    dashboard: {
      summary,
      urgentCount: activityState.pendingItems.length,
      topPendingPreview: activityState.pendingItems[0]
        ? {
            id: activityState.pendingItems[0].id,
            kind: activityState.pendingItems[0].kind,
            title: activityState.pendingItems[0].title,
            subtitle: activityState.pendingItems[0].subtitle,
            status: activityState.pendingItems[0].status,
            ctaLabel: activityState.pendingItems[0].ctaLabel,
            href: activityState.pendingItems[0].href ?? LIVE_DATA_ROUTES.activity,
            amountMinor: activityState.pendingItems[0].amountMinor,
            category: activityState.pendingItems[0].category,
          }
        : null,
      activePeople: peopleState.people,
    },
    balanceOverview,
    balanceAnalytics,
    people: peopleState.people,
    peopleById: peopleState.peopleById,
    currentUserProfile: currentUserProfileRow
      ? {
          displayName: currentUserProfileRow.display_name,
          email: currentUserProfileRow.email,
          avatarUrl: resolveAvatarUrl(
            currentUserProfileRow.avatar_path,
            currentUserProfileRow.updated_at,
          ),
        }
      : null,
    friendshipPendingItems: friendshipState.pendingItems,
    friendshipHistoryItems: friendshipState.historyItems,
    friendshipSummary: friendshipState.summary,
    accountInvitePendingItems: accountInviteState.pendingItems,
    accountInviteHistoryItems: accountInviteState.historyItems,
    accountInviteSummary: accountInviteState.summary,
    activitySections: buildActivitySections({
      pendingItems: activityState.pendingItems,
      historyItems: activityState.historyItems,
    }),
    notificationUnreadCount: activityState.unviewedPendingItems.length,
    notificationViewedKeys,
    pendingCount: activityState.pendingItems.length,
    auditEvents: buildAuditItems(input.auditEvents, snapshotNowMs),
    settlementsById,
  };
}
