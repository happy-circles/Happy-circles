import type { Viewport } from 'next';

import {
  DEFAULT_SOCIAL_DESCRIPTION,
  DEFAULT_SOCIAL_TITLE,
  buildSocialMetadata,
} from '@/lib/social-preview';

import './globals.css';

export const metadata = buildSocialMetadata({
  description: DEFAULT_SOCIAL_DESCRIPTION,
  title: `${DEFAULT_SOCIAL_TITLE} | Finanzas entre amigos`,
});

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
