import { accountInvitePreviewSchema, friendshipInvitePreviewSchema } from '@happy-circles/shared';
import { assertSupabaseClient } from '@/lib/live-data/client';
import { invokeParsedEdgeFunction } from '@/lib/live-data/mutations/edge-action';
import type {
  AccountInviteDeliveryResult,
  AccountInvitePreviewResult,
  FriendshipInviteDeliveryResult,
  FriendshipInvitePreviewResult,
} from '@/lib/live-data/types-runtime';

async function currentActor() {
  const { data } = await assertSupabaseClient().auth.getSession();
  if (!data.session) throw new Error('Inicia sesión para compartir esta invitación.');
  return data.session.user.id;
}

export async function assertFriendshipDeliveryCurrent(delivery: FriendshipInviteDeliveryResult) {
  const expectedUserId = await currentActor();
  const preview = await invokeParsedEdgeFunction<
    ReturnType<typeof friendshipInvitePreviewSchema.parse>,
    FriendshipInvitePreviewResult
  >(
    'get-friendship-invite-preview',
    friendshipInvitePreviewSchema,
    { deliveryToken: delivery.deliveryToken },
    { expectedUserId },
  );
  if (
    preview.inviteId !== delivery.inviteId ||
    preview.status !== 'pending_claim' ||
    (preview.deliveryStatus !== undefined && preview.deliveryStatus !== 'issued') ||
    preview.reason === 'delivery_revoked' ||
    !preview.expiresAt ||
    Date.parse(preview.expiresAt) <= Date.now()
  ) {
    throw new Error('Esta invitación ya cambió de estado. Actualiza la lista antes de reenviarla.');
  }
}

export async function assertAccountDeliveryCurrent(delivery: AccountInviteDeliveryResult) {
  const expectedUserId = await currentActor();
  const preview = await invokeParsedEdgeFunction<
    ReturnType<typeof accountInvitePreviewSchema.parse>,
    AccountInvitePreviewResult
  >(
    'get-account-invite-preview-public',
    accountInvitePreviewSchema,
    { deliveryToken: delivery.deliveryToken, recordAppOpen: false },
    { expectedUserId },
  );
  if (
    preview.inviteId !== delivery.inviteId ||
    preview.status !== 'pending_activation' ||
    !['issued', 'authenticated'].includes(preview.deliveryStatus) ||
    !preview.expiresAt ||
    Date.parse(preview.expiresAt) <= Date.now()
  ) {
    throw new Error('Este acceso ya cambió de estado. Actualiza la lista antes de reenviarlo.');
  }
}
