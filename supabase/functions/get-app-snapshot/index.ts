import { createServiceRoleClient, handleRpc } from '../_shared/http.ts';

const LIMITS = {
  financialRequestHistory: 250,
  relationshipHistory: 300,
  friendshipInviteHistory: 150,
  accountInviteHistory: 150,
  settlementHistory: 100,
  auditEvents: 20,
  notificationViews: 1000,
} as const;

const AVATAR_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
const ACTIVE_FRIENDSHIP_INVITE_STATUSES = [
  'pending_recipient',
  'pending_claim',
  'pending_sender_review',
];
const HISTORY_FRIENDSHIP_INVITE_STATUSES = ['accepted', 'rejected', 'canceled', 'expired'];
const ACTIVE_ACCOUNT_INVITE_STATUSES = ['pending_activation', 'pending_inviter_review'];
const HISTORY_ACCOUNT_INVITE_STATUSES = ['accepted', 'rejected', 'canceled', 'expired'];
const ACTIVE_SETTLEMENT_STATUSES = ['pending_approvals', 'approved'];
const HISTORY_SETTLEMENT_STATUSES = ['rejected', 'stale', 'executed', 'expired'];

const PROFILE_SELECT = [
  'id',
  'email',
  'display_name',
  'avatar_path',
  'account_access_state',
  'invited_by_user_id',
  'activated_via_account_invite_id',
  'activated_at',
  'phone_country_iso2',
  'phone_country_calling_code',
  'phone_national_number',
  'phone_e164',
  'phone_verified_at',
  'created_at',
  'updated_at',
].join(', ');

const RELATIONSHIP_SELECT = [
  'id',
  'user_low_id',
  'user_high_id',
  'status',
  'created_at',
  'updated_at',
].join(', ');

const OPEN_DEBT_SELECT = [
  'relationship_id',
  'user_low_id',
  'user_high_id',
  'debtor_user_id',
  'creditor_user_id',
  'amount_minor',
  'currency_code',
].join(', ');

const FINANCIAL_REQUEST_SELECT = [
  'id',
  'relationship_id',
  'request_type',
  'status',
  'creator_user_id',
  'responder_user_id',
  'debtor_user_id',
  'creditor_user_id',
  'amount_minor',
  'currency_code',
  'description',
  'category',
  'parent_request_id',
  'target_ledger_transaction_id',
  'created_at',
  'updated_at',
  'resolved_at',
].join(', ');

const RELATIONSHIP_HISTORY_SELECT = [
  'relationship_id',
  'item_id',
  'item_kind',
  'status',
  'subtype',
  'source_type',
  'creator_user_id',
  'responder_user_id',
  'debtor_user_id',
  'creditor_user_id',
  'amount_minor',
  'description',
  'category',
  'origin_request_id',
  'origin_settlement_proposal_id',
  'happened_at',
].join(', ');

const INBOX_ITEM_SELECT = [
  'owner_user_id',
  'item_id',
  'item_kind',
  'subtype',
  'status',
  'created_at',
].join(', ');

const FRIENDSHIP_INVITE_SELECT = [
  'id',
  'inviter_user_id',
  'target_user_id',
  'claimant_user_id',
  'relationship_id',
  'flow',
  'origin_channel',
  'status',
  'resolution_actor',
  'resolution_reason',
  'intended_recipient_alias',
  'intended_recipient_phone_e164',
  'intended_recipient_phone_label',
  'claimant_snapshot',
  'source_context',
  'expires_at',
  'resolved_at',
  'created_at',
  'updated_at',
].join(', ');

const FRIENDSHIP_INVITE_DELIVERY_SELECT = [
  'id',
  'invite_id',
  'channel',
  'source_context',
  'status',
  'created_at',
  'updated_at',
  'expires_at',
  'claimed_at',
  'claimed_by_user_id',
  'revoked_at',
].join(', ');

const ACCOUNT_INVITE_SELECT = [
  'id',
  'inviter_user_id',
  'activated_user_id',
  'linked_relationship_id',
  'status',
  'resolution_actor',
  'resolution_reason',
  'intended_recipient_alias',
  'intended_recipient_phone_e164',
  'intended_recipient_phone_label',
  'source_context',
  'expires_at',
  'activated_at',
  'resolved_at',
  'created_at',
  'updated_at',
].join(', ');

