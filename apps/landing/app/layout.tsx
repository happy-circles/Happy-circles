import type { Metadata, Viewport } from 'next';

import {
  DEFAULT_SOCIAL_DESCRIPTION,
  DEFAULT_SOCIAL_TITLE,
  buildSocialMetadata,
} from '@/lib/social-preview';

import './globals.css';

export const metadata: Metadata = {
  ...buildSocialMetadata({
    description: DEFAULT_SOCIAL_DESCRIPTION,
    title: `${DEFAULT_SOCIAL_TITLE} | Finanzas entre amigos`,
  }),
  applicationName: 'Happy Circles',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { url: '/icon-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
  verification: {
    google: '99G8t0bnL9laiNacR-KCSy6zeDTM5MhxB4nBl4NVLpM',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  initialScale: 1,
  themeColor: [
    { color: '#fbfcff', media: '(prefers-color-scheme: light)' },
    { color: '#09111f', media: '(prefers-color-scheme: dark)' },
  ],
  width: 'device-width',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
