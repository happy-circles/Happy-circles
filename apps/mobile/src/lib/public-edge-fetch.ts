type FetchImplementation = typeof globalThis.fetch;

/**
 * Supabase's authenticated fetch wrapper adds a bearer token when the header is
 * absent. Public Edge Functions need the project API key, but not that bearer
 * token, so remove it at the final fetch boundary while preserving `apikey`.
 */
export function createPublicEdgeFetch(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): FetchImplementation {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete('Authorization');

    return fetchImplementation(input, {
      ...init,
      headers,
    });
  };
}
