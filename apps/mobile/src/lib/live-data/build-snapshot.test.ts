import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

vi.mock('expo-secure-store', () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256',
  },
  digest: vi.fn(async () => new ArrayBuffer(32)),
  getRandomValues: vi.fn((array: Uint8Array) => array),
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
}));

vi.mock('react-native-url-polyfill/auto', () => ({}));

import { buildLiveSnapshot } from './build-snapshot';
import { notificationViewKeyForItem } from './builders/notifications';
import type {
  AccountInviteDeliveryRow,
  AccountInviteRow,
  AuditEventRow,
  FinancialRequestRow,
  FriendshipInviteDeliveryRow,
  FriendshipInviteRow,
  HappyCircleScoreEventRow,
  NotificationViewRow,
  OpenDebtRow,
  RelationshipRow,
  SettlementParticipantRow,
  SettlementProposalRow,
  UserProfileRow,
} from './types';

const ACTOR_ID = 'user-actor';
const FRIEND_ID = 'user-friend';
const OTHER_ID = 'user-other';
const NOW = '2026-05-05T12:00:00.000Z';

type SnapshotInput = Parameters<typeof buildLiveSnapshot>[0];

function row<T>(value: Partial<T>): T {
  return value as T;
}

function profile(id: string, displayName: string): UserProfileRow {
  return row<UserProfileRow>({
    id,
    email: `${id}@example.com`,
    display_name: displayName,
    avatar_path: null,
    account_access_state: 'active',
    invited_by_user_id: null,
    activated_via_account_invite_id: null,
    activated_at: null,
    phone_country_iso2: null,
    phone_country_calling_code: null,
    phone_national_number: null,
    phone_e164: null,
    phone_verified_at: null,
    created_at: NOW,
    updated_at: NOW,
  });
}

function relationship(id = 'rel-1'): RelationshipRow {
  return row<RelationshipRow>({
    id,
    user_low_id: ACTOR_ID,
    user_high_id: FRIEND_ID,
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
  });
}

function openDebt(value: Partial<OpenDebtRow>): OpenDebtRow {
  return row<OpenDebtRow>({
    relationship_id: 'rel-1',
    user_low_id: ACTOR_ID,
    user_high_id: FRIEND_ID,
    debtor_user_id: FRIEND_ID,
    creditor_user_id: ACTOR_ID,
    amount_minor: 5000,
    currency_code: 'COP',
    ...value,
  });
}

function financialRequest(value: Partial<FinancialRequestRow>): FinancialRequestRow {
  return row<FinancialRequestRow>({
    id: 'request-1',
    relationship_id: 'rel-1',
    request_type: 'balance_increase',
    status: 'pending',
    creator_user_id: FRIEND_ID,
    responder_user_id: ACTOR_ID,
    debtor_user_id: ACTOR_ID,
    creditor_user_id: FRIEND_ID,
    amount_minor: 1200,
    currency_code: 'COP',
    description: 'Lunch',
    category: 'food_drinks',
    parent_request_id: null,
    target_ledger_transaction_id: null,
    created_at: NOW,
    updated_at: NOW,
    resolved_at: null,
    ...value,
  });
}

function friendshipInvite(value: Partial<FriendshipInviteRow>): FriendshipInviteRow {
  return row<FriendshipInviteRow>({
    id: 'friendship-invite-1',
    inviter_user_id: FRIEND_ID,
    target_user_id: ACTOR_ID,
    claimant_user_id: null,
    relationship_id: null,
    flow: 'internal',
    origin_channel: 'internal',
    status: 'pending_recipient',
    resolution_actor: null,
    resolution_reason: null,
    intended_recipient_alias: null,
    intended_recipient_phone_e164: null,
    intended_recipient_phone_label: null,
    claimant_snapshot: null,
    source_context: null,
    expires_at: '2026-05-12T12:00:00.000Z',
    resolved_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...value,
  });
}

function friendshipDelivery(
  value: Partial<FriendshipInviteDeliveryRow>,
): FriendshipInviteDeliveryRow {
  return row<FriendshipInviteDeliveryRow>({
    id: 'friendship-delivery-1',
    invite_id: 'friendship-invite-1',
    channel: 'internal',
    source_context: null,
    status: 'issued',
    created_at: NOW,
    updated_at: NOW,
    expires_at: '2026-05-12T12:00:00.000Z',
    claimed_at: null,
    claimed_by_user_id: null,
    revoked_at: null,
    ...value,
  });
}

