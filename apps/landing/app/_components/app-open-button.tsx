'use client';

import { useEffect, useMemo, useState } from 'react';

import { buildNativeAppUrl } from '@/lib/app-links';

export function AppOpenButton({
  fallbackPath,
  label = 'Abrir Happy Circles',
  nativePath,
}: Readonly<{
  fallbackPath: string;
  label?: string;
  nativePath?: string;
}>) {
  const fallbackHref = useMemo(
    () => buildNativeAppUrl(nativePath ?? fallbackPath),
    [fallbackPath, nativePath],
  );
  const [href, setHref] = useState(fallbackHref);

  useEffect(() => {
    const nextHref = nativePath
      ? buildNativeAppUrl(nativePath)
      : buildNativeAppUrl(window.location.pathname, window.location.search, window.location.hash);
    setHref(nextHref);

    const timer = window.setTimeout(() => {
      window.location.assign(nextHref);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [nativePath]);

  return (
    <a className="primaryButton" href={href}>
      {label}
    </a>
  );
}
