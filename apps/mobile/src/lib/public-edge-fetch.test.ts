import { describe, expect, it, vi } from 'vitest';

import { createPublicEdgeFetch } from './public-edge-fetch';

describe('createPublicEdgeFetch', () => {
  it('removes Authorization at the network boundary and preserves the project API key', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const publicFetch = createPublicEdgeFetch(
      fetchImplementation as unknown as typeof globalThis.fetch,
    );

    await publicFetch('https://example.supabase.co/functions/v1/public-preview', {
      headers: {
        apikey: 'publishable-key',
        Authorization: 'Bearer publishable-key',
        'x-client-info': 'happy-circles-mobile',
      },
    });

    const requestInit = fetchImplementation.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(requestInit?.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.get('apikey')).toBe('publishable-key');
    expect(headers.get('x-client-info')).toBe('happy-circles-mobile');
  });
});
