'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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

  useEffect(() => {
    const nextHref = nativePath
      ? buildHref(nativePath)
      : buildNativeAppUrl(window.location.pathname, window.location.search, window.location.hash);
    setHref(nextHref);

    if (!autoOpen) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      window.location.assign(nextHref);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [autoOpen, buildHref, nativePath]);

  return (
    <a className={className} href={href}>
      {label}
    </a>
  );
}
