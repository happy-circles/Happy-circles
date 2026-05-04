import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

const AVATAR_BUCKET = 'avatars';
const SIGNED_AVATAR_URL_TTL_SECONDS = 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAvatarPath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/^\/+/, '');
  return normalized.length > 0 ? normalized : null;
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function createSignedAvatarUrl(
  client: ReturnType<typeof createServiceRoleClient>,
  rawPath: unknown,
): Promise<string | null> {
  const path = normalizeAvatarPath(rawPath);
  if (!path) {
    return null;
  }

  if (isRemoteUrl(path)) {
    return path;
  }

  const { data, error } = await client.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, SIGNED_AVATAR_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('friendship_invite_preview_avatar_sign_error', {
      detail: error?.message ?? 'missing signed url',
    });
    return null;
  }

  return data.signedUrl;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const { data, error } = await client.rpc('get_friendship_invite_preview', {
      p_actor_user_id: actorUserId,
      p_delivery_token: requireString(body.deliveryToken, 'deliveryToken'),
    });

    if (error) {
      throw error;
    }

    if (!isRecord(data)) {
      return data;
    }

    const inviterAvatarUrl = await createSignedAvatarUrl(client, data.inviterAvatarPath);
    if (!inviterAvatarUrl) {
      return data;
    }

    return {
      ...data,
      inviterAvatarPath: inviterAvatarUrl,
    };
  }),
);
