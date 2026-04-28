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
type SvgPoint = readonly [number, number];
const EDGE_OFFSET = 48;
const ARROW_EDGE_OFFSET = 62;

function nodeStyle(x: number, y: number): CSSProperties {
  return { '--x': `${x}%`, '--y': `${y}%` } as CSSProperties;
}

function getTrimmedEdge(from: SvgPoint, to: SvgPoint, startOffset = EDGE_OFFSET, endOffset = EDGE_OFFSET) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);

  if (!length) {
    return { end: to, start: from };
  }

  if (length <= startOffset + endOffset) {
    const symmetricOffset = Math.max(0, length / 2 - 4);
    startOffset = symmetricOffset;
    endOffset = symmetricOffset;
  }

  const ux = dx / length;
  const uy = dy / length;
  return {
    end: [x2 - ux * endOffset, y2 - uy * endOffset] as SvgPoint,
    start: [x1 + ux * startOffset, y1 + uy * startOffset] as SvgPoint,
  };
}

function edgePath(from: SvgPoint, to: SvgPoint, startOffset = EDGE_OFFSET, endOffset = EDGE_OFFSET) {
  const { end, start } = getTrimmedEdge(from, to, startOffset, endOffset);
  return `M${start[0]} ${start[1]} L${end[0]} ${end[1]}`;
}

function curvedEdgePath(from: SvgPoint, to: SvgPoint, curve = -0.22, startOffset = EDGE_OFFSET, endOffset = EDGE_OFFSET) {
  const { end, start } = getTrimmedEdge(from, to, startOffset, endOffset);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const midX = (start[0] + end[0]) / 2;
  const midY = (start[1] + end[1]) / 2;
  const normalX = length ? -dy / length : 0;
  const normalY = length ? dx / length : 0;
  const controlX = midX + normalX * length * curve;
  const controlY = midY + normalY * length * curve;
  return `M${start[0]} ${start[1]} Q${controlX} ${controlY} ${end[0]} ${end[1]}`;
}

function GraphEdge({
  className,
  endOffset,
  from,
  markerEnd,
  startOffset,
  to,
}: Readonly<{
  className?: string;
  endOffset?: number;
  from: SvgPoint;
  markerEnd?: string;
  startOffset?: number;
  to: SvgPoint;
}>) {
  return (
    <path
      className={className}
      d={edgePath(from, to, startOffset, endOffset ?? (markerEnd ? ARROW_EDGE_OFFSET : EDGE_OFFSET))}
      markerEnd={markerEnd}
    />
  );
}

function CurvedGraphEdge({
  className,
  curve = -0.22,
  endOffset,
  from,
  markerEnd,
  startOffset,
  to,
}: Readonly<{
  className?: string;
  curve?: number;
  endOffset?: number;
  from: SvgPoint;
  markerEnd?: string;
  startOffset?: number;
  to: SvgPoint;
}>) {
  return (
    <path
      className={className}
      d={curvedEdgePath(from, to, curve, startOffset, endOffset ?? (markerEnd ? ARROW_EDGE_OFFSET : EDGE_OFFSET))}
      markerEnd={markerEnd}
    />
  );
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
      <svg className="graphSvg ghostSvg" preserveAspectRatio="none" viewBox="0 0 360 440">
        <GraphEdge from={[43, 123]} to={[180, 79]} />
        <GraphEdge from={[180, 79]} to={[317, 141]} />
        <GraphEdge from={[317, 141]} to={[288, 282]} />
        <GraphEdge from={[288, 282]} to={[187, 361]} />
        <GraphEdge from={[187, 361]} to={[65, 304]} />
        <GraphEdge from={[65, 304]} to={[43, 123]} />
        <GraphEdge from={[43, 123]} to={[187, 361]} />
        <GraphEdge from={[187, 361]} to={[317, 141]} />
        <GraphEdge from={[65, 304]} to={[180, 79]} />
        <GraphEdge from={[180, 79]} to={[288, 282]} />
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
        <path className="debtLine" d="M150 138 C166 122 196 122 212 138" markerEnd="url(#debt-arrow)" />
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
      <svg className="graphSvg relationSvg" preserveAspectRatio="none" viewBox="0 0 360 420" aria-hidden="true">
        <GraphEdge className="softLine" from={[47, 59]} to={[83, 143]} />
        <GraphEdge from={[83, 143]} to={[180, 122]} />
        <GraphEdge from={[180, 122]} to={[270, 172]} />
        <GraphEdge className="softLine" from={[270, 172]} to={[310, 76]} />
        <GraphEdge from={[180, 122]} to={[79, 286]} />
        <GraphEdge from={[79, 286]} to={[173, 344]} />
        <GraphEdge from={[173, 344]} to={[259, 286]} />
        <GraphEdge className="softLine" from={[259, 286]} to={[331, 370]} />
        <GraphEdge className="softLine" from={[270, 172]} to={[259, 286]} />
      </svg>
      <GraphNode id="sofia" label={false} muted size="sm" x={13} y={14} />
      <GraphNode id="fernando" size="lg" x={23} y={34} />
      <GraphNode id="ana" size="lg" x={50} y={29} />
      <GraphNode id="diego" size="lg" x={75} y={41} />
      <GraphNode id="carla" size="lg" x={22} y={68} />
      <GraphNode id="bruno" size="lg" x={48} y={82} />
      <GraphNode id="elena" size="lg" x={72} y={68} />
      <GraphNode id="lucas" label={false} muted size="sm" x={86} y={18} />
      <GraphNode id="pablo" label={false} muted size="sm" x={92} y={88} />
    </div>
  );
}

