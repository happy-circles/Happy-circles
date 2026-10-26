import type { MetadataRoute } from 'next';

import { PUBLIC_SITE_ORIGIN, publicSiteUrl } from '../lib/site-seo';

export default function robots(): MetadataRoute.Robots {
  return {
    // Crawlers must reach private gateways to read their noindex metadata.
    // Blocking those URLs here can leave the URLs indexed without their content.
    rules: { userAgent: '*', allow: '/' },
    sitemap: publicSiteUrl('/sitemap.xml'),
    host: PUBLIC_SITE_ORIGIN,
  };
}
