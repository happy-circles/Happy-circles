import { headers } from 'next/headers';

import { buildHomeStructuredData } from '../../lib/site-seo';

export async function HomeStructuredData() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(buildHomeStructuredData()).replace(/</g, '\\u003c'),
      }}
    />
  );
}
