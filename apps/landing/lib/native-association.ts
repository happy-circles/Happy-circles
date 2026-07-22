import { APP_LINK_PATHS } from './app-links';

export const IOS_BUNDLE_IDENTIFIER =
  process.env.IOS_BUNDLE_IDENTIFIER ??
  process.env.NEXT_PUBLIC_IOS_BUNDLE_IDENTIFIER ??
  'com.happycircles.app';

export const ANDROID_PACKAGE_NAME =
  process.env.ANDROID_PACKAGE_NAME ??
  process.env.NEXT_PUBLIC_ANDROID_PACKAGE_NAME ??
  'com.happycircles.app';

const GOOGLE_PLAY_APP_SIGNING_SHA256_FINGERPRINT =
  '9B:01:55:F0:D7:F0:F3:54:E0:5A:D3:B8:7E:D6:5D:D4:35:AB:80:A6:6A:6D:32:3A:94:04:C4:7B:26:0B:DC:39';

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

  const configuredFingerprints = rawValue
    ? rawValue
        .split(',')
        .map((fingerprint) => fingerprint.trim())
        .filter(Boolean)
    : [];

  return [...new Set([...configuredFingerprints, GOOGLE_PLAY_APP_SIGNING_SHA256_FINGERPRINT])];
}

export function appLinkPaths(): string[] {
  return [...APP_LINK_PATHS];
}
