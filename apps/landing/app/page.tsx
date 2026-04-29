'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

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

type SvgPoint = readonly [number, number];

type NodeFrame = {
  muted?: boolean;
  opacity: number;
  size: number;
  x: number;
  y: number;
};

type ResolvedNodeFrame = Required<NodeFrame>;

type EdgeDef = {
  className?: string;
  offset?: number;
  from: PersonId;
  to: PersonId;
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

const personIds = Object.keys(people) as PersonId[];

const storySteps = [
  {
    id: 'intro',
    subtitle: 'Paga más rápido. Cobra más rápido.',
    title: ['Happy Circles'],
  },
  {
    id: 'debt',
    subtitle: 'Una persona le presta a otra.',
    title: ['Todo empieza', 'con una deuda.'],
  },
  {
    id: 'relations',
    subtitle: 'Una deuda se conecta con otra.',
    title: ['Luego aparecen', 'más relaciones.'],
  },
  {
    id: 'network',
    subtitle: 'No todos se conocen. Todos esperan.',
    title: ['La red se', 'vuelve confusa.'],
  },
  {
    id: 'path',
    subtitle: 'Happy Circles lo detecta.',
    title: ['Pero hay un', 'camino escondido.'],
  },
  {
    id: 'circle',
    subtitle: 'Menos pasos, menos espera.',
    title: ['La red se convierte', 'en un cierre.'],
  },
  {
    id: 'confirm',
    subtitle: 'Las personas confirman.',
    title: ['La app propone.'],
  },
  {
    id: 'final',
    subtitle: 'Abre Happy Circles.',
    title: ['Todo cobra', 'sentido.'],
  },
] as const;

const STEP_COUNT = storySteps.length;
const EDGE_OFFSET = 48;
const circleParticipantIds = ['fernando', 'ana', 'diego', 'elena', 'bruno', 'carla'] as const satisfies readonly PersonId[];
const circleParticipants = new Set<PersonId>(circleParticipantIds);

const relationEdges: EdgeDef[] = [
  { className: 'softStoryLine', from: 'sofia', to: 'fernando' },
  { from: 'fernando', to: 'ana' },
  { from: 'ana', to: 'diego' },
  { className: 'softStoryLine', from: 'diego', to: 'lucas' },
  { from: 'ana', to: 'carla' },
  { from: 'carla', to: 'bruno' },
  { from: 'diego', to: 'elena' },
  { className: 'softStoryLine', from: 'elena', to: 'pablo' },
  { className: 'softStoryLine', from: 'fernando', to: 'carla' },
];

const networkEdges: EdgeDef[] = [
  { from: 'sofia', to: 'fernando' },
  { from: 'fernando', to: 'carla' },
  { from: 'carla', to: 'bruno' },
  { from: 'bruno', to: 'elena' },
  { from: 'elena', to: 'diego' },
  { from: 'diego', to: 'lucas' },
  { from: 'lucas', to: 'ana' },
  { from: 'ana', to: 'sofia' },
  { from: 'fernando', to: 'ana' },
  { from: 'ana', to: 'diego' },
  { from: 'fernando', to: 'bruno' },
  { from: 'fernando', to: 'diego' },
  { from: 'ana', to: 'elena' },
  { from: 'ana', to: 'pablo' },
  { from: 'diego', to: 'bruno' },
  { from: 'diego', to: 'pablo' },
  { from: 'pablo', to: 'elena' },
  { from: 'pablo', to: 'carla' },
  { from: 'pablo', to: 'bruno' },
  { from: 'fernando', to: 'pablo' },
  { from: 'carla', to: 'ana' },
];

const hiddenPathEdges: EdgeDef[] = [
  { from: 'fernando', to: 'ana' },
  { from: 'ana', to: 'diego' },
  { from: 'diego', to: 'elena' },
  { from: 'elena', to: 'bruno' },
  { from: 'bruno', to: 'carla' },
  { from: 'carla', to: 'fernando' },
];

const nodeFrames: Record<PersonId, readonly NodeFrame[]> = {
  sofia: [
    frame(10, 45, 0, 68, true),
    frame(14, 46, 0, 72, true),
    frame(8, 9, 0.72, 76),
    frame(12, 12, 1, 76),
    frame(12, 12, 0.16, 76, true),
    frame(12, 12, 0.08, 76, true),
    frame(12, 12, 0, 76, true),
    frame(12, 12, 0, 76, true),
  ],
  fernando: [
    frame(30, 48, 0, 70, true),
    frame(25, 58, 0, 74, true),
    frame(20, 47, 1, 78),
    frame(18, 43, 1, 78),
    frame(18, 43, 1, 78),
    frame(20, 40, 1, 78),
    frame(20, 38, 1, 78),
    frame(20, 35, 1, 72),
  ],
  ana: [
    frame(50, 40, 0, 74, true),
    frame(74, 58, 1, 112),
    frame(50, 33, 1, 78),
    frame(50, 24, 1, 78),
    frame(50, 24, 1, 78),
    frame(50, 18, 1, 78),
    frame(75, 34, 1, 78),
    frame(50, 22, 1, 72),
  ],
  diego: [
    frame(73, 52, 0, 70, true),
    frame(76, 58, 0, 74, true),
    frame(80, 47, 1, 78),
    frame(82, 43, 1, 78),
    frame(82, 43, 1, 78),
    frame(80, 40, 1, 78),
    frame(84, 58, 1, 78),
    frame(80, 35, 1, 72),
  ],
  carla: [
    frame(24, 74, 0, 74, true),
    frame(22, 74, 0, 74, true),
    frame(14, 76, 1, 78),
    frame(15, 72, 1, 78),
    frame(15, 72, 1, 78),
    frame(20, 70, 1, 78),
    frame(18, 68, 1, 78),
    frame(20, 61, 1, 72),
  ],
  bruno: [
    frame(50, 82, 0, 74, true),
    frame(26, 58, 1, 112),
    frame(48, 88, 1, 78),
    frame(50, 86, 1, 78),
    frame(50, 86, 1, 78),
    frame(50, 86, 1, 78),
    frame(48, 84, 1, 78),
    frame(50, 72, 1, 72),
  ],
  elena: [
    frame(78, 72, 0, 74, true),
    frame(78, 72, 0, 74, true),
    frame(75, 69, 1, 78),
    frame(78, 72, 1, 78),
    frame(78, 72, 1, 78),
    frame(80, 70, 1, 78),
    frame(80, 82, 1, 78),
    frame(80, 61, 1, 72),
  ],
  lucas: [
    frame(90, 30, 0, 68, true),
    frame(88, 34, 0, 72, true),
    frame(92, 9, 0.72, 76),
    frame(88, 12, 1, 76),
    frame(88, 12, 0.16, 76, true),
    frame(88, 12, 0.08, 76, true),
    frame(88, 12, 0, 76, true),
    frame(88, 12, 0, 76, true),
  ],
  pablo: [
    frame(52, 62, 0, 72, true),
    frame(52, 62, 0, 72, true),
    frame(88, 90, 0.72, 76),
    frame(50, 56, 1, 76),
    frame(50, 56, 0.16, 76, true),
    frame(50, 56, 0.08, 76, true),
    frame(50, 56, 0, 76, true),
    frame(50, 56, 0, 76, true),
  ],
};

function frame(x: number, y: number, opacity: number, size: number, muted = false): NodeFrame {
  return { muted, opacity, size, x, y };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function phaseOpacity(rawStep: number, index: number, width = 0.92) {
  return clamp(1 - Math.abs(rawStep - index) / width);
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

function curvedEdgePath(from: SvgPoint, to: SvgPoint, curve = -0.18, startOffset = EDGE_OFFSET, endOffset = EDGE_OFFSET) {
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

function circleEdgePath(from: SvgPoint, to: SvgPoint, center: SvgPoint, startOffset = EDGE_OFFSET, endOffset = EDGE_OFFSET) {
  const { end, start } = getTrimmedEdge(from, to, startOffset, endOffset);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  const midX = (start[0] + end[0]) / 2;
  const midY = (start[1] + end[1]) / 2;
  const radialX = midX - center[0];
  const radialY = midY - center[1];
  const radialLength = Math.hypot(radialX, radialY);
  const fallbackNormalX = length ? -dy / length : 0;
  const fallbackNormalY = length ? dx / length : 0;
  const normalX = radialLength ? radialX / radialLength : fallbackNormalX;
  const normalY = radialLength ? radialY / radialLength : fallbackNormalY;
  const bulge = clamp(length * 0.28, 24, 46);
  const controlX = midX + normalX * bulge;
  const controlY = midY + normalY * bulge;

  return `M${start[0]} ${start[1]} Q${controlX} ${controlY} ${end[0]} ${end[1]}`;
}

function toSvgPoint(node: ResolvedNodeFrame): SvgPoint {
  return [node.x * 3.6, node.y * 4.5] as const;
}

function getNodeEdgeOffset(node: ResolvedNodeFrame) {
  return node.size * 0.5 + 3;
}

function getCircleLayout(frames: Record<PersonId, ResolvedNodeFrame>) {
  const points = circleParticipantIds.map((id) => toSvgPoint(frames[id]));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2,
    ry: (maxY - minY) / 2,
  };
}

function getNodeFrame(id: PersonId, index: number): NodeFrame {
  return nodeFrames[id][index] ?? nodeFrames[id][0] ?? frame(50, 50, 0, 76);
}

function resolveNodeFrames(rawStep: number): Record<PersonId, ResolvedNodeFrame> {
  const lowerIndex = Math.floor(clamp(rawStep, 0, STEP_COUNT - 1));
  const upperIndex = Math.min(STEP_COUNT - 1, lowerIndex + 1);
  const amount = clamp(rawStep - lowerIndex);
  const nearestIndex = Math.round(rawStep);

  return personIds.reduce(
    (frames, id) => {
      const lower = getNodeFrame(id, lowerIndex);
      const upper = getNodeFrame(id, upperIndex);
      const nearest = getNodeFrame(id, nearestIndex);

      frames[id] = {
        muted: nearest.muted ?? false,
        opacity: lerp(lower.opacity, upper.opacity, amount),
        size: lerp(lower.size, upper.size, amount),
        x: lerp(lower.x, upper.x, amount),
        y: lerp(lower.y, upper.y, amount),
      };

      return frames;
    },
    {} as Record<PersonId, ResolvedNodeFrame>,
  );
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mediaQuery.matches);

    update();
    mediaQuery.addEventListener('change', update);

    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return prefersReducedMotion;
}

function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frameId = 0;

    const measure = () => {
      if (!ref.current) {
        return;
      }

      const rect = ref.current.getBoundingClientRect();
      const scrollable = Math.max(1, rect.height - window.innerHeight);
      const nextProgress = clamp(-rect.top / scrollable);
      setProgress((currentProgress) => (Math.abs(currentProgress - nextProgress) > 0.001 ? nextProgress : currentProgress));
    };

    const requestMeasure = () => {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        measure();
      });
    };

    measure();
    window.addEventListener('scroll', requestMeasure, { passive: true });
    window.addEventListener('resize', requestMeasure);

    return () => {
      window.removeEventListener('scroll', requestMeasure);
      window.removeEventListener('resize', requestMeasure);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [ref]);

  return progress;
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

