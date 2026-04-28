import type { NextRequest } from 'next/server';

import { redirectToBestDownload } from '@/lib/store-redirects';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return redirectToBestDownload(request);
}
