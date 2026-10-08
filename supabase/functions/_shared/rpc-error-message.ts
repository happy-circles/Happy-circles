// PostgREST returns structured errors, not Error instances. Only use their
// message to select a fixed, public error response; never return raw SQL detail.
export function readRpcErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unexpected error';
}
