import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Happy Circles | Finanzas entre amigos',
  description: 'Abre Happy Circles y descarga la app para iOS o Android.',
  openGraph: {
    title: 'Happy Circles',
    description: 'Tu app de finanzas entre amigos.',
    siteName: 'Happy Circles',
    type: 'website',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  initialScale: 1,
  themeColor: '#f7f8fb',
  width: 'device-width',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
