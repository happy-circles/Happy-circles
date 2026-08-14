import { queryClient } from '../query-client';
import { publicEdgeSupabase, supabase } from '../supabase';
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
}

function assertPublicEdgeSupabaseClient() {
  if (!publicEdgeSupabase) {
    throw new Error('El servicio de datos no está disponible en este momento.');
  }

  return publicEdgeSupabase;
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
  const client = shouldOmitAuthorization
    ? assertPublicEdgeSupabaseClient()
    : assertSupabaseClient();
  const supportId = createSupportId();
  const invoke = async () =>
    client.functions.invoke<TResult>(name, {
      body,
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': supportId,
      },
      timeout: EDGE_FUNCTION_TIMEOUT_MS,
    });
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
      const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await client.auth.signOut();
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
