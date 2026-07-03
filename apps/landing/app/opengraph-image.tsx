import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Happy Circles';
export const size = {
  height: 630,
  width: 1200,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: '#fbfcff',
        color: '#101828',
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        padding: 78,
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'row',
          gap: 60,
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            maxWidth: 760,
          }}
        >
          <div
            style={{
              color: '#1a2744',
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            Happy Circles
          </div>
          <div
            style={{
              color: '#344054',
              fontSize: 34,
              lineHeight: 1.28,
              marginTop: 28,
            }}
          >
            Invitaciones privadas para conectar personas de confianza y mantener saldos claros.
          </div>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flexDirection: 'row',
              gap: 14,
              marginTop: 54,
            }}
          >
            <div
              style={{
                background: '#3dba6e',
                borderRadius: 999,
                height: 18,
                width: 18,
              }}
            />
            <div
              style={{
                color: '#667085',
                fontSize: 25,
                fontWeight: 700,
              }}
            >
              Abre la invitación en Happy Circles
            </div>
          </div>
        </div>

        <div
          style={{
            alignItems: 'center',
            background: '#ffffff',
            border: '2px solid #dde4ee',
            borderRadius: 48,
            display: 'flex',
            height: 300,
            justifyContent: 'center',
            width: 300,
          }}
        >
          <svg height="220" viewBox="120 120 440 440" width="220">
            <path
              d="M 215 340 A 125 125 0 0 1 465 340"
              fill="none"
              stroke="#1a2744"
              strokeLinecap="round"
              strokeWidth="40"
            />
            <path
              d="M 215 340 A 125 125 0 0 0 340 465"
              fill="none"
              stroke="#3dba6e"
              strokeLinecap="round"
              strokeWidth="40"
            />
            <path
              d="M 465 340 A 125 125 0 0 1 340 465"
              fill="none"
              stroke="#e8604a"
              strokeLinecap="round"
              strokeWidth="40"
            />
            <circle cx="182" cy="340" fill="#3dba6e" r="34" />
            <circle cx="340" cy="182" fill="#1a2744" r="34" />
            <circle cx="498" cy="340" fill="#e8604a" r="34" />
            <circle cx="340" cy="498" fill="#1a2744" r="34" />
            <circle cx="340" cy="340" fill="#3dba6e" r="50" />
            <circle cx="325" cy="331" fill="#ffffff" r="7" />
            <circle cx="355" cy="331" fill="#ffffff" r="7" />
            <path
              d="M 320 349 Q 340 369 360 349"
              fill="none"
              stroke="#ffffff"
              strokeLinecap="round"
              strokeWidth="6.5"
            />
          </svg>
        </div>
      </div>
    </div>,
    size,
  );
}
