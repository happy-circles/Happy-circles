import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const INTERNAL_FALLBACK_HASH = '/#beta';

function readHttpUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function fallbackUrl(request: NextRequest): URL {
  const waitlistUrl = readHttpUrl(process.env.NEXT_PUBLIC_WAITLIST_URL);
  if (waitlistUrl) {
    return new URL(waitlistUrl);
  }

  return new URL(INTERNAL_FALLBACK_HASH, request.nextUrl.origin);
}

export function redirectToConfiguredStore(
  request: NextRequest,
  envKey: 'NEXT_PUBLIC_APP_STORE_URL' | 'NEXT_PUBLIC_PLAY_STORE_URL',
): NextResponse {
  const target = readHttpUrl(process.env[envKey]);
  return NextResponse.redirect(target ? new URL(target) : fallbackUrl(request), 307);
}

export function redirectToBestDownload(request: NextRequest): NextResponse {
  const userAgent = request.headers.get('user-agent') ?? '';
  const isAndroid = /Android/i.test(userAgent);
  const isApple = /iPhone|iPad|iPod|Macintosh/i.test(userAgent);

  if (isAndroid) {
    return NextResponse.redirect(new URL('/android', request.nextUrl.origin), 307);
  }

  if (isApple) {
    return NextResponse.redirect(new URL('/ios', request.nextUrl.origin), 307);
  }

  return NextResponse.redirect(fallbackUrl(request), 307);
}
