import type { AuthCallbackTokens } from './types';

export function extractAuthCallbackTokens(url: string): AuthCallbackTokens | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
  };
}

export function extractAuthCallbackCode(url: string): string | null {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return null;
  }

  const query = url.slice(queryIndex + 1).split('#')[0];
  const params = new URLSearchParams(query);
  const code = params.get('code');

  return code && code.length > 0 ? code : null;
}

export function extractUrlSearchParams(url: string): URLSearchParams {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const params = new URLSearchParams();

  if (queryIndex !== -1) {
    const queryEnd = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : url.length;
    new URLSearchParams(url.slice(queryIndex + 1, queryEnd)).forEach((value, key) => {
      params.set(key, value);
    });
  }

  if (hashIndex !== -1) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((value, key) => {
      params.set(key, value);
    });
  }

  return params;
}

export function isPasswordRecoveryCallbackUrl(url: string): boolean {
  const params = extractUrlSearchParams(url);

  if (params.get('type') === 'recovery') {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.pathname.startsWith('/reset-password') || parsedUrl.hostname === 'reset-password'
    );
  } catch {
    return url.includes('/reset-password') || url.includes('://reset-password');
  }
}
