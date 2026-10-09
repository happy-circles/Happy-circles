import { queryClient } from '../query-client';
import { explicitTokenEdgeSupabase, publicEdgeSupabase, supabase } from '../supabase';
import {
  createSupportId,
  isJwtAuthError,
  readFunctionErrorDetails,
  reportAndCreateSupportError,
} from '../support-errors';
import {
  APP_SNAPSHOT_QUERY_KEY,
  EDGE_FUNCTION_TIMEOUT_MS,
  LIVE_SNAPSHOT_TIMEOUT_MS,
  PEOPLE_OVERVIEW_QUERY_KEY,
} from './constants';

export function createSnapshotAbortSignal(parentSignal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  let rejectTimeout: (error: Error) => void = () => undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
    rejectTimeout(
      new Error('La sincronización tardó demasiado. Revisa tu conexión e intenta de nuevo.'),
    );
  }, LIVE_SNAPSHOT_TIMEOUT_MS);

  const abortFromParent = () => {
    controller.abort();
  };

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  return {
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
    signal: controller.signal,
    timeoutPromise,
    wasTimedOut: () => timedOut,
  };
}

export function assertSupabaseClient() {
  if (!supabase) {
    throw new Error('El servicio de datos no está disponible en este momento.');
  }

  return supabase;
}

export interface InvokeSupabaseFunctionOptions {
  readonly authorization?: 'session' | 'omit';
  readonly expectedUserId?: string;
}

function assertPublicEdgeSupabaseClient() {
  if (!publicEdgeSupabase) {
    throw new Error('El servicio de datos no está disponible en este momento.');
  }

  return publicEdgeSupabase;
}

function assertExplicitTokenEdgeSupabaseClient() {
  if (!explicitTokenEdgeSupabase) {
    throw new Error('El servicio de datos no está disponible en este momento.');
  }

  return explicitTokenEdgeSupabase;
}

function isInvocationTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as { readonly context?: unknown; readonly name?: unknown };
  const context =
    record.context && typeof record.context === 'object'
      ? (record.context as { readonly name?: unknown })
      : null;

  return record.name === 'AbortError' || context?.name === 'AbortError';
}

export async function invokeSupabaseFunction<TBody extends Record<string, unknown>, TResult>(
  name: string,
  body: TBody,
  options: InvokeSupabaseFunctionOptions = {},
): Promise<TResult> {
  const shouldOmitAuthorization = options.authorization === 'omit';
  if (shouldOmitAuthorization && options.expectedUserId) {
    throw new Error('Una acción de cuenta requiere una sesión autenticada.');
  }
  const client = shouldOmitAuthorization
    ? assertPublicEdgeSupabaseClient()
    : assertSupabaseClient();
  const useExplicitTokenTransport =
    name === 'create-people-outreach' && Boolean(options.expectedUserId);
  const supportId = createSupportId();
  const invoke = async () => {
    let accessToken: string | undefined;
    if (options.expectedUserId) {
      const { data } = await client.auth.getSession();
      if (data.session?.user.id !== options.expectedUserId)
        throw new Error('La sesión cambió. Vuelve a intentar la acción.');
      accessToken = data.session.access_token;
    }
    if (useExplicitTokenTransport && !accessToken?.trim()) {
      throw new Error('Tu sesión ya no es válida. Cierra sesión y vuelve a entrar.');
    }
    // Keep session validation/refresh on the main client. The functions-only
    // transport avoids the SDK's additional getSession before sending this JWT.
    const transport = useExplicitTokenTransport ? assertExplicitTokenEdgeSupabaseClient() : client;
    const response = await transport.functions.invoke<TResult>(name, {
      body,
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': supportId,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    });
    if (options.expectedUserId) {
      const { data } = await client.auth.getSession();
      if (data.session?.user.id !== options.expectedUserId)
        throw new Error('La sesión cambió. Vuelve a consultar el estado.');
    }
    return response;
  };
  let result = await invoke();

  if (result.error) {
    if (isInvocationTimeoutError(result.error)) {
      throw reportAndCreateSupportError({
        error: new Error('La solicitud tardó demasiado. Revisa tu conexión e intenta de nuevo.'),
        errorCode: 'request_timeout',
        functionName: name,
        kind: 'edge_function',
        metadata: { status: 'timeout' },
        requestId: supportId,
        supportId,
      });
    }

    const details = await readFunctionErrorDetails(result.error);
    if (isJwtAuthError(details) && !shouldOmitAuthorization) {
      if (options.expectedUserId) {
        const { data } = await client.auth.getSession();
        if (data.session?.user.id !== options.expectedUserId) {
          throw new Error('La sesión cambió. Vuelve a consultar el estado.');
        }
      }
      const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        // An account switch can race token renewal. Never sign out the new
        // account because a request that belonged to the previous one failed.
        if (!options.expectedUserId) await client.auth.signOut();
        throw new Error('Tu sesión ya no es válida. Cierra sesión y vuelve a entrar.');
      }

      result = await invoke();
      if (result.error) {
        const retryDetails = await readFunctionErrorDetails(result.error);
        throw reportAndCreateSupportError({
          error: new Error(retryDetails.message),
          errorCode: retryDetails.code,
          functionName: name,
          kind: 'edge_function',
          metadata: { status: retryDetails.status ?? null },
          requestId: retryDetails.requestId ?? supportId,
          status: retryDetails.status,
          supportId,
        });
      }

      if (result.data === null) {
        throw reportAndCreateSupportError({
          error: new Error(`La funcion ${name} respondio sin payload.`),
          errorCode: 'empty_payload',
          functionName: name,
          kind: 'edge_function',
          metadata: { status: 'empty_payload' },
          requestId: supportId,
          supportId,
        });
      }

      return result.data;
    }

    throw reportAndCreateSupportError({
      error: new Error(details.message),
      errorCode: details.code,
      functionName: name,
      kind: 'edge_function',
      metadata: { status: details.status ?? null },
      requestId: details.requestId ?? supportId,
      status: details.status,
      supportId,
    });
  }

  if (result.data === null) {
    throw reportAndCreateSupportError({
      error: new Error(`La funcion ${name} respondio sin payload.`),
      errorCode: 'empty_payload',
      functionName: name,
      kind: 'edge_function',
      metadata: { status: 'empty_payload' },
      requestId: supportId,
      supportId,
    });
  }

  return result.data;
}

export async function invalidateAppSnapshot() {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: [APP_SNAPSHOT_QUERY_KEY],
    }),
    queryClient.invalidateQueries({
      queryKey: [PEOPLE_OVERVIEW_QUERY_KEY],
    }),
  ]);
}
