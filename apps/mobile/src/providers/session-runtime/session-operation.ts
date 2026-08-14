export const SESSION_BOOTSTRAP_TASK_TIMEOUT_MS = 8_000;
export const SESSION_AUTH_OPERATION_TIMEOUT_MS = 25_000;
export const SESSION_ACCOUNT_LOAD_TIMEOUT_MS = 25_000;
export const SESSION_SOCIAL_AUTH_TIMEOUT_MS = 120_000;

export class SessionOperationTimeoutError extends Error {
  public readonly code = 'session_operation_timeout';
  public readonly operation: string;

  public constructor(operation: string) {
    super(`Session operation timed out: ${operation}`);
    this.name = 'SessionOperationTimeoutError';
    this.operation = operation;
  }
}

export async function withSessionOperationTimeout<T>(
  operation: string,
  source: PromiseLike<T>,
  timeoutMs = SESSION_AUTH_OPERATION_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new SessionOperationTimeoutError(operation));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(source), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function settledValueOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export function sessionOperationErrorMessage(
  error: unknown,
  fallback = 'No pudimos sincronizar tu sesión. Inténtalo de nuevo.',
): string {
  if (error instanceof SessionOperationTimeoutError) {
    return 'La conexión está tardando demasiado. Inténtalo de nuevo.';
  }

  return fallback;
}
