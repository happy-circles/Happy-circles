import type { NextRequest } from 'next/server';

import { redirectToConfiguredStore } from '@/lib/store-redirects';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return redirectToConfiguredStore(request, 'NEXT_PUBLIC_PLAY_STORE_URL');
}
