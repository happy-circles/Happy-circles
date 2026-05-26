import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

const PLATFORMS = new Set(['ios', 'android']);
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const deviceId = requireString(body.deviceId, 'deviceId');
    const enabled = body.enabled !== false;

    if (!enabled) {
      const { error } = await client
        .from('push_devices')
        .update({
          disabled_at: new Date().toISOString(),
          enabled: false,
        })
        .eq('user_id', actorUserId)
        .eq('device_id', deviceId);

      if (error) {
        throw error;
      }

      return { status: 'disabled' };
    }

    const expoPushToken = requireString(body.expoPushToken, 'expoPushToken');
    const platform = requireString(body.platform, 'platform');

    if (!EXPO_PUSH_TOKEN_PATTERN.test(expoPushToken)) {
      throw new Error('Invalid expoPushToken');
    }

    if (!PLATFORMS.has(platform)) {
      throw new Error('Invalid platform');
    }

    const timestamp = new Date().toISOString();
    const staleRows = await client
      .from('push_devices')
      .update({
        disabled_at: timestamp,
        enabled: false,
      })
      .eq('user_id', actorUserId)
      .eq('device_id', deviceId)
      .neq('expo_push_token', expoPushToken);

    if (staleRows.error) {
      throw staleRows.error;
    }

    const { data, error } = await client
      .from('push_devices')
      .upsert(
        {
          app_version: readOptionalString(body.appVersion),
          device_id: deviceId,
          device_name: readOptionalString(body.deviceName),
          disabled_at: null,
          enabled: true,
          expo_push_token: expoPushToken,
          last_seen_at: timestamp,
          platform,
          user_id: actorUserId,
        },
        { onConflict: 'expo_push_token' },
      )
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return { deviceRowId: data.id, status: 'registered' };
  }),
);