function ConfusedVisual() {
  return (
    <div className="networkVisual networkVisualConfused visualStage" aria-label="Una red de deudas confusa">
      <svg className="graphSvg confusedSvg" preserveAspectRatio="none" viewBox="0 0 360 450" aria-hidden="true">
        <GraphEdge from={[43, 54]} to={[65, 194]} />
        <GraphEdge from={[65, 194]} to={[54, 324]} />
        <GraphEdge from={[54, 324]} to={[180, 387]} />
        <GraphEdge from={[180, 387]} to={[281, 324]} />
        <GraphEdge from={[281, 324]} to={[295, 194]} />
        <GraphEdge from={[295, 194]} to={[317, 54]} />
        <GraphEdge from={[317, 54]} to={[180, 108]} />
        <GraphEdge from={[180, 108]} to={[43, 54]} />
        <GraphEdge from={[65, 194]} to={[180, 387]} />
        <GraphEdge from={[65, 194]} to={[295, 194]} />
        <GraphEdge from={[180, 108]} to={[281, 324]} />
        <GraphEdge from={[180, 108]} to={[180, 252]} />
        <GraphEdge from={[295, 194]} to={[180, 387]} />
        <GraphEdge from={[295, 194]} to={[180, 252]} />
        <GraphEdge from={[180, 252]} to={[281, 324]} />
        <GraphEdge from={[180, 252]} to={[54, 324]} />
        <GraphEdge from={[180, 252]} to={[180, 387]} />
        <GraphEdge from={[65, 194]} to={[180, 252]} />
        <GraphEdge from={[54, 324]} to={[180, 108]} />
      </svg>
      <span className="waitIcon waitIconOne" aria-hidden="true" />
      <span className="waitIcon waitIconTwo" aria-hidden="true" />
      <span className="waitIcon waitIconThree" aria-hidden="true" />
      <GraphNode id="sofia" label={false} muted size="sm" x={12} y={12} />
      <GraphNode id="fernando" size="lg" x={18} y={43} />
      <GraphNode id="ana" size="lg" x={50} y={24} />
      <GraphNode id="diego" size="lg" x={82} y={43} />
      <GraphNode id="carla" size="lg" x={15} y={72} />
      <GraphNode id="bruno" size="lg" x={50} y={86} />
      <GraphNode id="elena" size="lg" x={78} y={72} />
      <GraphNode id="lucas" label={false} muted size="sm" x={88} y={12} />
      <GraphNode id="pablo" label={false} muted size="sm" x={50} y={56} />
    </div>
  );
}