const ACCOUNT_INVITE_DELIVERY_SELECT = [
  'id',
  'invite_id',
  'channel',
  'source_context',
  'status',
  'expires_at',
  'revoked_at',
  'first_opened_at',
  'last_opened_at',
  'open_count',
  'first_app_opened_at',
  'authenticated_user_id',
  'authenticated_at',
  'activation_completed_at',
  'created_at',
  'updated_at',
].join(', ');

const SETTLEMENT_PROPOSAL_SELECT = [
  'id',
  'created_by_user_id',
  'status',
  'graph_snapshot_hash',
  'graph_snapshot',
  'movements_json',
  'result_hash',
  'anchor_user_low_id',
  'anchor_user_high_id',
  'currency_code',
  'source_graph_cycle_job_id',
  'happy_circle_case_id',
  'version_number',
  'replaces_proposal_id',
  'replaced_by_proposal_id',
  'stale_reason',
  'created_at',
  'updated_at',
  'executed_at',
].join(', ');

const SETTLEMENT_PROPOSAL_WITH_ACTOR_SELECT = [
  SETTLEMENT_PROPOSAL_SELECT,
  'settlement_proposal_participants!inner(participant_user_id)',
].join(', ');

const SETTLEMENT_PARTICIPANT_SELECT = [
  'id',
  'settlement_proposal_id',
  'participant_user_id',
  'decision',
  'decided_at',
  'created_at',
].join(', ');

const HAPPY_CIRCLE_SCORE_EVENT_SELECT = [
  'id',
  'user_id',
  'settlement_proposal_id',
  'score_delta',
  'participant_count',
  'awarded_at',
  'treasure_claimed_at',
  'created_at',
].join(', ');

const NOTIFICATION_VIEW_SELECT = [
  'user_id',
  'notification_key',
  'notification_kind',
  'source_item_id',
  'notification_status',
  'viewed_at',
  'created_at',
  'updated_at',
].join(', ');

const AUDIT_EVENT_SELECT = [
  'id',
  'actor_user_id',
  'entity_type',
  'entity_id',
  'event_name',
  'request_id',
  'metadata_json',
  'created_at',
].join(', ');

type QueryResult<T> = {
  readonly data: T[] | null;
  readonly error: { readonly message: string } | null;
};

type SignedAvatarBatchRow = {
  readonly error?: string | null;
  readonly path?: string | null;
  readonly signedUrl?: string | null;
  readonly signedURL?: string | null;
};

type SettlementMovementRecord = {
  readonly amount_minor: number;
  readonly creditor_user_id: string;
  readonly debtor_user_id: string;
};

async function expectRows<T>(query: PromiseLike<QueryResult<T>>, label: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }

  return data ?? [];
}

function mergeRowsById<T extends { readonly id: string }>(...groups: readonly T[][]): T[] {
  const rowsById = new Map<string, T>();
  for (const group of groups) {
    for (const row of group) {
      rowsById.set(row.id, row);
    }
  }

  return Array.from(rowsById.values());
}

function addIds(target: Set<string>, ...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      target.add(value);
    }
  }
}

function addMovementUserIds(target: Set<string>, movementsJson: unknown) {
  for (const record of parseSettlementMovementRecords(movementsJson)) {
    addIds(target, record.debtor_user_id, record.creditor_user_id);
  }
}

function parseSettlementMovementRecords(value: unknown): SettlementMovementRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((movement) => {
    if (!movement || typeof movement !== 'object') {
      return [];
    }

    const record = movement as Record<string, unknown>;
    if (
      typeof record.debtor_user_id === 'string' &&
      typeof record.creditor_user_id === 'string' &&
      typeof record.amount_minor === 'number'
    ) {
      return [
        {
          amount_minor: record.amount_minor,
          creditor_user_id: record.creditor_user_id,
          debtor_user_id: record.debtor_user_id,
        },
      ];
    }

    return [];
  });
}

function actorSettlementMovements(value: unknown, actorUserId: string): SettlementMovementRecord[] {
  return parseSettlementMovementRecords(value).filter(
    (movement) =>
      movement.debtor_user_id === actorUserId || movement.creditor_user_id === actorUserId,
  );
}

