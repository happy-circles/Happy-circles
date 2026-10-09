type RpcResult = { readonly data: unknown; readonly error: unknown };
type RpcClient = {
  readonly rpc: (name: string, parameters: Record<string, unknown>) => PromiseLike<RpcResult>;
};
type Dependencies = {
  readonly createClient: () => RpcClient;
  readonly requireString: (value: unknown, name: string) => string;
  readonly triggerPushWorker: (limit: number) => void;
  readonly onTiming?: (timing: {
    readonly rateLimitMs: number;
    readonly businessMs: number;
    readonly totalMs: number;
    readonly success: boolean;
  }) => void;
};
type Handler = (body: Record<string, unknown>, actorUserId: string) => Promise<unknown>;
type AuthenticatedRpc = (
  request: Request,
  handler: Handler,
  options: { readonly rateLimit: false },
) => Promise<Response>;

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function createPeopleOutreachHandler(dependencies: Dependencies): Handler {
  return async (body, actorUserId) => {
    const startedAt = performance.now();
    let businessStartedAt: number | null = null;
    let rateLimitMs = 0;
    let businessMs = 0;
    let success = false;
    try {
      const client = dependencies.createClient();
      // This single committed RPC enforces both existing quotas before validation
      // or business writes. Its denial must be raised outside the SQL transaction.
      const rate = await client.rpc('check_people_outreach_rate_limits', {
        p_actor_user_id: actorUserId,
      });
      rateLimitMs = performance.now() - startedAt;
      if (rate.error) throw rate.error;
      if (typeof rate.data !== 'object' || rate.data === null || Array.isArray(rate.data))
        throw new Error('Invalid outreach rate limit response');
      const allowed = (rate.data as { readonly allowed?: unknown }).allowed;
      if (allowed === false) throw new Error('edge_rate_limited');
      if (allowed !== true) throw new Error('Invalid outreach rate limit response');

      businessStartedAt = performance.now();
      const { data, error } = await client.rpc('create_people_outreach', {
        p_actor_user_id: actorUserId,
        p_idempotency_key: dependencies.requireString(body.idempotencyKey, 'idempotencyKey'),
        p_channel: dependencies.requireString(body.channel, 'channel'),
        p_source_context: optionalString(body.sourceContext),
        p_intended_recipient_alias: optionalString(body.intendedRecipientAlias),
        p_intended_recipient_phone_e164: optionalString(body.intendedRecipientPhoneE164),
        p_intended_recipient_phone_label: optionalString(body.intendedRecipientPhoneLabel),
      });
      businessMs = performance.now() - businessStartedAt;
      if (error) throw error;
      if (
        typeof data === 'object' &&
        data !== null &&
        !Array.isArray(data) &&
        optionalString((data as { readonly kind?: unknown }).kind) === 'friendship'
      )
        dependencies.triggerPushWorker(10);
      success = true;
      return data;
    } finally {
      const totalMs = performance.now() - startedAt;
      if (businessStartedAt === null) rateLimitMs = totalMs;
      else if (!businessMs) businessMs = performance.now() - businessStartedAt;
      try {
        dependencies.onTiming?.({ rateLimitMs, businessMs, totalMs, success });
      } catch {
        // Telemetry must never replace a committed action or its original error.
      }
    }
  };
}

export function createPeopleOutreachEndpoint(
  handleAuthenticatedRpc: AuthenticatedRpc,
  dependencies: Dependencies,
) {
  const handler = createPeopleOutreachHandler(dependencies);
  // Auth remains in handleRpc. Only its two serial rate RPCs are replaced by
  // the fixed batch above; other endpoints keep their existing default checks.
  return (request: Request) => handleAuthenticatedRpc(request, handler, { rateLimit: false });
}
