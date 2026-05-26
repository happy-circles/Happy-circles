const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const pushWorkerSecret =
  readEnvSecret('PUSH_NOTIFICATION_WORKER_SECRET') ??
  readEnvSecret('GRAPH_CYCLE_WORKER_SECRET') ??
  '';

interface SupabaseLikeClient {
  from(table: string): any;
}

interface PushNotificationEventInput {
  readonly recipientUserId: string | null;
  readonly notificationKey: string;
  readonly sourceKind: string;
  readonly sourceItemId: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly metadata?: Record<string, unknown>;
}

interface RecordValue {
  readonly [key: string]: unknown;
}

function readEnvSecret(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

function asRecord(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function readString(record: RecordValue | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readPayloadString(value: unknown, key: string): string | null {
  return readString(asRecord(value), key);
}

function displayName(profile: RecordValue | null, fallback = 'Alguien'): string {
  return readString(profile, 'display_name') ?? fallback;
}

async function findById(
  client: SupabaseLikeClient,
  table: string,
  id: string,
  columns = '*',
): Promise<RecordValue | null> {
  const { data, error } = await client.from(table).select(columns).eq('id', id).maybeSingle();

  if (error) {
    console.error('push_notification_lookup_failed', { table, detail: error.message });
    return null;
  }

  return asRecord(data);
}

async function findProfile(
  client: SupabaseLikeClient,
  userId: string | null,
): Promise<RecordValue | null> {
  if (!userId) {
    return null;
  }

  return findById(client, 'user_profiles', userId, 'id, display_name, email');
}

export function triggerPushNotificationWorker(limit = 25): void {
  if (!supabaseUrl || !supabaseServiceRoleKey || !pushWorkerSecret) {
    return;
  }

  const promise = fetch(`${supabaseUrl}/functions/v1/send-push-notifications`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      'x-worker-secret': pushWorkerSecret,
    },
    body: JSON.stringify({ limit }),
  }).catch((error) => {
    console.error('push_worker_trigger_failed', {
      detail: error instanceof Error ? error.message : String(error),
    });
  });

  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
  }
}

export async function enqueuePushNotification(
  client: SupabaseLikeClient,
  input: PushNotificationEventInput,
): Promise<boolean> {
  if (!input.recipientUserId || input.recipientUserId === input.metadata?.actorUserId) {
    return false;
  }

  const { data, error } = await client
    .from('push_notification_events')
    .insert({
      body: input.body,
      href: input.href,
      metadata_json: input.metadata ?? {},
      notification_key: input.notificationKey,
      recipient_user_id: input.recipientUserId,
      source_item_id: input.sourceItemId,
      source_kind: input.sourceKind,
      title: input.title,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.message.toLocaleLowerCase('en-US').includes('duplicate')) {
      return false;
    }

    console.error('push_notification_enqueue_failed', {
      key: input.notificationKey,
      detail: error.message,
    });
    return false;
  }

  return Boolean(data);
}

export async function notifyFinancialRequestPending(
  client: SupabaseLikeClient,
  actorUserId: string,
  requestId: string | null,
): Promise<void> {
  if (!requestId) {
    return;
  }

  const request = await findById(
    client,
    'financial_requests',
    requestId,
    'id, responder_user_id, creator_user_id, amount_minor, description, status',
  );

  if (readString(request, 'status') !== 'pending') {
    return;
  }

  const actor = await findProfile(client, actorUserId);
  const created = await enqueuePushNotification(client, {
    body: `${displayName(actor)} te envio un movimiento para revisar.`,
    href: '/activity?category=transactions',
    metadata: { actorUserId },
    notificationKey: `financial_request:${requestId}:requires_you`,
    recipientUserId: readString(request, 'responder_user_id'),
    sourceItemId: requestId,
    sourceKind: 'financial_request',
    title: 'Movimiento por revisar',
  });

  if (created) {
    triggerPushNotificationWorker(10);
  }
}