function accountInvite(value: Partial<AccountInviteRow>): AccountInviteRow {
  return row<AccountInviteRow>({
    id: 'account-invite-1',
    inviter_user_id: ACTOR_ID,
    activated_user_id: null,
    linked_relationship_id: null,
    status: 'pending_activation',
    resolution_actor: null,
    resolution_reason: null,
    intended_recipient_alias: 'Sam',
    intended_recipient_phone_e164: '+573001112233',
    intended_recipient_phone_label: '+57 300 111 2233',
    source_context: null,
    expires_at: '2026-05-12T12:00:00.000Z',
    activated_at: null,
    resolved_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...value,
  });
}

function accountDelivery(value: Partial<AccountInviteDeliveryRow>): AccountInviteDeliveryRow {
  return row<AccountInviteDeliveryRow>({
    id: 'account-delivery-1',
    invite_id: 'account-invite-1',
    channel: 'remote',
    source_context: null,
    status: 'issued',
    expires_at: '2026-05-12T12:00:00.000Z',
    revoked_at: null,
    first_opened_at: null,
    last_opened_at: null,
    open_count: 0,
    first_app_opened_at: null,
    authenticated_user_id: null,
    authenticated_at: null,
    activation_completed_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...value,
  });
}

function settlementProposal(value: Partial<SettlementProposalRow>): SettlementProposalRow {
  return row<SettlementProposalRow>({
    id: 'settlement-1',
    created_by_user_id: ACTOR_ID,
    status: 'approved',
    graph_snapshot_hash: 'hash-1',
    graph_snapshot: {},
    movements_json: [
      {
        debtor_user_id: FRIEND_ID,
        creditor_user_id: ACTOR_ID,
        amount_minor: 2500,
      },
    ],
    anchor_user_low_id: ACTOR_ID,
    anchor_user_high_id: FRIEND_ID,
    currency_code: 'COP',
    source_graph_cycle_job_id: null,
    happy_circle_case_id: null,
    version_number: null,
    replaces_proposal_id: null,
    replaced_by_proposal_id: null,
    stale_reason: null,
    created_at: NOW,
    updated_at: NOW,
    executed_at: null,
    ...value,
  });
}

function settlementParticipant(value: Partial<SettlementParticipantRow>): SettlementParticipantRow {
  return row<SettlementParticipantRow>({
    id: `participant-${String(value.participant_user_id ?? ACTOR_ID)}`,
    settlement_proposal_id: 'settlement-1',
    participant_user_id: ACTOR_ID,
    decision: 'approved',
    decided_at: NOW,
    created_at: NOW,
    ...value,
  });
}

function happyCircleScoreEvent(value: Partial<HappyCircleScoreEventRow>): HappyCircleScoreEventRow {
  return row<HappyCircleScoreEventRow>({
    id: 'score-event-1',
    user_id: ACTOR_ID,
    settlement_proposal_id: 'settlement-1',
    score_delta: 4,
    participant_count: 4,
    awarded_at: NOW,
    created_at: NOW,
    ...value,
  });
}

function notificationView(notificationKey: string): NotificationViewRow {
  return row<NotificationViewRow>({
    user_id: ACTOR_ID,
    notification_key: notificationKey,
    notification_kind: 'financial_request',
    source_item_id: 'request-1',
    notification_status: 'requires_you',
    viewed_at: NOW,
    created_at: NOW,
    updated_at: NOW,
  });
}

function baseInput(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    currentUserId: ACTOR_ID,
    profiles: [profile(ACTOR_ID, 'Ana')],
    friendshipInvites: [],
    friendshipInviteDeliveries: [],
    accountInvites: [],
    accountInviteDeliveries: [],
    relationships: [],
    openDebts: [],
    financialRequests: [],
    history: [],
    inboxItems: [],
    settlementProposals: [],
    settlementParticipants: [],
    happyCircleScoreEvents: [],
    notificationViews: [],
    auditEvents: [],
    fetchedAt: NOW,
    ...overrides,
  };
}

