import type { MetadataRoute } from 'next';

import { BRAND_IMAGE_PATH, PUBLIC_PAGE_PATHS, publicSiteUrl } from '../lib/site-seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGE_PATHS.map((path) => ({
    url: publicSiteUrl(path),
    ...(path === '/' ? { images: [publicSiteUrl(BRAND_IMAGE_PATH)] } : {}),
  }));
}
