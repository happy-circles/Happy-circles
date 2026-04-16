import { Platform } from 'react-native';

import { appConfig } from './config';

function ensureLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function buildNativeRedirect(path: string): string {
  return `happycircles://${ensureLeadingSlash(path).slice(1)}`;
}

function buildWebRedirect(path: string): string {
  const normalizedPath = ensureLeadingSlash(path);
  const origin = appConfig.appWebOrigin.endsWith('/')
    ? appConfig.appWebOrigin
    : `${appConfig.appWebOrigin}/`;

  return new URL(normalizedPath.slice(1), origin).toString();
}

export function buildEmailAuthRedirect(path: string): string {
  return Platform.OS === 'web' ? buildWebRedirect(path) : buildNativeRedirect(path);
}