function groupSettlementParticipantsByProposalId(
  participants: readonly Record<string, unknown>[],
): Map<string, Record<string, unknown>[]> {
  const grouped = new Map<string, Record<string, unknown>[]>();

  for (const participant of participants) {
    const proposalId = participant.settlement_proposal_id;
    if (typeof proposalId !== 'string') {
      continue;
    }

    const bucket = grouped.get(proposalId);
    if (bucket) {
      bucket.push(participant);
    } else {
      grouped.set(proposalId, [participant]);
    }
  }

  return grouped;
}

function sanitizeSettlementRowsForActor(input: {
  readonly actorUserId: string;
  readonly settlementParticipants: readonly Record<string, unknown>[];
  readonly settlementProposals: readonly Record<string, unknown>[];
}): {
  readonly settlementParticipants: readonly Record<string, unknown>[];
  readonly settlementProposals: readonly Record<string, unknown>[];
} {
  const participantsByProposalId = groupSettlementParticipantsByProposalId(
    input.settlementParticipants,
  );
  const visibleParticipants: Record<string, unknown>[] = [];

  const settlementProposals = input.settlementProposals.map((proposal) => {
    const proposalId = proposal.id;
    const participants =
      typeof proposalId === 'string' ? (participantsByProposalId.get(proposalId) ?? []) : [];
    const actorMovements = actorSettlementMovements(proposal.movements_json, input.actorUserId);
    const actorGraphSnapshot = actorSettlementMovements(proposal.graph_snapshot, input.actorUserId);
    const directUserIds = new Set<string>([input.actorUserId]);

    addMovementUserIds(directUserIds, actorMovements);

    for (const participant of participants) {
      const participantUserId = participant.participant_user_id;
      if (typeof participantUserId === 'string' && directUserIds.has(participantUserId)) {
        visibleParticipants.push(participant);
      }
    }

    const approvedCount = participants.filter(
      (participant) => participant.decision === 'approved',
    ).length;
    const approvalsPending = participants.filter(
      (participant) => participant.decision === 'pending',
    ).length;

    return {
      ...proposal,
      anchor_user_high_id:
        typeof proposal.anchor_user_high_id === 'string' &&
        directUserIds.has(proposal.anchor_user_high_id)
          ? proposal.anchor_user_high_id
          : null,
      anchor_user_low_id:
        typeof proposal.anchor_user_low_id === 'string' &&
        directUserIds.has(proposal.anchor_user_low_id)
          ? proposal.anchor_user_low_id
          : null,
      created_by_user_id: input.actorUserId,
      graph_snapshot: actorGraphSnapshot,
      movements_json: actorMovements,
      privacy_approved_count: approvedCount,
      privacy_approvals_pending: approvalsPending,
      privacy_participant_count: participants.length,
    };
  });

  return {
    settlementParticipants: visibleParticipants,
    settlementProposals,
  };
}

function normalizeAvatarPath(path: unknown): string | null {
  if (typeof path !== 'string') {
    return null;
  }

  const normalizedPath = path.trim().replace(/^\/+/, '');
  return normalizedPath.length > 0 ? normalizedPath : null;
}

function isDirectAvatarUri(path: string): boolean {
  return /^(https?:|file:|content:|asset:|data:|blob:|ph:)/i.test(path);
}

async function createSignedAvatarUrlsByPath(
  client: ReturnType<typeof createServiceRoleClient>,
  profiles: readonly Record<string, unknown>[],
): Promise<Record<string, { readonly expiresAt: string; readonly url: string }>> {
  const avatarPaths = Array.from(
    new Set(
      profiles
        .map((profile) => normalizeAvatarPath(profile.avatar_path))
        .filter((path): path is string => Boolean(path && !isDirectAvatarUri(path))),
    ),
  );

  if (avatarPaths.length === 0) {
    return {};
  }

  const expiresAt = new Date(Date.now() + AVATAR_SIGNED_URL_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await client.storage
    .from('avatars')
    .createSignedUrls(avatarPaths, AVATAR_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    console.error('avatar_signed_urls_error', {
      message: error?.message ?? 'missing signed urls',
      pathCount: avatarPaths.length,
    });
    return {};
  }

  const entries = (data as readonly SignedAvatarBatchRow[]).map((row, index) => {
    const path = normalizeAvatarPath(row.path ?? avatarPaths[index]);
    const signedUrl = row.signedUrl ?? row.signedURL ?? null;

    if (row.error || !path || !signedUrl) {
      console.error('avatar_signed_url_error', {
        message: row.error ?? 'missing signed url',
        path: path ?? avatarPaths[index] ?? 'unknown',
      });
      return null;
    }

    return [
      path,
      {
        expiresAt,
        url: signedUrl,
      },
    ] as const;
  });

  return Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry));
}

