import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPeopleOutreachEndpoint,
  createPeopleOutreachHandler,
} from '../../supabase/functions/create-people-outreach/handler';

const actor = '00000000-0000-4000-8000-000000003001';
const body = {
  idempotencyKey: 'outreach-rate-test',
  channel: 'remote',
  sourceContext: ' home_add_contact_list ',
  intendedRecipientAlias: ' Local fixture ',
  intendedRecipientPhoneE164: ' +573009993002 ',
  intendedRecipientPhoneLabel: ' mobile ',
};
const response = { kind: 'friendship', status: 'active_user', inviteId: 'fixture-invite' };
function fixture() {
  const rpc = vi
    .fn<
      (
        name: string,
        parameters: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    >()
    .mockImplementation(async (name) => ({
      data: name === 'check_people_outreach_rate_limits' ? { allowed: true } : response,
      error: null as unknown,
    }));
  const dependencies = {
    createClient: vi.fn(() => ({ rpc })),
    requireString: (value: unknown, name: string) => {
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${name}`);
      return value.trim();
    },
    triggerPushWorker: vi.fn(),
    onTiming: vi.fn<NonNullable<Parameters<typeof createPeopleOutreachHandler>[0]['onTiming']>>(),
  };
  return { rpc, dependencies, handler: createPeopleOutreachHandler(dependencies) };
}
afterEach(() => vi.useRealTimers());

describe('outreach rate batch endpoint', () => {
  it('commits both quotas in one RPC before unchanged business and propagates the verified actor', async () => {
    const { rpc, dependencies, handler } = fixture();
    await expect(handler({ ...body, actorUserId: 'untrusted-actor' }, actor)).resolves.toBe(
      response,
    );
    expect(rpc.mock.calls).toEqual([
      ['check_people_outreach_rate_limits', { p_actor_user_id: actor }],
      [
        'create_people_outreach',
        {
          p_actor_user_id: actor,
          p_idempotency_key: body.idempotencyKey,
          p_channel: 'remote',
          p_source_context: 'home_add_contact_list',
          p_intended_recipient_alias: 'Local fixture',
          p_intended_recipient_phone_e164: '+573009993002',
          p_intended_recipient_phone_label: 'mobile',
        },
      ],
    ]);
    expect(dependencies.triggerPushWorker).toHaveBeenCalledExactlyOnceWith(10);
  });

  it('fails closed on quota denial before parsing fields or creating invitations', async () => {
    const { rpc, dependencies, handler } = fixture();
    rpc.mockResolvedValueOnce({ data: { allowed: false }, error: null });
    await expect(handler({}, actor)).rejects.toThrow('edge_rate_limited');
    expect(rpc).toHaveBeenCalledOnce();
    expect(dependencies.triggerPushWorker).not.toHaveBeenCalled();
    expect(dependencies.onTiming).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, businessMs: 0 }),
    );
  });

  it.each([null, undefined, [], true, {}, { allowed: 'true' }, { allowed: 1 }, { allowed: null }])(
    'rejects malformed quota result %j without attempting business',
    async (data) => {
      const { rpc, handler } = fixture();
      rpc.mockResolvedValueOnce({ data: data as unknown as typeof response, error: null });
      await expect(handler(body, actor)).rejects.toThrow('Invalid outreach rate limit response');
      expect(rpc).toHaveBeenCalledOnce();
    },
  );

  it('preserves quota RPC errors and never invokes business after a database failure', async () => {
    const { rpc, handler } = fixture();
    const error = { code: 'P0001', message: 'rate database unavailable' };
    rpc.mockResolvedValueOnce({ data: null as unknown as typeof response, error });
    await expect(handler(body, actor)).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('counts malformed commands and business failures after successful quota consumption', async () => {
    const invalid = fixture();
    await expect(invalid.handler({}, actor)).rejects.toThrow('Invalid idempotencyKey');
    expect(invalid.rpc).toHaveBeenCalledOnce();
    const failed = fixture();
    failed.rpc.mockResolvedValueOnce({ data: { allowed: true }, error: null });
    const error = { code: 'P0001', message: 'idempotency_key_reused' };
    failed.rpc.mockResolvedValueOnce({ data: null as unknown as typeof response, error });
    await expect(failed.handler(body, actor)).rejects.toBe(error);
    expect(failed.rpc).toHaveBeenCalledTimes(2);
    expect(failed.dependencies.triggerPushWorker).not.toHaveBeenCalled();
  });

  it('keeps the authenticated HTTP wrapper and bypasses only its replaced default quotas', async () => {
    const { dependencies, rpc } = fixture();
    const authenticated = vi.fn(
      async (
        request: Request,
        handler: ReturnType<typeof createPeopleOutreachHandler>,
        options: { rateLimit: false },
      ) => {
        expect(options).toEqual({ rateLimit: false });
        if (!request.headers.has('Authorization'))
          return new Response('Unauthorized', { status: 401 });
        const result = await handler((await request.json()) as Record<string, unknown>, actor);
        return Response.json(result);
      },
    );
    const endpoint = createPeopleOutreachEndpoint(authenticated, dependencies);
    expect((await endpoint(new Request('https://example.test', { method: 'POST' }))).status).toBe(
      401,
    );
    expect(dependencies.createClient).not.toHaveBeenCalled();
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { Authorization: 'Bearer local-fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect((await endpoint(request)).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);
    const root = resolve(import.meta.dirname, '../..');
    const index = readFileSync(
      resolve(root, 'supabase/functions/create-people-outreach/index.ts'),
      'utf8',
    );
    expect(index).toContain('createPeopleOutreachEndpoint(handleRpc,');
    const http = readFileSync(resolve(root, 'supabase/functions/_shared/http.ts'), 'utf8');
    expect(http).toContain('getVerifiedAuthContext(request)');
    expect(http).toContain('client.auth.getUser(accessToken)');
    expect(http).toContain('client.auth.getClaims(accessToken)');
  });

  it('logs only handler timings and success, and telemetry failure cannot replace a committed result', async () => {
    const { handler, dependencies } = fixture();
    await handler(body, actor);
    const timing = dependencies.onTiming.mock.calls[0][0];
    expect(Object.keys(timing).sort()).toEqual(['businessMs', 'rateLimitMs', 'success', 'totalMs']);
    expect(timing.success).toBe(true);
    expect(typeof timing.businessMs).toBe('number');
    expect(typeof timing.rateLimitMs).toBe('number');
    expect(typeof timing.totalMs).toBe('number');
    expect(JSON.stringify(timing)).not.toContain(actor);
    expect(JSON.stringify(timing)).not.toContain(body.intendedRecipientPhoneE164.trim());
    dependencies.onTiming.mockImplementation(() => {
      throw new Error('Telemetry offline');
    });
    await expect(handler(body, actor)).resolves.toBe(response);
  });

  it('simulates removing one DB round trip without treating it as device latency', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'performance'] });
    const previousRpc = vi.fn(async () => {
      await new Promise<void>((done) => setTimeout(done, 50));
    });
    const previousStarted = performance.now();
    const previous = (async () => {
      await previousRpc();
      await previousRpc();
      await previousRpc();
      return performance.now() - previousStarted;
    })();
    await vi.advanceTimersByTimeAsync(150);
    expect(await previous).toBe(150);
    const { handler, rpc, dependencies } = fixture();
    rpc.mockImplementation(async (name) => {
      await new Promise<void>((done) => setTimeout(done, 50));
      return {
        data: name === 'check_people_outreach_rate_limits' ? { allowed: true } : response,
        error: null,
      };
    });
    const current = handler(body, actor);
    await vi.advanceTimersByTimeAsync(100);
    await current;
    expect(previousRpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(dependencies.onTiming).toHaveBeenCalledWith({
      rateLimitMs: 50,
      businessMs: 50,
      totalMs: 100,
      success: true,
    });
  });
});
