import Image from 'next/image';

export function HappyCirclesMark() {
  return (
    <Image
      alt="Logo de Happy Circles"
      className="brandMark"
      height={1024}
      priority
      src="/brand/happy-circles.png"
      unoptimized
      width={1024}
    />
  );
}

function AppleStoreIcon() {
  return (
    <svg className="storeIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.6 12.3c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8s-1.8-.8-2.9-.8c-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 2.9-.7 1.4 0 1.8.7 3 .7 1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.2-2.5 1.2-2.6 0 0-2.7-1-2.7-3.8Z"
      />
      <path
        fill="currentColor"
        d="M14.4 5.9c.6-.8 1.1-1.8 1-2.9-1 .1-2.1.7-2.8 1.4-.6.7-1.1 1.7-1 2.8 1.1.1 2.1-.5 2.8-1.3Z"
      />
    </svg>
  );
}

function PlayStoreIcon() {
  return (
    <svg className="storeIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#34a853" d="M4.4 3.2c-.2.2-.4.5-.4.9v15.8c0 .4.1.7.4.9l8.8-8.8-8.8-8.8Z" />
      <path fill="#4285f4" d="m13.2 12 2.8-2.8L5.2 3.1c-.3-.2-.6-.2-.8.1l8.8 8.8Z" />
      <path fill="#fbbc04" d="m13.2 12-8.8 8.8c.2.3.6.3.8.1L16 14.8 13.2 12Z" />
      <path fill="#ea4335" d="m19.3 10.1-3.3-1.9-2.8 3.8 2.8 3.8 3.3-1.9c1.1-.6 1.1-3.2 0-3.8Z" />
    </svg>
  );
}

export function StoreButton({
  href,
  title,
  store,
}: Readonly<{
  href: string;
  title: string;
  store: 'apple' | 'play';
}>) {
  return (
    <a className={`storeButton storeButton-${store}`} href={href} aria-label={title}>
      {store === 'apple' ? <AppleStoreIcon /> : <PlayStoreIcon />}
      <strong>{title}</strong>
    </a>
  );
}

export function StoreButtonGrid() {
  return (
    <div className="storeGrid">
      <StoreButton href="/ios" store="apple" title="App Store" />
      <StoreButton href="/android" store="play" title="Play Store" />
    </div>
  );
}
