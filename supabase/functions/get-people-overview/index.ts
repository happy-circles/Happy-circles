import { createServiceRoleClient, handleRpc } from '../_shared/http.ts';

const AVATAR_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

type PeopleOverviewRow = {
  readonly avatar_path: string | null;
  readonly avatar_updated_at: string | null;
  readonly direction: 'i_owe' | 'owes_me' | 'settled';
  readonly display_name: string;
  readonly last_activity_at: string | null;
  readonly net_amount_minor: number | string;
  readonly pending_count: number;
  readonly user_id: string;
};

type SignedAvatarBatchRow = {
  readonly error?: string | null;
  readonly path?: string | null;
  readonly signedUrl?: string | null;
  readonly signedURL?: string | null;
};

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
  rows: readonly PeopleOverviewRow[],
): Promise<Record<string, { readonly expiresAt: string; readonly url: string }>> {
  const avatarPaths = Array.from(
    new Set(
      rows
        .map((row) => normalizeAvatarPath(row.avatar_path))
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
    console.error('people_overview_avatar_signed_urls_error', {
      message: error?.message ?? 'missing signed urls',
      pathCount: avatarPaths.length,
    });
    return {};
  }

  const entries = (data as readonly SignedAvatarBatchRow[]).flatMap((row, index) => {
    const path = normalizeAvatarPath(row.path ?? avatarPaths[index]);
    const signedUrl = row.signedUrl ?? row.signedURL ?? null;

    if (row.error || !path || !signedUrl) {
      return [];
    }

    return [
      [
        path,
        {
          expiresAt,
          url: signedUrl,
        },
      ] as const,
    ];
  });

  return Object.fromEntries(entries);
}

Deno.serve((request) =>
  handleRpc(request, async (_body, actorUserId) => {
    const client = createServiceRoleClient();
    const startedAt = performance.now();
    const { data, error } = await client.rpc('get_people_overview_rows', {
      p_actor_user_id: actorUserId,
    });

    if (error) {
      throw new Error(`people_overview: ${error.message}`);
    }

    const people = (data ?? []) as PeopleOverviewRow[];
    const avatarSignedUrlsByPath = await createSignedAvatarUrlsByPath(client, people);

    return {
      avatarSignedUrlsByPath,
      fetchedAt: new Date().toISOString(),
      people,
      serverTimingMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }),
);
