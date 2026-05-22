import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DEFAULT_JSON_BODY_BYTES = 64 * 1024;
const FUNCTION_BODY_LIMITS: Record<string, number> = {
  'analytics-ingest': 128 * 1024,
  'get-app-snapshot': 4 * 1024,
  'process-graph-cycle-jobs': 16 * 1024,
};
const CORS_HEADERS = {
  'access-control-allow-headers':
    'authorization, x-client-info, apikey, content-type, x-request-id, x-idempotency-key',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-origin': '*',
  'access-control-max-age': '86400',
} as const;
const READ_FUNCTIONS = new Set(['get-app-snapshot', 'get-friendship-invite-preview']);
const ANALYTICS_FUNCTIONS = new Set([
  'analytics-ingest',
  'record-product-event',
  'start-app-session',
]);
const INVITE_FUNCTIONS = new Set([
  'activate-account-from-invite',
  'cancel-account-invite',
  'cancel-friendship-invite',
  'claim-external-friendship-invite',
  'create-account-invite',
  'create-external-friendship-invite',
  'create-internal-friendship-invite',
  'create-people-outreach',
  'resolve-people-targets',
  'respond-internal-friendship-invite',
  'review-account-invite',
  'review-external-friendship-invite',
]);

interface SafeError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

interface RateLimitContext {
  readonly actorUserId: string | null;
  readonly body: Record<string, unknown>;
  readonly clientFingerprintHash: string;
  readonly functionName: string;
  readonly request: Request;
}

export interface RpcRateLimitOptions {
  readonly actorRequired?: boolean;
  readonly limit: number;
  readonly scope:
    | string
    | ((
        context: RateLimitContext,
      ) => string | null | undefined | Promise<string | null | undefined>);
  readonly windowSeconds: number;
}

export interface RpcHandlerOptions {
  readonly maxBodyBytes?: number;
  readonly rateLimit?: RpcRateLimitOptions | readonly RpcRateLimitOptions[] | false;
}

function createRequestId(request: Request): string {
  const forwardedRequestId = request.headers.get('x-request-id')?.trim();
  return forwardedRequestId && forwardedRequestId.length <= 128
    ? forwardedRequestId
    : crypto.randomUUID();
}

function normalizeError(error: unknown): SafeError {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const normalized = message.trim().toLocaleLowerCase('en-US');

  if (
    normalized.includes('missing authorization header') ||
    normalized.includes('unauthorized') ||
    normalized.includes('invalid jwt') ||
    normalized.includes('jwt expired') ||
    normalized.includes('jwt malformed') ||
    normalized.includes('bad jwt')
  ) {
    return {
      status: 401,
      code: 'auth_required',
      message: 'Autenticación requerida.',
    };
  }

  if (normalized.includes('payload too large')) {
    return {
      status: 413,
      code: 'payload_too_large',
      message: 'La solicitud es demasiado grande.',
    };
  }

  if (normalized.includes('rate_limited')) {
    return {
      status: 429,
      code: 'rate_limited',
      message: 'Intenta de nuevo más tarde.',
    };
  }

  if (normalized.includes('actor_mismatch')) {
    return {
      status: 403,
      code: 'forbidden',
      message: 'No tienes permisos para realizar esta acción.',
    };
  }

  if (normalized.includes('permission denied') || normalized.includes('not allowed')) {
    return {
      status: 403,
      code: 'forbidden',
      message: 'No tienes permisos para realizar esta acción.',
    };
  }

  if (normalized.startsWith('invalid ')) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'Solicitud inválida.',
    };
  }

  if (normalized.includes('identity_incomplete')) {
    return {
      status: 400,
      code: 'identity_incomplete',
      message: 'Completa tu nombre, celular y confirma tu correo antes de enviar solicitudes.',
    };
  }

  if (normalized.includes('actor_account_not_active')) {
    return {
      status: 403,
      code: 'account_not_active',
      message: 'Tu cuenta aún no está activa para enviar invitaciones.',
    };
  }

  if (normalized.includes('activation_device_not_trusted')) {
    return {
      status: 403,
      code: 'device_not_trusted',
      message: 'Este dispositivo aún no es confiable. Valídalo primero desde seguridad.',
    };
  }

  if (normalized.includes('cannot_invite_self')) {
    return {
      status: 400,
      code: 'cannot_invite_self',
      message: 'No puedes enviarte una invitación a ti mismo.',
    };
  }

  if (normalized.includes('relationship_already_exists')) {
    return {
      status: 409,
      code: 'relationship_already_exists',
      message: 'Ya tienes a esta persona en tus contactos.',
    };
  }

  if (
    normalized.includes('contact_phone_required') ||
    normalized.includes('contact_reference_required')
  ) {
    return {
      status: 400,
      code: 'contact_phone_required',
      message: 'El contacto necesita un número válido para enviar la invitación.',
    };
  }

  if (
    normalized.includes('external_channel_required') ||
    normalized.includes('account_invite_channel_required')
  ) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'El tipo de invitación no es válido.',
    };
  }

  if (normalized.includes('actor_profile_not_found')) {
    return {
      status: 400,
      code: 'profile_not_found',
      message: 'No encontramos tu perfil. Cierra sesión y vuelve a entrar.',
    };
  }

  if (
    normalized.includes('activation_profile_incomplete') ||
    normalized.includes('activation_phone_required') ||
    normalized.includes('activation_avatar_required')
  ) {
    return {
      status: 400,
      code: 'activation_profile_incomplete',
      message: 'Completa tu perfil antes de activar esta invitación.',
    };
  }

  if (
    normalized.includes('account_invite_already_used') ||
    normalized.includes('account_invite_delivery_not_available') ||
    normalized.includes('account_invite_not_open')
  ) {
    return {
      status: 409,
      code: 'invite_already_used',
      message: 'Esta invitación ya fue usada o ya no está disponible.',
    };
  }

  if (normalized.includes('account_invite_delivery_expired')) {
    return {
      status: 410,
      code: 'invite_expired',
      message: 'Esta invitación ya venció.',
    };
  }

  return {
    status: 400,
    code: 'request_failed',
    message: 'No se pudo completar la solicitud.',
  };
}

