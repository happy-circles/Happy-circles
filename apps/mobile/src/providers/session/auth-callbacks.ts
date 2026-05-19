import type { AuthCallbackTokens } from './types';

const APP_AUTH_CALLBACK_SEGMENTS = new Set(['join', 'reset-password', 'setup-account']);

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

function extractFirstPathSegment(pathname: string): string | null {
  return pathname
    .split('/')
    .map((segment) => segment.trim().toLocaleLowerCase('en-US'))
    .find((segment) => segment.length > 0) ?? null;
}

function extractAppRouteSegment(parsedUrl: URL): string | null {
  if (parsedUrl.protocol.toLocaleLowerCase('en-US') === 'happycircles:') {
    const hostSegment = parsedUrl.hostname.trim().toLocaleLowerCase('en-US');
    return hostSegment || extractFirstPathSegment(parsedUrl.pathname);
  }

  return extractFirstPathSegment(parsedUrl.pathname);
}

function isConfiguredWebOrigin(parsedUrl: URL, appWebOrigin: string): boolean {
  try {
    const parsedOrigin = new URL(appWebOrigin);
    return (
      parsedUrl.protocol.toLocaleLowerCase('en-US') === 'https:' &&
      parsedUrl.host.toLocaleLowerCase('en-US') === parsedOrigin.host.toLocaleLowerCase('en-US')
    );
  } catch {
    return false;
  }
}

export function isAppAuthCallbackUrl(url: string, appWebOrigin: string): boolean {
  if (!extractAuthCallbackCode(url) && !extractAuthCallbackTokens(url)) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol.toLocaleLowerCase('en-US');
    if (protocol !== 'happycircles:' && !isConfiguredWebOrigin(parsedUrl, appWebOrigin)) {
      return false;
    }

    const routeSegment = extractAppRouteSegment(parsedUrl);
    return routeSegment ? APP_AUTH_CALLBACK_SEGMENTS.has(routeSegment) : false;
  } catch {
    return false;
  }
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
