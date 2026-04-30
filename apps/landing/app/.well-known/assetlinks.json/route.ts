import { NextResponse } from 'next/server';

import { ANDROID_PACKAGE_NAME, readAndroidSha256Fingerprints } from '@/lib/native-association';

export const dynamic = 'force-dynamic';

export function GET() {
  const fingerprints = readAndroidSha256Fingerprints();
  const statements =
    fingerprints.length > 0
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: ANDROID_PACKAGE_NAME,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return NextResponse.json(statements, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/json',
    },
  });
}
