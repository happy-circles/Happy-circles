import { createServiceRoleClient, handleRpc, requireString } from '../_shared/http.ts';

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : false;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

Deno.serve((request) =>
  handleRpc(request, async (body, actorUserId) => {
    const client = createServiceRoleClient();
    const occurredAt = readOptionalString(body.occurredAt) ?? new Date().toISOString();

    const { data, error } = await client.rpc('record_support_error_report', {
      p_actor_user_id: actorUserId,
      p_support_id: requireString(body.supportId, 'supportId'),
      p_kind: requireString(body.kind, 'kind'),
      p_request_id: readOptionalString(body.requestId),
      p_error_code: readOptionalString(body.errorCode),
      p_error_message: requireString(body.errorMessage, 'errorMessage'),
      p_function_name: readOptionalString(body.functionName),
      p_screen_name: readOptionalString(body.screenName),
      p_route: readOptionalString(body.route),
      p_platform: requireString(body.platform, 'platform'),
      p_app_version: readOptionalString(body.appVersion),
      p_fatal: readBoolean(body.fatal),
      p_occurred_at: occurredAt,
      p_metadata_json: readMetadata(body.metadata),
    });

    if (error) {
      throw error;
    }

    return { reportId: data };
  }),
);