function normalizePublicError(error: unknown): SafeError {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const normalized = message.trim().toLocaleLowerCase('en-US');

  if (normalized.includes('payload too large')) {
    return {
      status: 413,
      code: 'payload_too_large',
      message: 'La solicitud es demasiado grande.',
    };
  }

  if (normalized.includes('rate_limited')) {
    return {
      status: 429,
      code: 'rate_limited',
      message: 'Intenta de nuevo más tarde.',
    };
  }

  if (
    normalized.includes('account_invite_already_used') ||
    normalized.includes('account_invite_delivery_not_available') ||
    normalized.includes('account_invite_not_open')
  ) {
    return {
      status: 409,
      code: 'invite_already_used',
      message: 'Esta invitación ya fue usada o ya no está disponible.',
    };
  }

  if (normalized.includes('account_invite_delivery_expired')) {
    return {
      status: 410,
      code: 'invite_expired',
      message: 'Esta invitación ya venció.',
    };
  }

  if (normalized.startsWith('invalid ')) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'Solicitud inválida.',
    };
  }

  return {
    status: 400,
    code: 'invite_preview_unavailable',
    message: 'No pudimos abrir esta invitación.',
  };
}

export function jsonResponse(status: number, body: unknown, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  });
}

function preflightResponse(requestId?: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      ...(requestId ? { 'x-request-id': requestId } : {}),
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

function getFunctionName(request: Request): string {
  try {
    const pathname = new URL(request.url).pathname;
    const functionName = pathname.split('/').filter(Boolean).at(-1)?.trim();

    return functionName || 'edge-rpc';
  } catch {
    return 'edge-rpc';
  }
}

function getJsonBodyLimit(functionName: string, override?: number): number {
  return override ?? FUNCTION_BODY_LIMITS[functionName] ?? DEFAULT_JSON_BODY_BYTES;
}

function isJsonContentType(value: string): boolean {
  const normalized = value.split(';')[0]?.trim().toLocaleLowerCase('en-US') ?? '';
  return normalized === 'application/json' || normalized.endsWith('+json');
}

function parseContentLength(request: Request): number | null {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) {
    return null;
  }

  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function readJsonBody(
  request: Request,
  maxBodyBytes = DEFAULT_JSON_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!isJsonContentType(contentType)) {
    throw new Error('Invalid content type');
  }

  const declaredLength = parseContentLength(request);
  if (declaredLength !== null && declaredLength > maxBodyBytes) {
    throw new Error('Payload too large');
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
    throw new Error('Payload too large');
  }

  let parsed: unknown;
  try {
    parsed = text.trim().length > 0 ? JSON.parse(text) : {};
  } catch {
    throw new Error('Invalid JSON body');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid JSON body');
  }

  return parsed as Record<string, unknown>;
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

export async function getOptionalActorUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return null;
  }

  try {
    return await getActorUserId(request);
  } catch {
    return null;
  }
}

