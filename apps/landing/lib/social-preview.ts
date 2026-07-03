import type { Metadata } from 'next';

const DEFAULT_APP_WEB_ORIGIN = 'https://app.happy-circles.com';
const SOCIAL_IMAGE_PATH = '/opengraph-image';

export const DEFAULT_SOCIAL_TITLE = 'Happy Circles';
export const DEFAULT_SOCIAL_DESCRIPTION =
  'Registra solicitudes, confirma saldos y cierra deudas pequeñas entre personas de confianza.';

export const ACCOUNT_INVITE_SOCIAL_TITLE = 'Tu acceso privado a Happy Circles';
export const ACCOUNT_INVITE_SOCIAL_DESCRIPTION =
  'Abre esta invitación privada para entrar a Happy Circles y conectarte con una persona de confianza.';

export const FRIENDSHIP_INVITE_SOCIAL_TITLE = 'Invitación privada a Happy Circles';
export const FRIENDSHIP_INVITE_SOCIAL_DESCRIPTION =
  'Abre esta invitación para conectarte con una persona de confianza en Happy Circles.';

function readMetadataBase(): URL {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_WEB_ORIGIN?.trim();

  try {
    return new URL(
      configuredOrigin && configuredOrigin.length > 0 ? configuredOrigin : DEFAULT_APP_WEB_ORIGIN,
    );
  } catch {
    return new URL(DEFAULT_APP_WEB_ORIGIN);
  }
}

export function buildSocialMetadata(input: {
  readonly description: string;
  readonly title: string;
}): Metadata {
  const image = {
    alt: 'Happy Circles',
    height: 630,
    url: SOCIAL_IMAGE_PATH,
    width: 1200,
  };

  return {
    description: input.description,
    metadataBase: readMetadataBase(),
    openGraph: {
      description: input.description,
      images: [image],
      siteName: 'Happy Circles',
      title: input.title,
      type: 'website',
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
