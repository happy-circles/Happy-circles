export const APP_SCHEME = process.env.NEXT_PUBLIC_APP_SCHEME ?? 'happycircles';

export const APP_LINK_PATHS = [
  '/invite/*',
  '/join*',
  '/reset-password*',
  '/setup-account*',
] as const;

export type AppLinkGatewayKind =
  | 'account-invite'
  | 'friendship-invite'
  | 'join'
  | 'reset-password'
  | 'setup-account';

export function buildNativeAppUrl(pathname: string, search = '', hash = ''): string {
  const normalizedPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return `${APP_SCHEME}://${normalizedPath}${search}${hash}`;
}
