'use client';

import { useEffect, useMemo, useState } from 'react';

import { buildNativeAppUrl } from '@/lib/app-links';

export function AppOpenButton({
  fallbackPath,
  label = 'Abrir Happy Circles',
}: Readonly<{
  fallbackPath: string;
  label?: string;
}>) {
  const fallbackHref = useMemo(() => buildNativeAppUrl(fallbackPath), [fallbackPath]);
  const [href, setHref] = useState(fallbackHref);

  useEffect(() => {
    const nextHref = buildNativeAppUrl(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    );
    setHref(nextHref);

    const timer = window.setTimeout(() => {
      window.location.assign(nextHref);
    }, 350);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <a className="primaryButton" href={href}>
      {label}
    </a>
  );
}