function StoryDecor() {
  return (
    <>
      <span className="storyDecor storyDecorCloud" aria-hidden="true" />
      <span className="storyDecor storyDecorBlob" aria-hidden="true" />
      <span className="storyDecor storyDecorLeaf" aria-hidden="true" />
      <span className="storyDecor storyDecorSpark storyDecorSparkOne" aria-hidden="true" />
      <span className="storyDecor storyDecorSpark storyDecorSparkTwo" aria-hidden="true" />
      <span className="storyDecor storyDecorDot storyDecorDotOne" aria-hidden="true" />
      <span className="storyDecor storyDecorDot storyDecorDotTwo" aria-hidden="true" />
    </>
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

function AnimatedEdge({
  className = '',
  circleCenter,
  edge,
  frames,
  opacity,
  curved = false,
}: Readonly<{
  className?: string;
  circleCenter?: SvgPoint;
  curved?: boolean;
  edge: EdgeDef;
  frames: Record<PersonId, ResolvedNodeFrame>;
  opacity: number;
}>) {
  const fromFrame = frames[edge.from];
  const toFrame = frames[edge.to];
  const from = toSvgPoint(fromFrame);
  const to = toSvgPoint(toFrame);
  const startOffset = edge.offset ?? getNodeEdgeOffset(fromFrame);
  const endOffset = edge.offset ?? getNodeEdgeOffset(toFrame);
  const d =
    curved && circleCenter
      ? circleEdgePath(from, to, circleCenter, startOffset, endOffset)
      : curved
        ? curvedEdgePath(from, to, -0.18, startOffset, endOffset)
        : edgePath(from, to, startOffset, endOffset);

  return <path className={`${edge.className ?? ''} ${className}`} d={d} style={{ opacity }} />;
}

function AnimatedNode({
  check,
  frame,
  id,
}: Readonly<{
  check: boolean;
  frame: ResolvedNodeFrame;
  id: PersonId;
}>) {
  const person = people[id];
  const style = {
    '--avatar-size': `${frame.size}px`,
    '--node-x': `${frame.x}%`,
    '--node-y': `${frame.y}%`,
    filter: frame.muted ? 'grayscale(1)' : 'none',
    opacity: frame.opacity,
  } as CSSProperties;

  return (
    <figure aria-label={person.name} className="morphNode" style={style}>
      <span className="morphAvatar" style={{ backgroundImage: `url(${person.asset})` }}>
        <span className="morphCheck" style={{ opacity: check ? 1 : 0 }}>
          ✓
        </span>
      </span>
    </figure>
  );
}

function ChapterText({ rawStep }: Readonly<{ rawStep: number }>) {
  return (
    <div className="chapterStack" aria-live="polite">
      {storySteps.map((step, index) => {
        const opacity = index === 0 ? 0 : phaseOpacity(rawStep, index);
        const style = {
          opacity,
          pointerEvents: opacity > 0.5 ? 'auto' : 'none',
          transform: `translateY(${(1 - opacity) * 18}px)`,
        } as CSSProperties;

        return (
          <div className="chapterCopy" key={step.id} style={style}>
            <h1>
              {step.title.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p>{step.subtitle}</p>
          </div>
        );
      })}
    </div>
  );
}

function IntroLockup({ rawStep }: Readonly<{ rawStep: number }>) {
  const opacity = phaseOpacity(rawStep, 0, 0.72);

  return (
    <div className="introLockup" style={{ opacity, transform: `translate(-50%, -50%) scale(${0.94 + opacity * 0.06})` }}>
      <HappyCirclesGlyph large />
      <h1>Happy Circles</h1>
    </div>
  );
}

function ReceiptCard({ opacity }: Readonly<{ opacity: number }>) {
  return (
    <div className="storyReceipt" style={{ opacity }}>
      <span />
      <span />
      <span />
      <strong>$80k</strong>
    </div>
  );
}

function ProposalCard({ opacity }: Readonly<{ opacity: number }>) {
  return (
    <div className="storyProposal" style={{ opacity }}>
      <span className="storyProposalCheck">✓</span>
      <span />
      <span />
    </div>
  );
}

function CenterLogo({ rawStep }: Readonly<{ rawStep: number }>) {
  const circleOpacity = phaseOpacity(rawStep, 5, 0.86);
  const finalOpacity = phaseOpacity(rawStep, 7, 1);
  const opacity = clamp(circleOpacity + finalOpacity);
  const scale = 0.72 + finalOpacity * 0.26;

  return (
    <div className="storyCenterLogo" style={{ opacity, transform: `translate(-50%, -50%) scale(${scale})` }}>
      <HappyCirclesGlyph large />
      <span className="storyCenterCheck" style={{ opacity: finalOpacity }}>
        ✓
      </span>
    </div>
  );
}

function StoryScene({ rawStep }: Readonly<{ rawStep: number }>) {
  const frames = useMemo(() => resolveNodeFrames(rawStep), [rawStep]);
  const circleLayout = useMemo(() => getCircleLayout(frames), [frames]);
  const circleCenter = [circleLayout.cx, circleLayout.cy] as const;
  const debtOpacity = phaseOpacity(rawStep, 1);
  const relationOpacity = phaseOpacity(rawStep, 2);
  const networkOpacity = Math.max(phaseOpacity(rawStep, 3), phaseOpacity(rawStep, 4) * 0.34);
  const pathOpacity = Math.max(phaseOpacity(rawStep, 4), phaseOpacity(rawStep, 5) * 0.68);
  const circleOpacity = phaseOpacity(rawStep, 5);
  const confirmOpacity = phaseOpacity(rawStep, 6);
  const finalOpacity = phaseOpacity(rawStep, 7);
  const showChecks = rawStep > 5.45 && rawStep < 6.82;

  return (
    <div className="morphStage" aria-label="Historia visual de una red de deudas que se convierte en un cierre">
      <svg className="morphGraphSvg" preserveAspectRatio="none" viewBox="0 0 360 450" aria-hidden="true">
        <g className="storyDebtLines">
          <AnimatedEdge className="storyDebtLine" edge={{ from: 'bruno', to: 'ana' }} frames={frames} opacity={debtOpacity} />
        </g>
        <g className="storyRelationLines">
          {relationEdges.map((edge) => (
            <AnimatedEdge edge={edge} frames={frames} key={`${edge.from}-${edge.to}`} opacity={relationOpacity} />
          ))}
        </g>
        <g className="storyNetworkLines">
          {networkEdges.map((edge, index) => (
            <AnimatedEdge edge={edge} frames={frames} key={`${edge.from}-${edge.to}-${index}`} opacity={networkOpacity} />
          ))}
        </g>
        <g className="storyCircleBack" style={{ opacity: circleOpacity * 0.42 + finalOpacity * 0.44 }}>
          <ellipse cx={circleLayout.cx} cy={circleLayout.cy} rx={circleLayout.rx} ry={circleLayout.ry} />
        </g>
        <g className="storyPathLines">
          {hiddenPathEdges.map((edge, index) => (
            <AnimatedEdge
              circleCenter={circleCenter}
              className={index % 2 === 0 && circleOpacity > 0.25 ? 'storyPathLineOrange' : 'storyPathLineGreen'}
              curved={circleOpacity > 0.35 || finalOpacity > 0.35}
              edge={edge}
              frames={frames}
              key={`${edge.from}-${edge.to}`}
              opacity={pathOpacity}
            />
          ))}
        </g>
        <g className="storyConfirmLines" style={{ opacity: confirmOpacity }}>
          <line x1="180" x2="90" y1="232" y2="155" />
          <line x1="180" x2="270" y1="232" y2="155" />
          <line x1="180" x2="75" y1="232" y2="300" />
          <line x1="180" x2="282" y1="232" y2="300" />
          <line x1="180" x2="180" y1="232" y2="372" />
        </g>
      </svg>

      <ReceiptCard opacity={debtOpacity} />
      <ProposalCard opacity={confirmOpacity} />
      <CenterLogo rawStep={rawStep} />

      {personIds.map((id) => (
        <AnimatedNode
          check={showChecks && circleParticipants.has(id) && rawStep < 7.15}
          frame={frames[id]}
          id={id}
          key={id}
        />
      ))}
    </div>
  );
}

function StoryActions({ rawStep }: Readonly<{ rawStep: number }>) {
  const opacity = phaseOpacity(rawStep, 7, 0.8);

  return (
    <div className="storyActions" style={{ opacity, transform: `translateY(${(1 - opacity) * 18}px)` }}>
      <a className="primaryCta" href="/download">
        Abrir Happy Circles
      </a>
      <div className="storeRow">
        <StoreButton href="/ios" label="Descargar en" store="App Store" />
        <StoreButton href="/android" label="Disponible en" store="Play Store" variant="light" />
      </div>
      <small>La app propone. Tú decides confirmar.</small>
    </div>
  );
}

function StickyStory() {
  const storyRef = useRef<HTMLElement | null>(null);
  const progress = useScrollProgress(storyRef);
  const rawStep = progress * (STEP_COUNT - 1);
  const brandOpacity = 1 - phaseOpacity(rawStep, 0, 0.72);

  return (
    <section className="scrollStory" ref={storyRef} style={{ '--story-progress': progress } as CSSProperties}>
      <div className="stickyStory">
        <StoryDecor />
        <div className="storyBrand" style={{ opacity: brandOpacity }}>
          <HappyCirclesGlyph />
          <strong>Happy Circles</strong>
        </div>
        <IntroLockup rawStep={rawStep} />
        <ChapterText rawStep={rawStep} />
        <StoryScene rawStep={rawStep} />
        <StoryActions rawStep={rawStep} />
      </div>
    </section>
  );
}

function ReducedStory() {
  return (
    <main className="scrollStoryPage reducedStoryPage">
      {storySteps.map((step, index) => (
        <section className="reducedStoryScreen" key={step.id}>
          <StoryDecor />
          <div className="storyBrand" style={{ opacity: index === 0 ? 0 : 1 }}>
            <HappyCirclesGlyph />
            <strong>Happy Circles</strong>
          </div>
          {index === 0 ? <IntroLockup rawStep={0} /> : null}
          {index > 0 ? (
            <div className="chapterCopy reducedChapterCopy">
              <h1>
                {step.title.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </h1>
              <p>{step.subtitle}</p>
            </div>
          ) : null}
          <StoryScene rawStep={index} />
          {index === STEP_COUNT - 1 ? <StoryActions rawStep={index} /> : null}
        </section>
      ))}
    </main>
  );
}

export default function LandingPage() {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (prefersReducedMotion) {
    return <ReducedStory />;
  }

  return (
    <main className="scrollStoryPage">
      <StickyStory />
      <section className="storySemanticSummary" aria-label="Resumen de Happy Circles">
        <h2>Happy Circles detecta conexiones de deuda.</h2>
        <p>La app propone cierres inteligentes y las personas deciden confirmar antes de ejecutar.</p>
      </section>
    </main>
  );
}
