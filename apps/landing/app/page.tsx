import type { CSSProperties, ReactNode } from 'react';

type PersonId =
  | 'ana'
  | 'bruno'
  | 'carla'
  | 'diego'
  | 'elena'
  | 'fernando'
  | 'lucas'
  | 'pablo'
  | 'sofia';

type PersonProfile = {
  asset: string;
  name: string;
};

const people = {
  ana: { name: 'Ana', asset: '/avatars/ana.webp' },
  bruno: { name: 'Bruno', asset: '/avatars/bruno.webp' },
  carla: { name: 'Carla', asset: '/avatars/carla.webp' },
  diego: { name: 'Diego', asset: '/avatars/diego.webp' },
  elena: { name: 'Elena', asset: '/avatars/elena.webp' },
  fernando: { name: 'Fernando', asset: '/avatars/fernando.webp' },
  lucas: { name: 'Lucas', asset: '/avatars/lucas.webp' },
  pablo: { name: 'Pablo', asset: '/avatars/pablo.webp' },
  sofia: { name: 'Sofía', asset: '/avatars/sofia.webp' },
} satisfies Record<PersonId, PersonProfile>;

type NodeSize = 'tiny' | 'sm' | 'md' | 'lg' | 'xl';

function nodeStyle(x: number, y: number): CSSProperties {
  return { '--x': `${x}%`, '--y': `${y}%` } as CSSProperties;
}

function HappyCirclesGlyph({ large = false }: Readonly<{ large?: boolean }>) {
  return (
    <svg className={large ? 'glyph glyphLarge' : 'glyph'} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" strokeWidth="5.2" />
      <circle cx="24" cy="27" r="3.2" fill="currentColor" />
      <circle cx="40" cy="27" r="3.2" fill="currentColor" />
      <path
        d="M22 38 C27 45 37 45 42 38"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="5.2"
      />
    </svg>
  );
}

function BrandLockup({ hero = false }: Readonly<{ hero?: boolean }>) {
  return (
    <div className={hero ? 'brandLockup brandLockupHero' : 'brandLockup'}>
      <HappyCirclesGlyph large={hero} />
      <strong>Happy Circles</strong>
    </div>
  );
}

function PersonNode({
  check = false,
  className = '',
  id,
  label = false,
  muted = false,
  size = 'md',
  style,
}: Readonly<{
  check?: boolean;
  className?: string;
  id: PersonId;
  label?: boolean;
  muted?: boolean;
  size?: NodeSize;
  style?: CSSProperties;
}>) {
  const person = people[id];

  return (
    <figure
      aria-label={person.name}
      className={`personNode personNode-${size} ${muted ? 'personNodeMuted' : ''} ${className}`}
      style={style}
    >
      <span className="personPortrait" style={{ backgroundImage: `url(${person.asset})` }}>
        {check ? <span className="personCheck">✓</span> : null}
      </span>
      {label ? <figcaption>{person.name}</figcaption> : null}
    </figure>
  );
}

function GraphNode({
  check = false,
  id,
  label = false,
  muted = false,
  size = 'md',
  x,
  y,
}: Readonly<{
  check?: boolean;
  id: PersonId;
  label?: boolean;
  muted?: boolean;
  size?: NodeSize;
  x: number;
  y: number;
}>) {
  return <PersonNode check={check} className="graphNode" id={id} label={label} muted={muted} size={size} style={nodeStyle(x, y)} />;
}

function Decor() {
  return (
    <>
      <span className="decor decorCloud" aria-hidden="true" />
      <span className="decor decorBlob" aria-hidden="true" />
      <span className="decor decorLeaf" aria-hidden="true" />
      <span className="decor decorSpark decorSparkOne" aria-hidden="true" />
      <span className="decor decorSpark decorSparkTwo" aria-hidden="true" />
      <span className="decor decorDot decorDotOne" aria-hidden="true" />
      <span className="decor decorDot decorDotTwo" aria-hidden="true" />
    </>
  );
}

