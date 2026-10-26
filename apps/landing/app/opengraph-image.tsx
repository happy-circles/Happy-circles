import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Happy Circles: logo y nombre de la app';
export const size = {
  height: 630,
  width: 1200,
};
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), 'public', 'brand', 'happy-circles.png'));

  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#f6f7fa',
        color: '#1a2744',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {/* Both the mark and name fit inside the central 630px square crop. */}
      <img
        alt=""
        height={456}
        src={`data:image/png;base64,${logo.toString('base64')}`}
        width={456}
      />
      <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.2 }}>Happy Circles</div>
    </div>,
    size,
  );
}
