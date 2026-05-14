import {
  createClientFingerprintHash,
  createSha256Hex,
  createServiceRoleClient,
  getOptionalActorUserId,
  handlePublicRpc,
  requireString,
} from '../_shared/http.ts';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid invite preview');
  }

  return value as Record<string, unknown>;
}

Deno.serve((request) =>
  handlePublicRpc(
    request,
    async (body) => {
      const client = createServiceRoleClient();
      const actorUserId = await getOptionalActorUserId(request);
      const clientFingerprintHash = await createClientFingerprintHash(request);
      const { data, error } = await client.rpc('get_account_invite_preview_public', {
        p_actor_user_id: actorUserId,
        p_delivery_token: requireString(body.deliveryToken, 'deliveryToken'),
        p_record_app_open: body.recordAppOpen !== false,
        p_client_fingerprint_hash: clientFingerprintHash,
      });

      if (error) {
        throw error;
      }

      const preview = asRecord(data);
      return {
        channel: preview.channel ?? null,
        deliveryId: preview.deliveryId ?? null,
        deliveryStatus: preview.deliveryStatus ?? 'unavailable',
        expiresAt: preview.expiresAt ?? null,
        intendedRecipientPhoneMasked: preview.intendedRecipientPhoneMasked ?? null,
        inviteExpiresAt: preview.inviteExpiresAt ?? null,
        inviteId: preview.inviteId ?? null,
        inviterAvatarPath: preview.inviterAvatarPath ?? null,
        inviterDisplayName: preview.inviterDisplayName ?? null,
        reason: preview.reason ?? 'invite_unavailable',
        resolvedAt: preview.resolvedAt ?? null,
        status: preview.status ?? 'unavailable',
      };
    },
    {
      rateLimit: [
        {
          actorRequired: false,
          limit: 20,
          scope: async ({ body }) => {
            const deliveryToken =
              typeof body.deliveryToken === 'string' && body.deliveryToken.trim().length > 0
                ? body.deliveryToken.trim()
                : 'invalid-token';
            const deliveryTokenHash = await createSha256Hex(deliveryToken);
            return `get-account-invite-preview-public:${deliveryTokenHash}`;
          },
          windowSeconds: 60 * 60,
        },
        {
          actorRequired: false,
          limit: 120,
          scope: 'get-account-invite-preview-public:global',
          windowSeconds: 60 * 60,
        },
      ],
    },
  ),
);
