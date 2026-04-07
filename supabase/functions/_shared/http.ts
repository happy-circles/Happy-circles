import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }

  return value.trim();
}

export function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid ${field}`);
  }

  return value as string[];
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  return (await request.json()) as Record<string, unknown>;
}

export async function getActorUserId(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    throw new Error('Missing Authorization header');
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Unauthorized');
  }

  return data.user.id;
}

export function createServiceRoleClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export async function handleRpc(
  request: Request,
  handler: (body: Record<string, unknown>, actorUserId: string) => Promise<unknown>,
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    const [body, actorUserId] = await Promise.all([readJsonBody(request), getActorUserId(request)]);
    const response = await handler(body, actorUserId);
    return jsonResponse(200, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonResponse(400, { error: message });
  }
}
