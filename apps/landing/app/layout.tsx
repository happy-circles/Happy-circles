import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Happy Circles | Paga más rápido. Cobra más rápido.',
  description:
    'Happy Circles detecta conexiones de deuda y propone cierres inteligentes para que el dinero fluya mejor.',
  openGraph: {
    title: 'Happy Circles',
    description: 'Paga más rápido. Cobra más rápido.',
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
