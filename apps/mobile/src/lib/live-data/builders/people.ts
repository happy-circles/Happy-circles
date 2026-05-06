import type { PersonCardDto, PersonDetailDto } from '@happy-circles/application';
import { compareHistoryItems } from '../../history-cases';
import { resolveAvatarUrl } from '../../avatar-url';
import { LIVE_DATA_CTA, LIVE_DATA_ROUTES } from '../presentation';
import type {
  AccountInviteListItem,
  ActionableItem,
  FinancialRequestRow,
  FriendshipInviteListItem,
  LivePersonDetailDto,
  OpenDebtRow,
  RelationshipHistoryRow,
  RelationshipRow,
  SettlementParticipantRow,
  SettlementProposalRow,
  UserProfileRow,
} from '../types';
import {
  buildPersonPendingRequest,
  buildPersonTimeline,
  buildPendingRequestHistorySteps,
  formatPendingRequestSubtitle,
  formatPendingRequestTitle,
} from './financial-requests';
import { buildSettlementProposalHistoryTimelineItems } from './settlements';
import { upsertInviteProfilePeople } from './invite-profiles';
import { deriveDirection, requestDirectionForUser } from '../utils/money-and-direction';
import { sortByNewest, sortPeople, actionableItemToActivityItem } from '../utils/sorting';
import { formatRelativeLabel } from '../utils/dates';
import { normalizeTransactionCategory } from '../../transaction-categories';