export async function notifyInternalFriendshipInvite(
  client: SupabaseLikeClient,
  actorUserId: string,
  inviteId: string | null,
): Promise<void> {
  if (!inviteId) {
    return;
  }

  const invite = await findById(
    client,
    'friendship_invites',
    inviteId,
    'id, inviter_user_id, target_user_id, flow, status',
  );

  if (
    readString(invite, 'flow') !== 'internal' ||
    readString(invite, 'status') !== 'pending_recipient'
  ) {
    return;
  }

  const actor = await findProfile(client, actorUserId);
  const created = await enqueuePushNotification(client, {
    body: `${displayName(actor)} quiere conectar contigo en Happy Circles.`,
    href: '/activity?category=friends',
    metadata: { actorUserId },
    notificationKey: `friendship_invite:${inviteId}:requires_you_response`,
    recipientUserId: readString(invite, 'target_user_id'),
    sourceItemId: inviteId,
    sourceKind: 'friendship_invite',
    title: 'Nueva invitacion',
  });

  if (created) {
    triggerPushNotificationWorker(10);
  }
}

export async function notifyFriendshipInviteReview(
  client: SupabaseLikeClient,
  actorUserId: string,
  inviteId: string | null,
): Promise<void> {
  if (!inviteId) {
    return;
  }

  const invite = await findById(
    client,
    'friendship_invites',
    inviteId,
    'id, inviter_user_id, claimant_user_id, flow, status',
  );

  if (readString(invite, 'status') !== 'pending_sender_review') {
    return;
  }

  const actor = await findProfile(client, actorUserId);
  const created = await enqueuePushNotification(client, {
    body: `${displayName(actor)} acepto tu invitacion. Revisa la conexion.`,
    href: '/activity?category=friends',
    metadata: { actorUserId },
    notificationKey: `friendship_invite:${inviteId}:requires_you_review`,
    recipientUserId: readString(invite, 'inviter_user_id'),
    sourceItemId: inviteId,
    sourceKind: 'friendship_invite',
    title: 'Invitacion por revisar',
  });

  if (created) {
    triggerPushNotificationWorker(10);
  }
}

export async function notifyAccountInviteReview(
  client: SupabaseLikeClient,
  actorUserId: string,
  inviteId: string | null,
): Promise<void> {
  if (!inviteId) {
    return;
  }

  const invite = await findById(
    client,
    'account_invites',
    inviteId,
    'id, inviter_user_id, activated_user_id, status',
  );

  if (readString(invite, 'status') !== 'pending_inviter_review') {
    return;
  }

  const actor = await findProfile(client, actorUserId);
  const created = await enqueuePushNotification(client, {
    body: `${displayName(actor)} activo la invitacion. Revisa antes de conectarlo.`,
    href: '/activity?category=friends',
    metadata: { actorUserId },
    notificationKey: `account_invite:${inviteId}:requires_you_review`,
    recipientUserId: readString(invite, 'inviter_user_id'),
    sourceItemId: inviteId,
    sourceKind: 'account_invite',
    title: 'Cuenta por revisar',
  });

  if (created) {
    triggerPushNotificationWorker(10);
  }
}

export async function notifySettlementProposalPending(
  client: SupabaseLikeClient,
  actorUserId: string,
  proposalId: string | null,
): Promise<void> {
  if (!proposalId) {
    return;
  }

  const actor = await findProfile(client, actorUserId);
  const proposal = await findById(client, 'settlement_proposals', proposalId, 'id, status');

  if (readString(proposal, 'status') !== 'pending_approvals') {
    return;
  }

  const { data, error } = await client
    .from('settlement_proposal_participants')
    .select('participant_user_id, decision')
    .eq('settlement_proposal_id', proposalId);

  if (error) {
    console.error('push_settlement_participants_lookup_failed', { detail: error.message });
    return;
  }

  const participants = Array.isArray(data) ? data : data ? [data] : [];
  const createdEvents = await Promise.all(
    participants.map((value) => {
      const participant = asRecord(value);
      if (readString(participant, 'decision') !== 'pending') {
        return Promise.resolve(false);
      }

      return enqueuePushNotification(client, {
        body: `${displayName(actor)} propuso un Happy Circle para aprobar.`,
        href: `/settlements/${proposalId}`,
        metadata: { actorUserId },
        notificationKey: `settlement_proposal:${proposalId}:pending_approvals`,
        recipientUserId: readString(participant, 'participant_user_id'),
        sourceItemId: proposalId,
        sourceKind: 'settlement_proposal',
        title: 'Happy Circle por aprobar',
      });
    }),
  );

  if (createdEvents.some(Boolean)) {
    triggerPushNotificationWorker(25);
  }
}
