import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Happy Circles | Finanzas entre amigos',
  description:
    'Registra solicitudes, confirma saldos y cierra deudas pequeñas entre personas de confianza.',
  openGraph: {
    title: 'Happy Circles',
    description:
      'Registra solicitudes, confirma saldos y cierra deudas pequeñas entre personas de confianza.',
    siteName: 'Happy Circles',
    type: 'website',
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
