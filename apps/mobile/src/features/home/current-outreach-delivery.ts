import { assertAccountDeliveryCurrent } from '@/features/invites/invite-delivery-validation';
import { assertSupabaseClient } from '@/lib/live-data/client';
import type { AccountInviteDeliveryResult } from '@/lib/live-data/types-runtime';

const CURRENT_DELIVERY_VALIDATION_MAX_AGE_MS = 15_000;

interface CurrentOutreachDeliveryInput {
  readonly delivery: AccountInviteDeliveryResult;
  readonly expectedUserId: string | null;
  readonly phoneE164: string;
  readonly validation?: unknown;
}

export async function assertCurrentOutreachActor(expectedUserId: string | null) {
  if (!expectedUserId) throw new Error('Inicia sesión para compartir esta invitación.');
  const { data, error } = await assertSupabaseClient().auth.getSession();
  if (error || data.session?.user.id !== expectedUserId) {
    throw new Error('La sesión cambió. Vuelve a intentar la acción.');
  }
}

function hasCurrentDeliveryValidation(input: CurrentOutreachDeliveryInput, now: number): boolean {
  const { delivery, expectedUserId, phoneE164, validation } = input;
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) return false;
  const proof = validation as Record<string, unknown>;
  if (
    !expectedUserId ||
    proof.status !== 'current' ||
    proof.ownerUserId !== expectedUserId ||
    proof.phoneE164 !== phoneE164 ||
    delivery.intendedRecipientPhoneE164 !== phoneE164 ||
    !delivery.inviteId ||
    proof.inviteId !== delivery.inviteId ||
    !delivery.deliveryId ||
    proof.deliveryId !== delivery.deliveryId ||
    proof.channel !== 'remote' ||
    delivery.channel !== 'remote' ||
    delivery.originChannel !== 'remote' ||
    delivery.status !== 'pending_activation' ||
    (proof.deliveryStatus !== 'issued' && proof.deliveryStatus !== 'authenticated') ||
    typeof delivery.deliveryToken !== 'string' ||
    !delivery.deliveryToken.trim() ||
    typeof delivery.expiresAt !== 'string' ||
    typeof delivery.inviteExpiresAt !== 'string' ||
    proof.expiresAt !== delivery.expiresAt ||
    proof.inviteExpiresAt !== delivery.inviteExpiresAt ||
    typeof proof.validatedAt !== 'string'
  ) {
    return false;
  }
  const validatedAt = Date.parse(proof.validatedAt);
  const expiresAt = Date.parse(delivery.expiresAt);
  const inviteExpiresAt = Date.parse(delivery.inviteExpiresAt);
  const ageMs = now - validatedAt;
  return (
    Number.isFinite(validatedAt) &&
    Number.isFinite(expiresAt) &&
    Number.isFinite(inviteExpiresAt) &&
    ageMs >= 0 &&
    ageMs <= CURRENT_DELIVERY_VALIDATION_MAX_AGE_MS &&
    expiresAt > now &&
    inviteExpiresAt > now
  );
}

/** Only the fresh response of this contact command can replace a delivery preview. */
export async function assertCurrentOutreachDelivery(input: CurrentOutreachDeliveryInput) {
  await assertCurrentOutreachActor(input.expectedUserId);
  if (hasCurrentDeliveryValidation(input, Date.now())) return;
  await assertAccountDeliveryCurrent(input.delivery);
  await assertCurrentOutreachActor(input.expectedUserId);
}