export function buildPeopleState(input: {
  readonly currentUserId: string;
  readonly relationshipsByCounterpartyId: ReadonlyMap<string, RelationshipRow>;
  readonly requestsByRelationshipId: ReadonlyMap<string, FinancialRequestRow[]>;
  readonly financialRequestsById: ReadonlyMap<string, FinancialRequestRow>;
  readonly openDebtsByRelationshipId: ReadonlyMap<string, OpenDebtRow>;
  readonly historyByRelationshipId: ReadonlyMap<string, RelationshipHistoryRow[]>;
  readonly pendingSettlements: readonly ActionableItem[];
  readonly settlementProposals: readonly SettlementProposalRow[];
  readonly settlementParticipantsByProposalId: Map<string, SettlementParticipantRow[]>;
  readonly visibleCounterpartyUserIds: ReadonlySet<string>;
  readonly names: Map<string, string>;
  readonly profiles: Map<string, UserProfileRow>;
  readonly friendshipPendingItems: readonly FriendshipInviteListItem[];
  readonly friendshipHistoryItems: readonly FriendshipInviteListItem[];
  readonly accountInvitePendingItems: readonly AccountInviteListItem[];
  readonly accountInviteHistoryItems: readonly AccountInviteListItem[];
  readonly nowMs: number;
}): {
  readonly people: readonly PersonCardDto[];
  readonly peopleById: Record<string, LivePersonDetailDto>;
  readonly relationshipPeopleById: Record<string, PersonDetailDto>;
} {
  const people = Array.from(input.relationshipsByCounterpartyId.entries())
    .map(([counterpartyUserId, relationship]): PersonCardDto => {
      const requests = input.requestsByRelationshipId.get(relationship.id) ?? [];
      const relatedSettlements = input.pendingSettlements.filter((item) =>
        item.participantUserIds?.includes(counterpartyUserId),
      );
      const latestRequest = requests[0];
      const edge = input.openDebtsByRelationshipId.get(relationship.id);
      const direction = deriveDirection(input.currentUserId, edge);
      const timeline = input.historyByRelationshipId.get(relationship.id) ?? [];
      const latestHistory = timeline[0];
      const pendingCount =
        requests.filter((row) => row.status === 'pending').length + relatedSettlements.length;
      const lastActivityLabel =
        latestRequest && (!latestHistory || latestRequest.created_at >= latestHistory.happened_at)
          ? `Propuesta pendiente ${formatRelativeLabel(latestRequest.created_at, input.nowMs)}`
          : latestHistory
            ? `Ultimo movimiento ${formatRelativeLabel(latestHistory.happened_at, input.nowMs)}`
            : 'Sin movimientos todavia';

      return {
        userId: counterpartyUserId,
        displayName: input.names.get(counterpartyUserId) ?? 'Persona',
        avatarUrl: resolveAvatarUrl(
          input.profiles.get(counterpartyUserId)?.avatar_path,
          input.profiles.get(counterpartyUserId)?.updated_at ?? null,
        ),
        netAmountMinor: edge?.amount_minor ?? 0,
        direction,
        pendingCount,
        lastActivityLabel,
      };
    })
    .sort(sortPeople);

  const peopleById: Record<string, LivePersonDetailDto> = Object.fromEntries(
    people.map((person): [string, LivePersonDetailDto] => {
      const relationship = input.relationshipsByCounterpartyId.get(person.userId);
      const requests = relationship
        ? (input.requestsByRelationshipId.get(relationship.id) ?? [])
        : [];
      const personRequestsById = new Map(requests.map((request) => [request.id, request]));
      const latestPendingRequest = requests.find((request) => request.status === 'pending');
      const personPendingRequests = requests
        .filter((request) => request.status === 'pending')
        .map(
          (request): ActionableItem => ({
            id: request.id,
            kind: 'financial_request',
            title: formatPendingRequestTitle(request, input.currentUserId),
            subtitle: formatPendingRequestSubtitle(
              request,
              input.names,
              input.currentUserId,
              person.displayName,
              input.nowMs,
            ),
            status:
              request.responder_user_id === input.currentUserId
                ? 'requires_you'
                : 'waiting_other_side',
            ctaLabel: LIVE_DATA_CTA.respond,
            href: LIVE_DATA_ROUTES.person(person.userId),
            amountMinor: request.amount_minor,
            category: normalizeTransactionCategory(request.category),
            counterpartyLabel: person.displayName,
            tone:
              requestDirectionForUser(request, input.currentUserId) === 'owes_me'
                ? 'positive'
                : 'negative',
            pendingHistorySteps: buildPendingRequestHistorySteps({
              request,
              requestsById: personRequestsById,
              currentUserId: input.currentUserId,
              counterpartyName: person.displayName,
              names: input.names,
              nowMs: input.nowMs,
            }),
            createdAt: request.created_at,
          }),
        );
      const personPendingSettlements = input.pendingSettlements.filter((item) =>
        item.participantUserIds?.includes(person.userId),
      );
      const pendingItems = sortByNewest([
        ...personPendingRequests,
        ...personPendingSettlements,
      ]).map(actionableItemToActivityItem);
      const historyRows = relationship
        ? (input.historyByRelationshipId.get(relationship.id) ?? [])
        : [];
      const timeline = [
        ...buildPersonTimeline({
          requests,
          historyRows,
          currentUserId: input.currentUserId,
          counterpartyName: person.displayName,
          names: input.names,
          nowMs: input.nowMs,
        }),
        ...buildSettlementProposalHistoryTimelineItems({
          proposals: input.settlementProposals,
          participantsByProposalId: input.settlementParticipantsByProposalId,
          currentUserId: input.currentUserId,
          counterpartyUserId: person.userId,
          names: input.names,
          nowMs: input.nowMs,
        }),
      ].sort(compareHistoryItems);

      const pendingLabel = `${person.pendingCount} pendiente${person.pendingCount > 1 ? 's' : ''}`;
      const headline =
        person.netAmountMinor === 0
          ? person.pendingCount > 0
            ? `${pendingLabel} por resolver con ${person.displayName}`
            : `Con ${person.displayName} estan al dia`
          : person.direction === 'owes_me'
            ? `${person.displayName} te debe`
            : `Le debes a ${person.displayName}`;

      const supportText =
        person.pendingCount > 0
          ? `Tienes ${pendingLabel} con ${person.displayName}.`
          : person.lastActivityLabel;

      const pendingRequest = latestPendingRequest
        ? buildPersonPendingRequest({
            request: latestPendingRequest,
            currentUserId: input.currentUserId,
            counterpartyName: person.displayName,
            names: input.names,
            nowMs: input.nowMs,
          })
        : undefined;

      return [
        person.userId,
        {
          userId: person.userId,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl ?? null,
          direction: person.direction,
          netAmountMinor: person.netAmountMinor,
          pendingCount: person.pendingCount,
          headline,
          supportText,
          pendingItems,
          pendingRequest,
          timeline,
          relationshipStatus: 'active',
        },
      ];
    }),
  );
  const relationshipPeopleById: Record<string, PersonDetailDto> = { ...peopleById };

  upsertInviteProfilePeople({
    peopleById,
    pendingItems: [...input.friendshipPendingItems, ...input.accountInvitePendingItems],
    historyItems: [...input.friendshipHistoryItems, ...input.accountInviteHistoryItems],
    names: input.names,
    profiles: input.profiles,
  });

  return {
    people,
    peopleById,
    relationshipPeopleById,
  };
}