function HiddenPathVisual() {
  return (
    <div className="networkVisual networkVisualPath visualStage" aria-label="Happy Circles detecta un camino dentro de la red">
      <svg className="graphSvg pathSvg" preserveAspectRatio="none" viewBox="0 0 360 430" aria-hidden="true">
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
          <GraphEdge from={[43, 60]} to={[86, 163]} />
          <GraphEdge from={[86, 163]} to={[180, 133]} />
          <GraphEdge from={[180, 133]} to={[274, 181]} />
          <GraphEdge from={[274, 181]} to={[317, 69]} />
          <GraphEdge from={[274, 181]} to={[274, 292]} />
          <GraphEdge from={[274, 292]} to={[331, 378]} />
          <GraphEdge from={[274, 292]} to={[180, 348]} />
          <GraphEdge from={[180, 348]} to={[86, 292]} />
          <GraphEdge from={[86, 292]} to={[86, 163]} />
          <GraphEdge from={[43, 60]} to={[180, 133]} />
          <GraphEdge from={[86, 163]} to={[180, 348]} />
        </g>
        <GraphEdge className="pathLine pathLineGreen" from={[86, 163]} markerEnd="url(#path-arrow-green)" to={[180, 133]} />
        <GraphEdge className="pathLine pathLineCoral" from={[180, 133]} markerEnd="url(#path-arrow-coral)" to={[274, 181]} />
        <GraphEdge className="pathLine pathLineGreen" from={[274, 181]} markerEnd="url(#path-arrow-green)" to={[274, 292]} />
        <GraphEdge className="pathLine pathLineCoral" from={[274, 292]} markerEnd="url(#path-arrow-coral)" to={[180, 348]} />
        <GraphEdge className="pathLine pathLineGreen" from={[180, 348]} markerEnd="url(#path-arrow-green)" to={[86, 292]} />
        <GraphEdge className="pathLine pathLineCoral" from={[86, 292]} markerEnd="url(#path-arrow-coral)" to={[86, 163]} />
      </svg>
      <GraphNode id="sofia" label={false} muted size="sm" x={12} y={14} />
      <GraphNode id="fernando" size="lg" x={25} y={38} />
      <GraphNode id="ana" size="lg" x={50} y={31} />
      <GraphNode id="diego" size="lg" x={76} y={42} />
      <GraphNode id="elena" size="lg" x={74} y={68} />
      <GraphNode id="bruno" size="lg" x={50} y={81} />
      <GraphNode id="carla" size="lg" x={24} y={68} />
      <GraphNode id="lucas" label={false} muted size="sm" x={88} y={16} />
      <GraphNode id="pablo" label={false} muted size="sm" x={92} y={88} />
    </div>
  );
}

function CircleVisual() {
  return (
    <div className="circleVisual visualStage" aria-label="Un círculo de cierre con menos pasos">
      <svg className="graphSvg circleSvg" preserveAspectRatio="none" viewBox="0 0 360 430" aria-hidden="true">
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
          <GraphEdge from={[65, 172]} to={[180, 77]} />
          <GraphEdge from={[180, 77]} to={[295, 172]} />
          <GraphEdge from={[295, 172]} to={[281, 301]} />
          <GraphEdge from={[281, 301]} to={[180, 370]} />
          <GraphEdge from={[180, 370]} to={[65, 301]} />
          <GraphEdge from={[65, 301]} to={[65, 172]} />
        </g>
        <CurvedGraphEdge
          className="circleArc circleArcGreen"
          from={[65, 172]}
          markerEnd="url(#circle-arrow-green)"
          to={[180, 77]}
        />
        <CurvedGraphEdge
          className="circleArc circleArcOrange"
          from={[180, 77]}
          markerEnd="url(#circle-arrow-orange)"
          to={[295, 172]}
        />
        <CurvedGraphEdge
          className="circleArc circleArcGreen"
          from={[295, 172]}
          markerEnd="url(#circle-arrow-green)"
          to={[281, 301]}
        />
        <CurvedGraphEdge
          className="circleArc circleArcOrange"
          from={[281, 301]}
          markerEnd="url(#circle-arrow-orange)"
          to={[180, 370]}
        />
        <CurvedGraphEdge
          className="circleArc circleArcGreen"
          from={[180, 370]}
          markerEnd="url(#circle-arrow-green)"
          to={[65, 301]}
        />
        <CurvedGraphEdge
          className="circleArc circleArcOrange"
          from={[65, 301]}
          markerEnd="url(#circle-arrow-orange)"
          to={[65, 172]}
        />
      </svg>
      <div className="centerLogo">
        <HappyCirclesGlyph />
      </div>
      <GraphNode id="fernando" size="lg" x={18} y={40} />
      <GraphNode id="ana" size="lg" x={50} y={18} />
      <GraphNode id="diego" size="lg" x={82} y={40} />
      <GraphNode id="elena" size="lg" x={78} y={70} />
      <GraphNode id="bruno" size="lg" x={50} y={86} />
      <GraphNode id="carla" size="lg" x={18} y={70} />
    </div>
  );
}

function ConfirmVisual() {
  return (
    <div className="confirmVisual visualStage" aria-label="La app propone y las personas confirman">
      <svg className="graphSvg confirmSvg" preserveAspectRatio="none" viewBox="0 0 360 400" aria-hidden="true">
        <GraphEdge endOffset={52} from={[180, 198]} startOffset={78} to={[86, 112]} />
        <GraphEdge endOffset={52} from={[180, 198]} startOffset={78} to={[270, 118]} />
        <GraphEdge endOffset={52} from={[180, 198]} startOffset={78} to={[76, 266]} />
        <GraphEdge endOffset={52} from={[180, 198]} startOffset={78} to={[280, 270]} />
        <GraphEdge endOffset={52} from={[180, 198]} startOffset={78} to={[170, 326]} />
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