describe('buildLiveSnapshot', () => {
  it('builds a stable empty snapshot for a user without relationships', () => {
    const snapshot = buildLiveSnapshot(baseInput());

    expect(snapshot.currentUserProfile).toMatchObject({
      displayName: 'Ana',
      email: 'user-actor@example.com',
    });
    expect(snapshot.people).toEqual([]);
    expect(snapshot.pendingCount).toBe(0);
    expect(snapshot.notificationUnreadCount).toBe(0);
    expect(snapshot.dashboard.summary).toEqual({
      netBalanceMinor: 0,
      totalIOweMinor: 0,
      totalOwedToMeMinor: 0,
    });
    expect(snapshot.happyCircleScore).toEqual({
      totalFaces: 0,
      closedCircleCount: 0,
      recentAwards: [],
      latestAward: null,
    });
  });

  it('keeps older snapshot payloads without score events compatible', () => {
    const olderPayload = { ...baseInput() };
    delete olderPayload.happyCircleScoreEvents;
    const snapshot = buildLiveSnapshot(olderPayload);

    expect(snapshot.happyCircleScore).toEqual({
      totalFaces: 0,
      closedCircleCount: 0,
      recentAwards: [],
      latestAward: null,
    });
  });

  it('summarizes active relationships with positive, negative and settled balances', () => {
    const relationshipA = relationship('rel-positive');
    const relationshipB = row<RelationshipRow>({
      ...relationship('rel-negative'),
      user_high_id: OTHER_ID,
    });
    const relationshipC = row<RelationshipRow>({
      ...relationship('rel-settled'),
      user_high_id: 'user-settled',
    });

    const snapshot = buildLiveSnapshot(
      baseInput({
        profiles: [
          profile(ACTOR_ID, 'Ana'),
          profile(FRIEND_ID, 'Ben'),
          profile(OTHER_ID, 'Carla'),
          profile('user-settled', 'Diego'),
        ],
        relationships: [relationshipA, relationshipB, relationshipC],
        openDebts: [
          openDebt({ relationship_id: 'rel-positive', debtor_user_id: FRIEND_ID }),
          openDebt({
            relationship_id: 'rel-negative',
            user_high_id: OTHER_ID,
            debtor_user_id: ACTOR_ID,
            creditor_user_id: OTHER_ID,
            amount_minor: 2000,
          }),
        ],
      }),
    );

    expect(snapshot.dashboard.summary).toMatchObject({
      netBalanceMinor: 3000,
      totalIOweMinor: 2000,
      totalOwedToMeMinor: 5000,
    });
    expect(snapshot.people.map((person) => [person.displayName, person.direction])).toEqual([
      ['Ben', 'owes_me'],
      ['Carla', 'i_owe'],
      ['Diego', 'settled'],
    ]);
    expect(snapshot.balanceAnalytics.periods.all.people).toHaveLength(2);
  });

  it('marks pending financial requests as requiring the actor and respects notification views', () => {
    const pending = financialRequest({});
    const unreadSnapshot = buildLiveSnapshot(
      baseInput({
        profiles: [profile(ACTOR_ID, 'Ana'), profile(FRIEND_ID, 'Ben')],
        relationships: [relationship()],
        financialRequests: [pending],
      }),
    );

    const pendingItem = unreadSnapshot.activitySections[0]?.items[0];
    expect(pendingItem).toMatchObject({
      id: 'request-1',
      kind: 'financial_request',
      status: 'requires_you',
    });
    expect(unreadSnapshot.pendingCount).toBe(1);
    expect(unreadSnapshot.notificationUnreadCount).toBe(1);

    const viewedSnapshot = buildLiveSnapshot(
      baseInput({
        profiles: [profile(ACTOR_ID, 'Ana'), profile(FRIEND_ID, 'Ben')],
        relationships: [relationship()],
        financialRequests: [pending],
        notificationViews: [notificationView(notificationViewKeyForItem(pendingItem))],
      }),
    );

    expect(viewedSnapshot.notificationUnreadCount).toBe(0);
    expect(viewedSnapshot.notificationViewedKeys.has(notificationViewKeyForItem(pendingItem))).toBe(
      true,
    );
  });

  it('separates friendship invites into pending and history states', () => {
    const snapshot = buildLiveSnapshot(
      baseInput({
        profiles: [profile(ACTOR_ID, 'Ana'), profile(FRIEND_ID, 'Ben')],
        friendshipInvites: [
          friendshipInvite({ id: 'friendship-pending' }),
          friendshipInvite({
            id: 'friendship-history',
            status: 'accepted',
            resolved_at: NOW,
          }),
        ],
        friendshipInviteDeliveries: [
          friendshipDelivery({ invite_id: 'friendship-pending' }),
          friendshipDelivery({ invite_id: 'friendship-history', status: 'claimed' }),
        ],
      }),
    );

    expect(snapshot.friendshipPendingItems).toHaveLength(1);
    expect(snapshot.friendshipPendingItems[0]).toMatchObject({
      actionState: 'requires_you_response',
      actorRole: 'recipient',
    });
    expect(snapshot.friendshipHistoryItems).toHaveLength(1);
    expect(snapshot.friendshipSummary.historyCount).toBe(1);
  });

  it('separates account invite activation, review and history states', () => {
    const snapshot = buildLiveSnapshot(
      baseInput({
        profiles: [profile(ACTOR_ID, 'Ana'), profile(FRIEND_ID, 'Ben')],
        accountInvites: [
          accountInvite({ id: 'account-pending' }),
          accountInvite({
            id: 'account-review',
            status: 'pending_inviter_review',
            activated_user_id: FRIEND_ID,
            activated_at: NOW,
          }),
          accountInvite({
            id: 'account-history',
            status: 'accepted',
            activated_user_id: FRIEND_ID,
            activated_at: NOW,
            resolved_at: NOW,
          }),
        ],
        accountInviteDeliveries: [
          accountDelivery({ invite_id: 'account-pending' }),
          accountDelivery({
            invite_id: 'account-review',
            status: 'authenticated',
            authenticated_user_id: FRIEND_ID,
          }),
          accountDelivery({
            invite_id: 'account-history',
            status: 'activated',
            authenticated_user_id: FRIEND_ID,
            activation_completed_at: NOW,
          }),
        ],
      }),
    );

    expect(snapshot.accountInvitePendingItems.map((item) => item.actionState)).toEqual([
      'pending_activation',
      'requires_you_review',
    ]);
    expect(snapshot.accountInviteHistoryItems).toHaveLength(1);
    expect(snapshot.accountInviteSummary).toMatchObject({
      pendingActivationCount: 1,
      requiresReviewCount: 1,
      historyCount: 1,
    });
  });

  it('keeps active settlement proposals available for balance analytics and details', () => {
    const snapshot = buildLiveSnapshot(
      baseInput({
        profiles: [profile(ACTOR_ID, 'Ana'), profile(FRIEND_ID, 'Ben')],
        relationships: [relationship()],
        settlementProposals: [
          settlementProposal({}),
          settlementProposal({
            id: 'settlement-2',
            status: 'pending_approvals',
            updated_at: '2026-05-05T12:01:00.000Z',
          }),
        ],
        settlementParticipants: [
          settlementParticipant({ participant_user_id: ACTOR_ID }),
          settlementParticipant({ participant_user_id: FRIEND_ID }),
          settlementParticipant({
            id: 'participant-2-actor',
            settlement_proposal_id: 'settlement-2',
            participant_user_id: ACTOR_ID,
            decision: 'pending',
            decided_at: null,
          }),
          settlementParticipant({
            id: 'participant-2-friend',
            settlement_proposal_id: 'settlement-2',
            participant_user_id: FRIEND_ID,
          }),
        ],
      }),
    );

    expect(snapshot.balanceOverview.resolution.activeProposal).toMatchObject({
      proposalId: 'settlement-1',
      status: 'approved',
      personalAmountMinor: 2500,
      totalAmountMinor: 2500,
    });
    expect(
      snapshot.balanceOverview.resolution.activeProposals.map((proposal) => proposal.proposalId),
    ).toEqual(['settlement-1', 'settlement-2']);
    expect(snapshot.settlementsById['settlement-1']).toMatchObject({
      status: 'approved',
      participants: ['Tu', 'Ben'],
    });
    expect(snapshot.activitySections[0]?.items[0]).toMatchObject({
      kind: 'settlement_proposal',
      status: 'approved',
      ctaLabel: 'Completar',
    });
  });

  it('groups happy circle versions into one current active proposal and a detail timeline', () => {
    const snapshot = buildLiveSnapshot(
      baseInput({
        profiles: [profile(ACTOR_ID, 'Ana'), profile(FRIEND_ID, 'Ben')],
        relationships: [relationship()],
        settlementProposals: [
          settlementProposal({
            id: 'settlement-v1',
            status: 'stale',
            happy_circle_case_id: 'case-1',
            version_number: 1,
            replaced_by_proposal_id: 'settlement-v2',
            stale_reason: 'balance_changed',
            updated_at: '2026-05-05T12:01:00.000Z',
          }),
          settlementProposal({
            id: 'settlement-v2',
            status: 'pending_approvals',
            happy_circle_case_id: 'case-1',
            version_number: 2,
            replaces_proposal_id: 'settlement-v1',
            graph_snapshot_hash: 'hash-2',
            updated_at: '2026-05-05T12:02:00.000Z',
          }),
        ],
        settlementParticipants: [
          settlementParticipant({
            id: 'participant-v1-actor',
            settlement_proposal_id: 'settlement-v1',
            participant_user_id: ACTOR_ID,
          }),
          settlementParticipant({
            id: 'participant-v1-friend',
            settlement_proposal_id: 'settlement-v1',
            participant_user_id: FRIEND_ID,
          }),
          settlementParticipant({
            id: 'participant-v2-actor',
            settlement_proposal_id: 'settlement-v2',
            participant_user_id: ACTOR_ID,
            decision: 'pending',
            decided_at: null,
          }),
          settlementParticipant({
            id: 'participant-v2-friend',
            settlement_proposal_id: 'settlement-v2',
            participant_user_id: FRIEND_ID,
            decision: 'pending',
            decided_at: null,
          }),
        ],
      }),
    );

    expect(
      snapshot.balanceOverview.resolution.activeProposals.map((proposal) => proposal.proposalId),
    ).toEqual(['settlement-v2']);
    expect(snapshot.settlementsById['settlement-v2']?.timeline).toMatchObject([
      {
        proposalId: 'settlement-v1',
        versionNumber: 1,
        status: 'stale',
        replacedByProposalId: 'settlement-v2',
        detail: 'Fue reemplazada porque los saldos cambiaron.',
      },
      {
        proposalId: 'settlement-v2',
        versionNumber: 2,
        status: 'pending_approvals',
        replacesProposalId: 'settlement-v1',
        isCurrent: true,
      },
    ]);
  });

  it('summarizes private happy circle score events for the current user', () => {
    const snapshot = buildLiveSnapshot(
      baseInput({
        happyCircleScoreEvents: [
          happyCircleScoreEvent({
            id: 'score-event-old',
            settlement_proposal_id: 'settlement-old',
            score_delta: 3,
            participant_count: 3,
            awarded_at: '2026-05-04T12:00:00.000Z',
          }),
          happyCircleScoreEvent({
            id: 'score-event-new',
            settlement_proposal_id: 'settlement-new',
            score_delta: 4,
            participant_count: 4,
            awarded_at: '2026-05-05T12:00:00.000Z',
          }),
          happyCircleScoreEvent({
            id: 'score-event-other',
            user_id: FRIEND_ID,
            settlement_proposal_id: 'settlement-other',
            score_delta: 9,
            participant_count: 9,
          }),
        ],
      }),
    );

    expect(snapshot.happyCircleScore.totalFaces).toBe(7);
    expect(snapshot.happyCircleScore.closedCircleCount).toBe(2);
    expect(snapshot.happyCircleScore.latestAward).toMatchObject({
      id: 'score-event-new',
      settlementProposalId: 'settlement-new',
      scoreDelta: 4,
      participantCount: 4,
    });
    expect(snapshot.happyCircleScore.recentAwards.map((award) => award.id)).toEqual([
      'score-event-new',
      'score-event-old',
    ]);
  });

  it('keeps audit events bounded at the builder surface', () => {
    const snapshot = buildLiveSnapshot(
      baseInput({
        auditEvents: [
          row<AuditEventRow>({
            id: 'audit-1',
            actor_user_id: ACTOR_ID,
            entity_type: 'financial_request',
            entity_id: 'request-1',
            event_name: 'financial_request_created',
            request_id: null,
            metadata_json: {},
            created_at: NOW,
          }),
        ],
      }),
    );

    expect(snapshot.auditEvents).toHaveLength(1);
    expect(snapshot.auditEvents[0]?.id).toBe('audit-1');
    expect(snapshot.auditEvents[0]?.title).toBe('financial request created');
    expect(snapshot.auditEvents[0]?.subtitle).toContain('financial_request |');
  });
});