function StoryScreen({
  align = 'left',
  children,
  className = '',
  eyebrow,
  id,
  subtitle,
  title,
}: Readonly<{
  align?: 'left' | 'center';
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  id?: string;
  subtitle?: string;
  title: ReactNode;
}>) {
  return (
    <section className={`storyScreen storyScreen-${align} ${className}`} id={id}>
      <Decor />
      <BrandLockup />
      <div className="screenCopy">
        {eyebrow ? <span className="screenEyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StoreButton({
  href,
  label,
  store,
  variant = 'dark',
}: Readonly<{
  href: string;
  label: string;
  store: string;
  variant?: 'dark' | 'light';
}>) {
  return (
    <a className={`storeButton ${variant === 'light' ? 'storeButtonLight' : ''}`} href={href}>
      <span className="storeIcon" aria-hidden="true">
        {store === 'App Store' ? 'iOS' : 'Play'}
      </span>
      <span>
        <small>{label}</small>
        <strong>{store}</strong>
      </span>
    </a>
  );
}

function HeroGhostGraph() {
  return (
    <div className="heroGhostGraph" aria-hidden="true">
      <svg className="graphSvg ghostSvg" viewBox="0 0 360 440">
        <path d="M42 124 L180 78 L318 138 L302 314 L188 376 L62 302 Z" />
        <path d="M42 124 L188 376 L318 138" />
        <path d="M62 302 L180 78 L302 314" />
        <path d="M110 224 L318 138 L188 376" />
      </svg>
      <GraphNode id="fernando" label={false} muted size="lg" x={12} y={28} />
      <GraphNode id="ana" label={false} muted size="lg" x={50} y={18} />
      <GraphNode id="diego" label={false} muted size="lg" x={88} y={32} />
      <GraphNode id="carla" label={false} muted size="lg" x={18} y={69} />
      <GraphNode id="bruno" label={false} muted size="lg" x={52} y={82} />
      <GraphNode id="elena" label={false} muted size="lg" x={80} y={64} />
    </div>
  );
}

function DebtVisual() {
  return (
    <div className="debtVisual visualStage" aria-label="Bruno le presta dinero a Ana">
      <svg className="graphSvg debtSvg" viewBox="0 0 360 220" aria-hidden="true">
        <defs>
          <marker
            id="debt-arrow"
            markerHeight="16"
            markerUnits="userSpaceOnUse"
            markerWidth="16"
            orient="auto"
            refX="14"
            refY="8"
            viewBox="0 0 16 16"
          >
            <path d="M1 1 L15 8 L1 15 Z" fill="#e8604a" />
          </marker>
        </defs>
        <path className="debtLine" d="M132 138 C158 122 198 122 226 138" markerEnd="url(#debt-arrow)" />
      </svg>
      <GraphNode id="bruno" size="xl" x={22} y={58} />
      <GraphNode id="ana" size="xl" x={78} y={58} />
      <div className="receiptCard">
        <span />
        <span />
        <span />
        <strong>$80k</strong>
      </div>
    </div>
  );
}

function RelationsVisual() {
  return (
    <div className="networkVisual visualStage" aria-label="Varias personas conectadas por deudas">
      <svg className="graphSvg relationSvg" viewBox="0 0 360 420" aria-hidden="true">
        <path d="M80 150 L172 132 L270 170 L250 292 L162 320 L78 270 Z" />
        <path d="M80 150 L78 270" />
        <path d="M172 132 L162 320" />
        <path d="M270 170 L250 292" />
        <path d="M80 150 L172 132" className="softLine" />
        <path d="M162 320 L250 292" className="softLine" />
        <path d="M44 98 L80 150 L46 318" className="softLine" />
        <path d="M304 88 L270 170 L316 318" className="softLine" />
      </svg>
      <GraphNode id="sofia" label={false} muted size="sm" x={12} y={23} />
      <GraphNode id="fernando" size="lg" x={24} y={36} />
      <GraphNode id="ana" size="lg" x={50} y={32} />
      <GraphNode id="diego" size="lg" x={77} y={42} />
      <GraphNode id="carla" size="lg" x={23} y={66} />
      <GraphNode id="bruno" size="lg" x={48} y={78} />
      <GraphNode id="elena" size="lg" x={72} y={69} />
      <GraphNode id="lucas" label={false} muted size="sm" x={87} y={28} />
      <GraphNode id="pablo" label={false} muted size="sm" x={88} y={78} />
      <GraphNode id="sofia" label={false} muted size="sm" x={10} y={77} />
    </div>
  );
}

function ConfusedVisual() {
  return (
    <div className="networkVisual networkVisualConfused visualStage" aria-label="Una red de deudas confusa">
      <svg className="graphSvg confusedSvg" viewBox="0 0 360 450" aria-hidden="true">
        <path d="M72 142 L172 116 L276 142 L314 246 L262 340 L158 356 L60 290 Z" />
        <path d="M72 142 L262 340" />
        <path d="M172 116 L60 290" />
        <path d="M276 142 L158 356" />
        <path d="M52 214 L314 246" />
        <path d="M98 326 L284 96" />
        <path d="M42 92 L172 116 L326 126" />
        <path d="M40 366 L158 356 L320 360" />
        <path d="M72 142 L158 356 L276 142" />
        <path d="M60 290 L172 116 L262 340" />
      </svg>
      <span className="waitIcon waitIconOne" aria-hidden="true" />
      <span className="waitIcon waitIconTwo" aria-hidden="true" />
      <span className="waitIcon waitIconThree" aria-hidden="true" />
      <GraphNode id="sofia" label={false} muted size="sm" x={13} y={25} />
      <GraphNode id="fernando" size="lg" x={26} y={40} />
      <GraphNode id="ana" size="lg" x={51} y={39} />
      <GraphNode id="diego" size="lg" x={76} y={46} />
      <GraphNode id="carla" size="lg" x={25} y={65} />
      <GraphNode id="bruno" size="lg" x={52} y={77} />
      <GraphNode id="elena" size="lg" x={75} y={68} />
      <GraphNode id="lucas" label={false} muted size="sm" x={88} y={27} />
      <GraphNode id="pablo" label={false} muted size="sm" x={90} y={58} />
      <GraphNode id="sofia" label={false} muted size="sm" x={12} y={78} />
      <GraphNode id="lucas" label={false} muted size="sm" x={38} y={23} />
      <GraphNode id="pablo" label={false} muted size="sm" x={52} y={55} />
      <GraphNode id="elena" label={false} muted size="sm" x={88} y={83} />
      <GraphNode id="ana" label={false} muted size="sm" x={43} y={90} />
    </div>
  );
}

function HiddenPathVisual() {
  return (
    <div className="networkVisual networkVisualPath visualStage" aria-label="Happy Circles detecta un camino dentro de la red">
      <svg className="graphSvg pathSvg" viewBox="0 0 360 430" aria-hidden="true">
        <defs>
          <marker
            id="path-arrow-green"
            markerHeight="15"
            markerUnits="userSpaceOnUse"
            markerWidth="15"
            orient="auto"
            refX="13"
            refY="7.5"
            viewBox="0 0 15 15"
          >
            <path d="M1 1 L14 7.5 L1 14 Z" fill="#3dba6e" />
          </marker>
          <marker
            id="path-arrow-coral"
            markerHeight="15"
            markerUnits="userSpaceOnUse"
            markerWidth="15"
            orient="auto"
            refX="13"
            refY="7.5"
            viewBox="0 0 15 15"
          >
            <path d="M1 1 L14 7.5 L1 14 Z" fill="#e8604a" />
          </marker>
        </defs>
        <g className="dimmedGraphLines">
          <path d="M72 138 L172 122 L276 150 L306 252 L250 338 L158 352 L66 286 Z" />
          <path d="M72 138 L250 338" />
          <path d="M172 122 L66 286" />
          <path d="M276 150 L158 352" />
          <path d="M54 212 L306 252" />
          <path d="M98 326 L286 102" />
        </g>
        <path className="pathLine pathLineGreen" d="M88 160 L172 138 L270 170" markerEnd="url(#path-arrow-green)" />
        <path className="pathLine pathLineCoral" d="M270 170 L250 294" markerEnd="url(#path-arrow-coral)" />
        <path className="pathLine pathLineGreen" d="M250 294 L162 320 L80 270" markerEnd="url(#path-arrow-green)" />
        <path className="pathLine pathLineCoral" d="M80 270 L88 160" markerEnd="url(#path-arrow-coral)" />
      </svg>
      <GraphNode id="sofia" label={false} muted size="sm" x={12} y={24} />
      <GraphNode id="fernando" size="lg" x={25} y={38} />
      <GraphNode id="ana" size="lg" x={50} y={34} />
      <GraphNode id="diego" size="lg" x={76} y={43} />
      <GraphNode id="elena" size="lg" x={74} y={68} />
      <GraphNode id="bruno" size="lg" x={49} y={77} />
      <GraphNode id="carla" size="lg" x={24} y={65} />
      <GraphNode id="lucas" label={false} muted size="sm" x={87} y={27} />
      <GraphNode id="pablo" label={false} muted size="sm" x={88} y={78} />
      <GraphNode id="sofia" label={false} muted size="sm" x={12} y={79} />
    </div>
  );
}

function CircleVisual() {
  return (
    <div className="circleVisual visualStage" aria-label="Un círculo de cierre con menos pasos">
      <svg className="graphSvg circleSvg" viewBox="0 0 360 430" aria-hidden="true">
        <defs>
          <marker
            id="circle-arrow-green"
            markerHeight="16"
            markerUnits="userSpaceOnUse"
            markerWidth="16"
            orient="auto"
            refX="14"
            refY="8"
            viewBox="0 0 16 16"
          >
            <path d="M1 1 L15 8 L1 15 Z" fill="#3dba6e" />
          </marker>
          <marker
            id="circle-arrow-orange"
            markerHeight="16"
            markerUnits="userSpaceOnUse"
            markerWidth="16"
            orient="auto"
            refX="14"
            refY="8"
            viewBox="0 0 16 16"
          >
            <path d="M1 1 L15 8 L1 15 Z" fill="#f97316" />
          </marker>
        </defs>
        <g className="backgroundRing">
          <path d="M46 180 L170 112 L308 190 L260 326 L116 330 Z" />
          <path d="M72 86 L306 112 L318 340 L50 350 Z" />
        </g>
        <path className="circleArc circleArcGreen" d="M98 154 C116 104 176 86 228 112" markerEnd="url(#circle-arrow-green)" />
        <path className="circleArc circleArcOrange" d="M260 142 C314 174 316 244 278 286" markerEnd="url(#circle-arrow-orange)" />
        <path className="circleArc circleArcGreen" d="M242 330 C186 378 112 356 80 296" markerEnd="url(#circle-arrow-green)" />
        <path className="circleArc circleArcOrange" d="M62 246 C44 202 58 170 96 150" markerEnd="url(#circle-arrow-orange)" />
      </svg>
      <div className="centerLogo">
        <HappyCirclesGlyph />
      </div>
      <GraphNode id="fernando" size="lg" x={24} y={35} />
      <GraphNode id="ana" size="lg" x={52} y={25} />
      <GraphNode id="diego" size="lg" x={78} y={43} />
      <GraphNode id="elena" size="lg" x={75} y={69} />
      <GraphNode id="bruno" size="lg" x={49} y={79} />
      <GraphNode id="carla" size="lg" x={22} y={63} />
    </div>
  );
}

function ConfirmVisual() {
  return (
    <div className="confirmVisual visualStage" aria-label="La app propone y las personas confirman">
      <svg className="graphSvg confirmSvg" viewBox="0 0 360 400" aria-hidden="true">
        <path d="M180 198 L86 112" />
        <path d="M180 198 L270 118" />
        <path d="M180 198 L76 266" />
        <path d="M180 198 L280 270" />
        <path d="M180 198 L170 326" />
      </svg>
      <div className="proposalCard">
        <span className="proposalCheck">✓</span>
        <span />
        <span />
      </div>
      <GraphNode check id="fernando" size="lg" x={25} y={24} />
      <GraphNode check id="ana" size="lg" x={75} y={24} />
      <GraphNode check id="carla" size="lg" x={20} y={66} />
      <GraphNode check id="diego" size="lg" x={80} y={65} />
      <GraphNode check id="bruno" size="lg" x={48} y={78} />
    </div>
  );
}

function FinalVisual() {
  return (
    <div className="finalVisual" aria-label="Círculo confirmado de Happy Circles">
      <svg className="graphSvg finalRingSvg" viewBox="0 0 360 360" aria-hidden="true">
        <circle cx="180" cy="180" r="122" />
      </svg>
      <div className="finalLogo">
        <HappyCirclesGlyph large />
        <span className="finalLogoCheck">✓</span>
      </div>
      <GraphNode id="ana" size="md" x={50} y={10} />
      <GraphNode id="diego" size="md" x={84} y={32} />
      <GraphNode id="elena" size="md" x={80} y={72} />
      <GraphNode id="bruno" size="md" x={50} y={90} />
      <GraphNode id="carla" size="md" x={16} y={72} />
      <GraphNode id="fernando" size="md" x={16} y={32} />
    </div>
  );
}

function HeroScreen() {
  return (
    <section className="storyScreen heroScreen">
      <Decor />
      <BrandLockup />
      <div className="screenCopy heroCopy">
        <h1>
          <span>Paga más rápido.</span>
          <span>Cobra más rápido.</span>
        </h1>
      </div>
      <HeroGhostGraph />
    </section>
  );
}

function DebtScreen() {
  return (
    <StoryScreen
      align="center"
      className="debtScreen"
      id="step-debt"
      subtitle="Una persona le presta a otra."
      title={
        <>
          <span>Todo empieza</span>
          <span>con una deuda.</span>
        </>
      }
    >
      <DebtVisual />
    </StoryScreen>
  );
}

function RelationsScreen() {
  return (
    <StoryScreen
      className="chainScreen"
      id="step-chain"
      subtitle="Una deuda se conecta con otra."
      title={
        <>
          <span>Luego aparecen</span>
          <span>más relaciones.</span>
        </>
      }
    >
      <RelationsVisual />
    </StoryScreen>
  );
}

function ConfusedScreen() {
  return (
    <StoryScreen
      className="confusedScreen"
      id="step-network"
      subtitle="No todos se conocen. Todos esperan."
      title={
        <>
          <span>La red se</span>
          <span>vuelve confusa.</span>
        </>
      }
    >
      <ConfusedVisual />
    </StoryScreen>
  );
}

function HiddenPathScreen() {
  return (
    <StoryScreen
      className="pathScreen"
      id="step-path"
      subtitle="Happy Circles lo detecta."
      title={
        <>
          <span>Pero hay un</span>
          <span>camino escondido.</span>
        </>
      }
    >
      <HiddenPathVisual />
    </StoryScreen>
  );
}

function ClosureScreen() {
  return (
    <StoryScreen
      className="circleScreen"
      id="step-circle"
      subtitle="Menos pasos, menos espera."
      title={
        <>
          <span>La red se convierte</span>
          <span>en un cierre.</span>
        </>
      }
    >
      <CircleVisual />
    </StoryScreen>
  );
}

function ConfirmScreen() {
  return (
    <StoryScreen id="step-confirm" subtitle="Las personas confirman." title="La app propone.">
      <ConfirmVisual />
    </StoryScreen>
  );
}

function FinalScreen() {
  return (
    <section className="storyScreen finalScreen" id="final" aria-labelledby="final-title">
      <Decor />
      <BrandLockup />
      <div className="screenCopy finalCopy">
        <h2 id="final-title">Todo cobra sentido.</h2>
        <p>Abre Happy Circles.</p>
      </div>
      <FinalVisual />
      <div className="finalActions">
        <a className="primaryCta" href="/download">
          Abrir Happy Circles
        </a>
        <div className="storeRow">
          <StoreButton href="/ios" label="Descargar en" store="App Store" />
          <StoreButton href="/android" label="Disponible en" store="Play Store" variant="light" />
        </div>
        <small>La app propone. Tú decides confirmar.</small>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <main className="storyPage">
      <HeroScreen />
      <DebtScreen />
      <RelationsScreen />
      <ConfusedScreen />
      <HiddenPathScreen />
      <ClosureScreen />
      <ConfirmScreen />
      <FinalScreen />
    </main>
  );
}