function participantScope(actorUserId: string) {
  return [
    `creator_user_id.eq.${actorUserId}`,
    `responder_user_id.eq.${actorUserId}`,
    `debtor_user_id.eq.${actorUserId}`,
    `creditor_user_id.eq.${actorUserId}`,
  ].join(',');
}

function friendshipScope(actorUserId: string) {
  return [
    `inviter_user_id.eq.${actorUserId}`,
    `target_user_id.eq.${actorUserId}`,
    `claimant_user_id.eq.${actorUserId}`,
  ].join(',');
}

function accountInviteScope(actorUserId: string) {
  return [`inviter_user_id.eq.${actorUserId}`, `activated_user_id.eq.${actorUserId}`].join(',');
}

Deno.serve((request) =>
  handleRpc(request, async (_body, actorUserId) => {
    const client = createServiceRoleClient();
    const snapshotStartedAt = performance.now();
    const serverTimings: Record<string, number> = {};
    async function timed<T>(label: string, promise: Promise<T>): Promise<T> {
      const startedAt = performance.now();
      try {
        return await promise;
      } finally {
        serverTimings[label] = Math.max(0, Math.round(performance.now() - startedAt));
      }
    }

    const relationships = await timed(
      'relationships',
      expectRows<Record<string, unknown>>(
        client
          .from('relationships')
          .select(RELATIONSHIP_SELECT)
          .eq('status', 'active')
          .or(`user_low_id.eq.${actorUserId},user_high_id.eq.${actorUserId}`)
          .order('created_at', { ascending: false }),
        'relationships',
      ),
    );

    const relationshipIds = relationships.map((relationship) => relationship.id as string);
    const visibleUserIds = new Set<string>([actorUserId]);
    for (const relationship of relationships) {
      addIds(visibleUserIds, relationship.user_low_id, relationship.user_high_id);
    }

    const relationshipScopedRows =
      relationshipIds.length === 0
        ? Promise.resolve({
            openDebts: [],
            history: [],
          })
        : timed(
            'relationship_scoped_rows',
            Promise.all([
              expectRows<Record<string, unknown>>(
                client
                  .from('v_open_debts')
                  .select(OPEN_DEBT_SELECT)
                  .in('relationship_id', relationshipIds)
                  .order('relationship_id', { ascending: true }),
                'open_debts',
              ),
              expectRows<Record<string, unknown>>(
                client
                  .from('v_relationship_history')
                  .select(RELATIONSHIP_HISTORY_SELECT)
                  .in('relationship_id', relationshipIds)
                  .order('happened_at', { ascending: false })
                  .limit(LIMITS.relationshipHistory),
                'relationship_history',
              ),
            ]).then(([openDebts, history]) => ({ openDebts, history })),
          );

    const [
      { openDebts, history },
      pendingFinancialRequests,
      historicalFinancialRequests,
      inboxItems,
      activeFriendshipInvites,
      historicalFriendshipInvites,
      activeAccountInvites,
      historicalAccountInvites,
      activeSettlementProposals,
      historicalSettlementProposals,
      happyCircleScoreEvents,
      notificationViews,
      auditEvents,
    ] = await timed('initial_parallel_queries', Promise.all([
      relationshipScopedRows,
      expectRows<Record<string, unknown>>(
        client
          .from('financial_requests')
          .select(FINANCIAL_REQUEST_SELECT)
          .or(participantScope(actorUserId))
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        'pending_financial_requests',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('financial_requests')
          .select(FINANCIAL_REQUEST_SELECT)
          .or(participantScope(actorUserId))
          .neq('status', 'pending')
          .order('updated_at', { ascending: false })
          .limit(LIMITS.financialRequestHistory),
        'financial_request_history',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('v_inbox_items')
          .select(INBOX_ITEM_SELECT)
          .eq('owner_user_id', actorUserId)
          .order('created_at', { ascending: false }),
        'inbox_items',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('v_friendship_invites_live')
          .select(FRIENDSHIP_INVITE_SELECT)
          .or(friendshipScope(actorUserId))
          .in('status', ACTIVE_FRIENDSHIP_INVITE_STATUSES)
          .order('updated_at', { ascending: false }),
        'active_friendship_invites',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('v_friendship_invites_live')
          .select(FRIENDSHIP_INVITE_SELECT)
          .or(friendshipScope(actorUserId))
          .in('status', HISTORY_FRIENDSHIP_INVITE_STATUSES)
          .order('updated_at', { ascending: false })
          .limit(LIMITS.friendshipInviteHistory),
        'friendship_invite_history',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('v_account_invites_live')
          .select(ACCOUNT_INVITE_SELECT)
          .or(accountInviteScope(actorUserId))
          .in('status', ACTIVE_ACCOUNT_INVITE_STATUSES)
          .order('updated_at', { ascending: false }),
        'active_account_invites',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('v_account_invites_live')
          .select(ACCOUNT_INVITE_SELECT)
          .or(accountInviteScope(actorUserId))
          .in('status', HISTORY_ACCOUNT_INVITE_STATUSES)
          .order('updated_at', { ascending: false })
          .limit(LIMITS.accountInviteHistory),
        'account_invite_history',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('settlement_proposals')
          .select(SETTLEMENT_PROPOSAL_WITH_ACTOR_SELECT)
          .eq('settlement_proposal_participants.participant_user_id', actorUserId)
          .in('status', ACTIVE_SETTLEMENT_STATUSES)
          .order('updated_at', { ascending: false }),
        'active_settlement_proposals',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('settlement_proposals')
          .select(SETTLEMENT_PROPOSAL_WITH_ACTOR_SELECT)
          .eq('settlement_proposal_participants.participant_user_id', actorUserId)
          .in('status', HISTORY_SETTLEMENT_STATUSES)
          .order('updated_at', { ascending: false })
          .limit(LIMITS.settlementHistory),
        'settlement_proposal_history',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('happy_circle_score_events')
          .select(HAPPY_CIRCLE_SCORE_EVENT_SELECT)
          .eq('user_id', actorUserId)
          .order('awarded_at', { ascending: false }),
        'happy_circle_score_events',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('notification_views')
          .select(NOTIFICATION_VIEW_SELECT)
          .eq('user_id', actorUserId)
          .order('viewed_at', { ascending: false })
          .limit(LIMITS.notificationViews),
        'notification_views',
      ),
      expectRows<Record<string, unknown>>(
        client
          .from('audit_events')
          .select(AUDIT_EVENT_SELECT)
          .eq('actor_user_id', actorUserId)
          .order('created_at', { ascending: false })
          .limit(LIMITS.auditEvents),
        'audit_events',
      ),
    ]));

    const financialRequests = mergeRowsById(
      pendingFinancialRequests as { readonly id: string }[],
      historicalFinancialRequests as { readonly id: string }[],
    );
    const friendshipInvites = mergeRowsById(
      activeFriendshipInvites as { readonly id: string }[],
      historicalFriendshipInvites as { readonly id: string }[],
    );
    const accountInvites = mergeRowsById(
      activeAccountInvites as { readonly id: string }[],
      historicalAccountInvites as { readonly id: string }[],
    );

    const friendshipInviteIds = friendshipInvites.map((invite) => invite.id);
    const accountInviteIds = accountInvites.map((invite) => invite.id);

    const [friendshipInviteDeliveries, accountInviteDeliveries] = await timed(
      'invite_deliveries',
      Promise.all([
        friendshipInviteIds.length === 0
          ? Promise.resolve([])
          : expectRows<Record<string, unknown>>(
              client
                .from('v_friendship_invite_deliveries_live')
                .select(FRIENDSHIP_INVITE_DELIVERY_SELECT)
                .in('invite_id', friendshipInviteIds)
                .order('created_at', { ascending: false }),
              'friendship_invite_deliveries',
            ),
        accountInviteIds.length === 0
          ? Promise.resolve([])
          : expectRows<Record<string, unknown>>(
              client
                .from('v_account_invite_deliveries_live')
                .select(ACCOUNT_INVITE_DELIVERY_SELECT)
                .in('invite_id', accountInviteIds)
                .order('created_at', { ascending: false }),
              'account_invite_deliveries',
            ),
      ]),
    );

    let settlementProposals = mergeRowsById(
      activeSettlementProposals as (Record<string, unknown> & { readonly id: string })[],
      historicalSettlementProposals as (Record<string, unknown> & { readonly id: string })[],
    );
    const settlementCaseIds = Array.from(
      new Set(
        settlementProposals
          .map((proposal) => proposal.happy_circle_case_id)
          .filter((caseId): caseId is string => typeof caseId === 'string' && caseId.length > 0),
      ),
    );
    const caseSettlementProposals =
      settlementCaseIds.length === 0
        ? []
        : await timed(
            'settlement_proposal_versions',
            expectRows<Record<string, unknown>>(
              client
                .from('settlement_proposals')
                .select(SETTLEMENT_PROPOSAL_WITH_ACTOR_SELECT)
                .eq('settlement_proposal_participants.participant_user_id', actorUserId)
                .in('happy_circle_case_id', settlementCaseIds)
                .order('version_number', { ascending: true }),
              'settlement_proposal_versions',
            ),
          );
    settlementProposals = mergeRowsById(
      settlementProposals,
      caseSettlementProposals as (Record<string, unknown> & { readonly id: string })[],
    );
    const settlementProposalIds = settlementProposals.map((proposal) => proposal.id);
    let settlementParticipants =
      settlementProposalIds.length === 0
        ? []
        : await timed(
            'settlement_participants',
            expectRows<Record<string, unknown>>(
              client
                .from('settlement_proposal_participants')
                .select(SETTLEMENT_PARTICIPANT_SELECT)
                .in('settlement_proposal_id', settlementProposalIds)
                .order('created_at', { ascending: true }),
              'settlement_participants',
            ),
          );
    const actorScopedSettlements = sanitizeSettlementRowsForActor({
      actorUserId,
      settlementParticipants,
      settlementProposals,
    });

    settlementProposals = actorScopedSettlements.settlementProposals as (Record<string, unknown> & {
      readonly id: string;
    })[];
    settlementParticipants = [...actorScopedSettlements.settlementParticipants];

    for (const request of financialRequests) {
      addIds(
        visibleUserIds,
        request.creator_user_id,
        request.responder_user_id,
        request.debtor_user_id,
        request.creditor_user_id,
      );
    }

    for (const row of history) {
      addIds(
        visibleUserIds,
        row.creator_user_id,
        row.responder_user_id,
        row.debtor_user_id,
        row.creditor_user_id,
      );
    }

    for (const invite of friendshipInvites) {
      addIds(
        visibleUserIds,
        invite.inviter_user_id,
        invite.target_user_id,
        invite.claimant_user_id,
      );
    }

    for (const delivery of friendshipInviteDeliveries) {
      addIds(visibleUserIds, delivery.claimed_by_user_id);
    }

    for (const invite of accountInvites) {
      addIds(visibleUserIds, invite.inviter_user_id, invite.activated_user_id);
    }

    for (const delivery of accountInviteDeliveries) {
      addIds(visibleUserIds, delivery.authenticated_user_id);
    }

    for (const proposal of settlementProposals) {
      addIds(
        visibleUserIds,
        proposal.created_by_user_id,
        proposal.anchor_user_low_id,
        proposal.anchor_user_high_id,
      );
      addMovementUserIds(visibleUserIds, proposal.movements_json);
    }

    for (const participant of settlementParticipants) {
      addIds(visibleUserIds, participant.participant_user_id);
    }

    const profiles = await timed(
      'profiles',
      expectRows<Record<string, unknown>>(
        client
          .from('user_profiles')
          .select(PROFILE_SELECT)
          .in('id', Array.from(visibleUserIds))
          .order('display_name', { ascending: true }),
        'profiles',
      ),
    );
    const avatarSignedUrlsByPath = await timed(
      'avatar_signed_urls',
      createSignedAvatarUrlsByPath(client, profiles),
    );
    serverTimings.total = Math.max(0, Math.round(performance.now() - snapshotStartedAt));

    return {
      profiles,
      avatarSignedUrlsByPath,
      relationships,
      openDebts,
      financialRequests,
      history,
      inboxItems,
      friendshipInvites,
      friendshipInviteDeliveries,
      accountInvites,
      accountInviteDeliveries,
      settlementProposals,
      settlementParticipants,
      happyCircleScoreEvents,
      notificationViews,
      auditEvents,
      limits: LIMITS,
      serverTimings,
      fetchedAt: new Date().toISOString(),
    };
  }),
);
