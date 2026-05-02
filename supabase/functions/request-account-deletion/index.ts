import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

const AVATAR_BUCKET = 'avatars';

async function removeAvatarObjects(
  client: ReturnType<typeof createServiceRoleClient>,
  userId: string,
) {
  const { data, error } = await client.storage.from(AVATAR_BUCKET).list(userId, {
    limit: 100,
    offset: 0,
  });

  if (error) {
    console.warn('account_deletion_avatar_list_failed', {
      detail: error.message,
      userId,
    });
    return 0;
  }

  const objectPaths = (data ?? [])
    .map((object) => `${userId}/${object.name}`)
    .filter((path) => path.trim().length > userId.length + 1);

  if (objectPaths.length === 0) {
    return 0;
  }

  const removeResult = await client.storage.from(AVATAR_BUCKET).remove(objectPaths);
  if (removeResult.error) {
    console.warn('account_deletion_avatar_remove_failed', {
      detail: removeResult.error.message,
      userId,
    });
    return 0;
  }

  return objectPaths.length;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const idempotencyKey = requireString(body.idempotencyKey, 'idempotencyKey');

    const avatarObjectsRemoved = await removeAvatarObjects(client, actorUserId);

    const { data, error } = await client.rpc('request_account_deletion', {
      p_actor_user_id: actorUserId,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      throw error;
    }

    const deleteResult = await client.auth.admin.deleteUser(actorUserId, true);
    const authUserDeleted = !deleteResult.error;
    if (deleteResult.error) {
      console.warn('account_deletion_auth_delete_failed', {
        detail: deleteResult.error.message,
        userId: actorUserId,
      });
    }

    return {
      ...(data as Record<string, unknown>),
      authUserDeleted,
      avatarObjectsRemoved,
    };
  }),
);
