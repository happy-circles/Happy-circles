'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';

import { buildNativeAppUrl } from '@/lib/app-links';

export function AppOpenButton({
  autoOpen = true,
  className = 'primaryButton',
  fallbackPath,
  label = 'Abrir Happy Circles',
  nativePath,
  preserveCurrentUrlParams = false,
}: Readonly<{
  autoOpen?: boolean;
  className?: string;
  fallbackPath: string;
  label?: string;
  nativePath?: string;
  preserveCurrentUrlParams?: boolean;
}>) {
  const buildHref = useCallback(
    (path: string): string => {
      if (!preserveCurrentUrlParams || typeof window === 'undefined') {
        return buildNativeAppUrl(path);
      }

      const currentUrl = new URL(window.location.href);
      const targetUrl = new URL(path, window.location.origin);

      return buildNativeAppUrl(
        targetUrl.pathname,
        targetUrl.search || currentUrl.search,
        targetUrl.hash || currentUrl.hash,
      );
    },
    [preserveCurrentUrlParams],
  );

  const fallbackHref = useMemo(
    () => buildNativeAppUrl(nativePath ?? fallbackPath),
    [fallbackPath, nativePath],
  );
  const [href, setHref] = useState(fallbackHref);

  const resolveLiveHref = useCallback(() => {
    if (typeof window === 'undefined') {
      return fallbackHref;
    }

    if (nativePath) {
      return buildHref(nativePath);
    }

    return buildNativeAppUrl(window.location.pathname, window.location.search, window.location.hash);
  }, [buildHref, fallbackHref, nativePath]);

  const openApp = useCallback(() => {
    const nextHref = resolveLiveHref();
    setHref(nextHref);
    window.location.assign(nextHref);
  }, [resolveLiveHref]);

  useEffect(() => {
    const nextHref = resolveLiveHref();
    setHref(nextHref);

    if (!autoOpen) {
      return undefined;
    }

    let leftPageAfterFirstAttempt = false;
    const markPageAsLeft = () => {
      leftPageAfterFirstAttempt = true;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        markPageAsLeft();
      }
    };

    window.addEventListener('pagehide', markPageAsLeft, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const frame = window.requestAnimationFrame(() => openApp());
    const retryTimer = window.setTimeout(() => {
      if (!leftPageAfterFirstAttempt && document.visibilityState === 'visible') {
        openApp();
      }
    }, 700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retryTimer);
      window.removeEventListener('pagehide', markPageAsLeft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoOpen, openApp, resolveLiveHref]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      openApp();
    },
    [openApp],
  );

  return (
    <a className={className} href={href} onClick={handleClick}>
      {label}
    </a>
  );
}
