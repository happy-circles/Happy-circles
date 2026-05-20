'use client';

import type { MouseEvent } from 'react';
import { useMemo } from 'react';

import { buildNativeAppUrl } from '@/lib/app-links';

const OPEN_APP_PATH = '/join?mode=sign-in';
const FALLBACK_DELAY_MS = 1800;

export function LandingOpenAppButton() {
  const nativeHref = useMemo(() => buildNativeAppUrl(OPEN_APP_PATH), []);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    let didLeavePage = false;
    let fallbackTimer: number | undefined;

    const cleanup = () => {
      didLeavePage = true;
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      window.removeEventListener('pagehide', cleanup);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cleanup();
      }
    };

    window.addEventListener('pagehide', cleanup);
    window.addEventListener('blur', cleanup);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    fallbackTimer = window.setTimeout(() => {
      if (!didLeavePage && document.visibilityState === 'visible') {
        window.location.assign('/download');
      }
    }, FALLBACK_DELAY_MS);

    window.location.assign(nativeHref);
  }

  return (
    <a className="primaryButton" href={nativeHref} onClick={handleClick}>
      Abrir Happy Circles
    </a>
  );
}
