import type { Metadata } from 'next';

import { PUBLIC_SITE_ORIGIN, publicSiteUrl, type PublicPagePath } from './site-seo';

const SOCIAL_IMAGE_PATH = '/opengraph-image?v=2';

export const DEFAULT_SOCIAL_TITLE = 'Happy Circles';
export const DEFAULT_SOCIAL_DESCRIPTION =
  'Registra solicitudes, confirma saldos y cierra deudas pequeñas entre personas de confianza.';

export const ACCOUNT_INVITE_SOCIAL_TITLE = 'Tu acceso privado a Happy Circles';
export const ACCOUNT_INVITE_SOCIAL_DESCRIPTION =
  'Abre esta invitación privada para entrar a Happy Circles y conectarte con una persona de confianza.';

export const FRIENDSHIP_INVITE_SOCIAL_TITLE = 'Invitación privada a Happy Circles';
export const FRIENDSHIP_INVITE_SOCIAL_DESCRIPTION =
  'Abre esta invitación para conectarte con una persona de confianza en Happy Circles.';

export function buildSocialMetadata(input: {
  readonly description: string;
  readonly title: string;
  readonly canonicalPath?: PublicPagePath;
}): Metadata {
  const image = {
    alt: 'Happy Circles',
    height: 630,
    url: SOCIAL_IMAGE_PATH,
    width: 1200,
  };
  const canonicalUrl =
    input.canonicalPath === undefined ? undefined : publicSiteUrl(input.canonicalPath);

  return {
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    description: input.description,
    metadataBase: new URL(PUBLIC_SITE_ORIGIN),
    openGraph: {
      description: input.description,
      images: [image],
      siteName: 'Happy Circles',
      title: input.title,
      type: 'website',
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
    },
    title: input.title,
    twitter: {
      card: 'summary_large_image',
      description: input.description,
      images: [SOCIAL_IMAGE_PATH],
      title: input.title,
    },
  };
}
