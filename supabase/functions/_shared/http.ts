import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface SafeError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
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
      message: 'Autenticacion requerida.',
    };
  }

  if (normalized.includes('actor_mismatch')) {
    return {
      status: 403,
      code: 'forbidden',
      message: 'No tienes permisos para realizar esta accion.',
    };
  }

  if (normalized.includes('permission denied') || normalized.includes('not allowed')) {
    return {
      status: 403,
      code: 'forbidden',
      message: 'No tienes permisos para realizar esta accion.',
    };
  }

  if (normalized.startsWith('invalid ')) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'Solicitud invalida.',
    };
  }

  if (normalized.includes('identity_incomplete')) {
    return {
      status: 400,
      code: 'identity_incomplete',
      message:
        'Completa tu perfil, agrega foto, celular y confirma tu correo antes de enviar solicitudes.',
    };
  }

  if (normalized.includes('actor_account_not_active')) {
    return {
      status: 403,
      code: 'account_not_active',
      message: 'Tu cuenta aun no esta activa para enviar invitaciones.',
    };
  }

  if (normalized.includes('cannot_invite_self')) {
    return {
      status: 400,
      code: 'cannot_invite_self',
      message: 'No puedes enviarte una invitacion a ti mismo.',
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
      message: 'El contacto necesita un numero valido para enviar la invitacion.',
    };
  }

  if (
    normalized.includes('external_channel_required') ||
    normalized.includes('account_invite_channel_required')
  ) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'El tipo de invitacion no es valido.',
    };
  }

  if (normalized.includes('actor_profile_not_found')) {
    return {
      status: 400,
      code: 'profile_not_found',
      message: 'No encontramos tu perfil. Cierra sesion y vuelve a entrar.',
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
      message: 'Completa tu perfil antes de activar esta invitacion.',
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
      message: 'Esta invitacion ya fue usada o ya no esta disponible.',
    };
  }

  if (normalized.includes('account_invite_delivery_expired')) {
    return {
      status: 410,
      code: 'invite_expired',
      message: 'Esta invitacion ya vencio.',
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

  if (normalized.includes('rate_limited')) {
    return {
      status: 429,
      code: 'rate_limited',
      message: 'Intenta de nuevo mas tarde.',
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
      message: 'Esta invitacion ya fue usada o ya no esta disponible.',
    };
  }

  if (normalized.includes('account_invite_delivery_expired')) {
    return {
      status: 410,
      code: 'invite_expired',
      message: 'Esta invitacion ya vencio.',
    };
  }

  if (normalized.startsWith('invalid ')) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'Solicitud invalida.',
    };
  }

  return {
    status: 400,
    code: 'invite_preview_unavailable',
    message: 'No pudimos abrir esta invitacion.',
  };
}

export function jsonResponse(status: number, body: unknown, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
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

export async function handleRpc(
  request: Request,
  handler: (body: Record<string, unknown>, actorUserId: string) => Promise<unknown>,
): Promise<Response> {
  const requestId = createRequestId(request);

  try {
    if (request.method !== 'POST') {
      return jsonResponse(
        405,
        { error: 'Method not allowed', code: 'method_not_allowed', requestId },
        requestId,
      );
    }

    const [body, actorUserId] = await Promise.all([readJsonBody(request), getActorUserId(request)]);
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
): Promise<Response> {
  const requestId = createRequestId(request);

  try {
    if (request.method !== 'POST') {
      return jsonResponse(
        405,
        { error: 'Method not allowed', code: 'method_not_allowed', requestId },
        requestId,
      );
    }

    const body = await readJsonBody(request);
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
