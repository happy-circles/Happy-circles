import { NextResponse } from 'next/server';

import { appLinkPaths, readAppleAppId } from '@/lib/native-association';

export const dynamic = 'force-dynamic';

export function GET() {
  const appId = readAppleAppId();

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: appId
          ? [
              {
                appID: appId,
                paths: appLinkPaths(),
              },
            ]
          : [],
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/json',
      },
    },
  );
}