export function createServiceRoleClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export async function createClientFingerprintHash(request: Request): Promise<string> {
  const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
  const ipHint =
    forwardedFor.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown-ip';
  const userAgent = request.headers.get('user-agent')?.trim() || 'unknown-agent';
  const data = new TextEncoder().encode(`${ipHint}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createSha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeRateLimitOptions(
  functionName: string,
  options?: RpcHandlerOptions,
): readonly RpcRateLimitOptions[] {
  if (options?.rateLimit === false) {
    return [];
  }

  if (options?.rateLimit) {
    return Array.isArray(options.rateLimit) ? options.rateLimit : [options.rateLimit];
  }

  if (READ_FUNCTIONS.has(functionName) || ANALYTICS_FUNCTIONS.has(functionName)) {
    return [{ scope: functionName, limit: 120, windowSeconds: 60 }];
  }

  if (functionName === 'report-client-error') {
    return [{ scope: functionName, limit: 20, windowSeconds: 60 }];
  }

  if (functionName === 'request-account-deletion') {
    return [{ scope: functionName, limit: 3, windowSeconds: 60 * 60 }];
  }

  if (INVITE_FUNCTIONS.has(functionName)) {
    return [
      { scope: functionName, limit: 10, windowSeconds: 60 },
      { scope: `${functionName}:hour`, limit: 100, windowSeconds: 60 * 60 },
    ];
  }

  return [{ scope: functionName, limit: 30, windowSeconds: 60 }];
}

async function applyRateLimits(
  request: Request,
  body: Record<string, unknown>,
  actorUserId: string | null,
  functionName: string,
  options?: RpcHandlerOptions,
): Promise<void> {
  const rateLimits = normalizeRateLimitOptions(functionName, options);
  if (rateLimits.length === 0) {
    return;
  }

  const clientFingerprintHash = await createClientFingerprintHash(request);
  const context: RateLimitContext = {
    actorUserId,
    body,
    clientFingerprintHash,
    functionName,
    request,
  };
  const client = createServiceRoleClient();

  for (const rateLimit of rateLimits) {
    if (rateLimit.actorRequired !== false && !actorUserId) {
      throw new Error('Missing Authorization header');
    }

    const resolvedScope =
      typeof rateLimit.scope === 'function' ? await rateLimit.scope(context) : rateLimit.scope;
    const scope = resolvedScope?.trim();
    if (!scope) {
      continue;
    }

    const { error } = await client.rpc('check_edge_rate_limit', {
      p_actor_user_id: rateLimit.actorRequired === false ? null : actorUserId,
      p_client_fingerprint_hash: rateLimit.actorRequired === false ? clientFingerprintHash : null,
      p_limit: rateLimit.limit,
      p_scope: scope,
      p_window_seconds: rateLimit.windowSeconds,
    });

    if (error) {
      throw error;
    }
  }
}

export async function handleRpc(
  request: Request,
  handler: (body: Record<string, unknown>, actorUserId: string) => Promise<unknown>,
  options?: RpcHandlerOptions,
): Promise<Response> {
  const requestId = createRequestId(request);
  const functionName = getFunctionName(request);

  try {
    if (request.method === 'OPTIONS') {
      return preflightResponse(requestId);
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        405,
        { error: 'Method not allowed', code: 'method_not_allowed', requestId },
        requestId,
      );
    }

    const [body, actorUserId] = await Promise.all([
      readJsonBody(request, getJsonBodyLimit(functionName, options?.maxBodyBytes)),
      getActorUserId(request),
    ]);
    await applyRateLimits(request, body, actorUserId, functionName, options);
    const response = await handler(body, actorUserId);
    return jsonResponse(200, response, requestId);
  } catch (error) {
    const safeError = normalizeError(error);
    console.error('edge_rpc_error', {
      requestId,
      code: safeError.code,
      detail: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      safeError.status,
      { error: safeError.message, code: safeError.code, requestId },
      requestId,
    );
  }
}

export async function handlePublicRpc(
  request: Request,
  handler: (body: Record<string, unknown>) => Promise<unknown>,
  options?: RpcHandlerOptions,
): Promise<Response> {
  const requestId = createRequestId(request);
  const functionName = getFunctionName(request);

  try {
    if (request.method === 'OPTIONS') {
      return preflightResponse(requestId);
    }

    if (request.method !== 'POST') {
      return jsonResponse(
        405,
        { error: 'Method not allowed', code: 'method_not_allowed', requestId },
        requestId,
      );
    }

    const body = await readJsonBody(request, getJsonBodyLimit(functionName, options?.maxBodyBytes));
    await applyRateLimits(request, body, null, functionName, options);
    const response = await handler(body);
    return jsonResponse(200, response, requestId);
  } catch (error) {
    const safeError = normalizePublicError(error);
    console.error('edge_public_rpc_error', {
      requestId,
      code: safeError.code,
      detail: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      safeError.status,
      { error: safeError.message, code: safeError.code, requestId },
      requestId,
    );
  }
}
