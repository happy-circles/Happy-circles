import { queryClient } from '../query-client';
import { supabase } from '../supabase';
import { createSupportId, isJwtAuthError, readFunctionErrorDetails, reportAndCreateSupportError } from '../support-errors';
import { APP_SNAPSHOT_QUERY_KEY, LIVE_SNAPSHOT_TIMEOUT_MS } from './constants';

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
      new Error('La sincronizacion tardo demasiado. Revisa tu conexion e intenta de nuevo.'),
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
    throw new Error('Supabase no esta configurado en esta app.');
  }

  return supabase;
}

export async function invokeSupabaseFunction<TBody extends Record<string, unknown>, TResult>(
  name: string,
  body: TBody,
): Promise<TResult> {
  const client = assertSupabaseClient();
  const supportId = createSupportId();
  const invoke = async () =>
    client.functions.invoke<TResult>(name, {
      body,
      headers: {
        'x-client-info': 'happy-circles-mobile',
        'x-request-id': supportId,
      },
    });
  let result = await invoke();

  if (result.error) {
    const details = await readFunctionErrorDetails(result.error);
    if (isJwtAuthError(details)) {
      const { data: refreshData, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        await client.auth.signOut();
        throw new Error('Tu sesion ya no es valida. Cierra sesion y vuelve a entrar.');
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
  await queryClient.invalidateQueries({
    queryKey: [APP_SNAPSHOT_QUERY_KEY],
  });
}
