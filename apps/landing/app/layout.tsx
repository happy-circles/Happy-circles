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
