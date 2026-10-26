import type { Metadata } from 'next';

// Marketing URLs are independent of the origin used by native auth and invite links.
export const PUBLIC_SITE_ORIGIN = 'https://www.happy-circles.com';
export const BRAND_IMAGE_PATH = '/brand/happy-circles.png';
export const PUBLIC_PAGE_PATHS = ['/', '/privacy', '/terms', '/support'] as const;
export type PublicPagePath = (typeof PUBLIC_PAGE_PATHS)[number];

export const PRIVATE_PAGE_METADATA: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export function publicSiteUrl(path: string): string {
  return new URL(path, PUBLIC_SITE_ORIGIN).toString();
}

export function buildHomeStructuredData() {
  const homeUrl = publicSiteUrl('/');
  const imageUrl = publicSiteUrl(BRAND_IMAGE_PATH);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${homeUrl}#website`,
        url: homeUrl,
        name: 'Happy Circles',
        inLanguage: 'es-CO',
      },
      {
        '@type': 'ImageObject',
        '@id': `${imageUrl}#image`,
        url: imageUrl,
        contentUrl: imageUrl,
        caption: 'Happy Circles',
        encodingFormat: 'image/png',
        width: 1024,
        height: 1024,
      },
      {
        '@type': 'WebPage',
        '@id': `${homeUrl}#webpage`,
        url: homeUrl,
        name: 'Happy Circles',
        inLanguage: 'es-CO',
        isPartOf: { '@id': `${homeUrl}#website` },
        primaryImageOfPage: { '@id': `${imageUrl}#image` },
        image: { '@id': `${imageUrl}#image` },
      },
    ],
  };
}
