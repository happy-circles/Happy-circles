function HappyCirclesMark() {
  return (
    <svg className="brandMark" viewBox="120 120 440 440" aria-hidden="true">
      <defs>
        <mask id="happy-circles-mark-mask" maskUnits="userSpaceOnUse" x="120" y="120" width="440" height="440">
          <rect x="120" y="120" width="440" height="440" fill="white" />
          <circle cx="182" cy="340" r="48" fill="black" />
          <circle cx="340" cy="182" r="48" fill="black" />
          <circle cx="498" cy="340" r="48" fill="black" />
          <circle cx="340" cy="498" r="48" fill="black" />
        </mask>
      </defs>
      <g mask="url(#happy-circles-mark-mask)">
        <path className="markArc markArcNavy" d="M 215 340 A 125 125 0 0 1 465 340" />
        <path className="markArc markArcGreen" d="M 215 340 A 125 125 0 0 0 340 465" />
        <path className="markArc markArcCoral" d="M 465 340 A 125 125 0 0 1 340 465" />
      </g>
      <circle className="markDot markDotGreen" cx="182" cy="340" r="34" />
      <circle className="markDot markDotNavy" cx="340" cy="182" r="34" />
      <circle className="markDot markDotCoral" cx="498" cy="340" r="34" />
      <circle className="markDot markDotNavy" cx="340" cy="498" r="34" />
      <circle className="markFace" cx="340" cy="340" r="50" />
      <circle className="markFaceDetail" cx="325" cy="331" r="7" />
      <circle className="markFaceDetail" cx="355" cy="331" r="7" />
      <path className="markSmile" d="M 320 349 Q 340 369 360 349" />
    </svg>
  );
}

function StoreButton({
  href,
  label,
  title,
}: Readonly<{
  href: string;
  label: string;
  title: string;
}>) {
  return (
    <a className="storeButton" href={href} aria-label={title}>
      <span className="storeLabel">{label}</span>
      <strong>{title}</strong>
    </a>
  );
}

export default function LandingPage() {
  return (
    <main className="landingShell">
      <section className="landingPanel" aria-labelledby="landing-title">
        <div className="brandStack">
          <HappyCirclesMark />
          <div className="brandCopy">
            <h1 id="landing-title">Happy Circles</h1>
            <p>Tu app de finanzas entre amigos.</p>
          </div>
        </div>

        <nav className="landingActions" aria-label="Descargar Happy Circles">
          <a className="primaryButton" href="/download">
            Abrir Happy Circles
          </a>
          <div className="storeGrid">
            <StoreButton href="/ios" label="iOS" title="App Store" />
            <StoreButton href="/android" label="Android" title="Play Store" />
          </div>
        </nav>
      </section>
    </main>
  );
}
