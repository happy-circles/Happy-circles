import { APP_LINK_PATHS } from './app-links';

export const IOS_BUNDLE_IDENTIFIER =
  process.env.IOS_BUNDLE_IDENTIFIER ??
  process.env.NEXT_PUBLIC_IOS_BUNDLE_IDENTIFIER ??
  'com.happycircles.app';

export const ANDROID_PACKAGE_NAME =
  process.env.ANDROID_PACKAGE_NAME ??
  process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME ??
  'com.happycircles.app';

function readFirstEnvValue(...keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function readAppleAppId(): string | null {
  const explicitAppId = readFirstEnvValue('APPLE_APP_ID');
  if (explicitAppId) {
    return explicitAppId;
  }

  const teamId = readFirstEnvValue('APPLE_TEAM_ID');
  return teamId ? `${teamId}.${IOS_BUNDLE_IDENTIFIER}` : null;
}

export function readAndroidSha256Fingerprints(): string[] {
  const rawValue = readFirstEnvValue(
    'ANDROID_SHA256_CERT_FINGERPRINTS',
    'ANDROID_SHA256_CERT_FINGERPRINT',
  );

  return rawValue
    ? rawValue
        .split(',')
        .map((fingerprint) => fingerprint.trim())
        .filter(Boolean)
    : [];
}

export function appLinkPaths(): string[] {
  return [...APP_LINK_PATHS];
}
