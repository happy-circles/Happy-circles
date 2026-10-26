import { describe, expect, it } from 'vitest';

import { metadata as privateGatewayMetadata } from '../app/(app-links)/layout';
import robots from '../app/robots';
import sitemap from '../app/sitemap';
import { buildHomeStructuredData } from './site-seo';
import { buildSocialMetadata } from './social-preview';

describe('public site discovery and private gateway indexing', () => {
  it('sets public canonical URLs explicitly without assigning one to private invite previews', () => {
    const publicMetadata = buildSocialMetadata({
      canonicalPath: '/',
      description: 'Happy Circles',
      title: 'Happy Circles',
    });
    const privateMetadata = buildSocialMetadata({
      description: 'Invitación privada a Happy Circles',
      title: 'Invitación privada a Happy Circles',
    });

    expect(publicMetadata.alternates?.canonical).toBe('https://www.happy-circles.com/');
    expect(privateMetadata).not.toHaveProperty('alternates');
    expect(privateMetadata.openGraph).not.toHaveProperty('url');
    expect(privateGatewayMetadata.robots).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
    // Allow the crawler to see noindex rather than blocking gateway pages in robots.txt.
    expect(robots().rules).toEqual({ userAgent: '*', allow: '/' });
  });

  it('limits discovery URLs to the marketing home, legal pages and support', () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    expect(paths).toEqual(['/', '/privacy', '/terms', '/support']);
    expect(
      entries.every((entry) => new URL(entry.url).origin === 'https://www.happy-circles.com'),
    ).toBe(true);
    expect(entries[0]?.images).toEqual(['https://www.happy-circles.com/brand/happy-circles.png']);
  });

  it('uses the public brand image as the home primary image without any invitation URL', () => {
    const data = buildHomeStructuredData();
    const page = data['@graph'].find((entry) => entry['@type'] === 'WebPage');
    const image = data['@graph'].find((entry) => entry['@type'] === 'ImageObject');

    expect(page?.url).toBe('https://www.happy-circles.com/');
    expect(page?.primaryImageOfPage).toEqual({
      '@id': 'https://www.happy-circles.com/brand/happy-circles.png#image',
    });
    expect(image?.contentUrl).toBe('https://www.happy-circles.com/brand/happy-circles.png');
    expect(JSON.stringify(data)).not.toMatch(/\/join|\/invite|reset-password|setup-account/);
  });
});
