import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type {
  ActiveSettlementPreviewDto,
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPersonRowDto,
} from '@happy-circles/application';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { HappyCircleRing, type HappyCircleRingParticipant } from '@/components/happy-circle-ring';
import { HappyFacesCounter } from '@/components/happy-faces-counter';
import { StateAuraLayer } from '@/components/state-aura-layer';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { toneVisual } from '@/lib/direction-ui';
import { resolveHappyCirclePresentation } from '@/lib/happy-circle-presentation';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
import {
  amountTone,
  balanceTone,
  firstName,
  categoryFlowAmount,
  categoryFocusDisplayAmount,
  categoryHasCurrentFlow,
  formatCompactCop,
  formatHomeBalanceCop,
  personLensAmount,
  signedFormatCompactCop,
} from './balance-helpers';
import { balanceOverviewStyles as styles } from './balance-overview-screen.styles';

const VISUAL_SWATCHES = [
  { color: theme.colors.success, soft: theme.colors.successSoft },
  { color: theme.colors.danger, soft: theme.colors.dangerSoft },
  { color: theme.colors.cycle, soft: theme.colors.cycleSoft },
  { color: theme.palette.category.fun.color, soft: theme.palette.category.fun.backgroundColor },
] as const;

const CATEGORY_PARTICLE_LIMIT = 6;
const CATEGORY_PARTICLE_STARTS = [
  { x: 0.05, y: 0.2 },
  { x: 0.68, y: 0.02 },
  { x: 0.96, y: 0.34 },
  { x: 0.45, y: 0.98 },
  { x: 0.02, y: 0.78 },
  { x: 0.86, y: 0.84 },
] as const;
const CATEGORY_PARTICLE_VELOCITIES = [
  { vx: 0.74, vy: 0.52 },
  { vx: 0.62, vy: -0.58 },
  { vx: -0.66, vy: 0.54 },
  { vx: -0.6, vy: -0.48 },
  { vx: 0.7, vy: 0.44 },
  { vx: -0.72, vy: -0.5 },
] as const;

type ParticleBounds = {
  readonly height: number;
  readonly width: number;
};

type CategoryParticleDatum = {
  readonly row: BalanceAnalyticsCategoryRowDto;
  readonly size: number;
};

type ParticleState = {
  key: string;
  size: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type ParticleObstacle = {
  readonly radius: number;
  readonly x1: number;
  readonly x2: number;
  readonly y1: number;
  readonly y2: number;
};

function useLoopingProgress(durationMs: number) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        duration: durationMs,
        easing: Easing.inOut(Easing.sin),
        toValue: 1,
        useNativeDriver: true,
      }),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [durationMs, progress]);

  return progress;
}

function amountVisual(amountMinor: number): {
  readonly color: string;
  readonly soft: string;
} {
  const tone = amountTone(amountMinor);

  if (tone === 'positive') {
    return { color: theme.colors.success, soft: theme.colors.successSoft };
  }

  if (tone === 'negative') {
    return { color: theme.colors.warning, soft: theme.colors.warningSoft };
  }

  return { color: theme.colors.primary, soft: theme.colors.primarySoft };
}

function FocusCardTitle({
  align = 'center',
  children,
  subtitle,
}: {
  readonly align?: 'center' | 'start';
  readonly children: string;
  readonly subtitle?: string;
}) {
  return (
    <View style={[styles.focusCardHeader, align === 'start' ? styles.focusCardHeaderStart : null]}>
      <AppText
        numberOfLines={1}
        style={[styles.focusCardTitle, align === 'start' ? styles.focusCardTitleStart : null]}
      >
        {children}
      </AppText>
      {subtitle ? (
        <AppText
          numberOfLines={1}
          style={[styles.focusCardSubtitle, align === 'start' ? styles.focusCardTitleStart : null]}
        >
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

export function TrendChip({
  amountMinor,
  changeRatio,
  centered = false,
  contextLabel,
}: {
  readonly amountMinor?: number;
  readonly changeRatio?: number | null;
  readonly centered?: boolean;
  readonly contextLabel?: string;
}) {
  const activeTheme = useAppTheme();
  const hasComparison =
    amountMinor !== undefined || (changeRatio !== undefined && changeRatio !== null);
  const comparable = amountMinor ?? changeRatio ?? 0;
  const tone = comparable > 0 ? 'positive' : comparable < 0 ? 'negative' : 'neutral';
  const valueLabel =
    amountMinor !== undefined
      ? signedFormatCompactCop(amountMinor)
      : changeRatio === null || changeRatio === undefined
        ? 'Sin data'
        : `${Math.round(Math.abs(changeRatio) * 100)}%`;

  return (
    <View
      style={[
        styles.trendChip,
        {
          backgroundColor:
            activeTheme.scheme === 'dark'
              ? activeTheme.colors.surfaceSoft
              : activeTheme.glass.accentBackground,
          borderColor: activeTheme.colors.hairline,
        },
        centered ? styles.trendChipCentered : null,
        tone === 'positive' ? styles.trendChipPositive : null,
        tone === 'negative' ? styles.trendChipNegative : null,
      ]}
    >
      <Ionicons
        color={
          tone === 'positive'
            ? theme.colors.success
            : tone === 'negative'
              ? theme.colors.warning
              : theme.colors.textMuted
        }
        name={
          tone === 'positive'
            ? 'trending-up-outline'
            : tone === 'negative'
              ? 'trending-down-outline'
              : 'remove-outline'
        }
        size={15}
      />
      <AppText
        numberOfLines={1}
        style={[
          styles.trendChipValue,
          tone === 'positive' ? styles.positiveText : null,
          tone === 'negative' ? styles.negativeText : null,
        ]}
      >
        {hasComparison ? valueLabel : 'Sin data'}
      </AppText>
      {contextLabel ? (
        <AppText numberOfLines={1} style={styles.trendChipContext}>
          {contextLabel}
        </AppText>
      ) : null}
    </View>
  );
}

function BalanceCarouselMetricItem({
  amountMinor,
  tone,
}: {
  readonly amountMinor: number;
  readonly tone: 'positive' | 'negative';
}) {
  const activeTheme = useAppTheme();
  const visual = toneVisual(tone, activeTheme);

  if (!visual) {
    return null;
  }

  return (
    <View
      style={[
        styles.balanceMetricItem,
        {
          backgroundColor: visual.softBackgroundColor,
          borderColor: visual.borderColor,
        },
      ]}
    >
      <View style={styles.balanceMetricLabelRow}>
        <Ionicons color={visual.accentColor} name={visual.icon} size={17} />
        <AppText
          numberOfLines={1}
          style={[styles.balanceMetricLabel, { color: visual.accentColor }]}
        >
          {visual.label}
        </AppText>
      </View>
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[styles.balanceMetricAmount, { color: visual.accentColor }]}
      >
        {formatCop(amountMinor)}
      </AppText>
    </View>
  );
}

function EmptyCardState({
  icon,
  label,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
}) {
  return (
    <View style={styles.emptyCardState}>
      <Ionicons color={theme.colors.textMuted} name={icon} size={18} />
      <AppText style={styles.emptyCardText}>{label}</AppText>
    </View>
  );
}

function CategoryProgressBubble({
  row,
  size,
  totalFlowMinor,
}: {
  readonly row: BalanceAnalyticsCategoryRowDto;
  readonly size: number;
  readonly totalFlowMinor: number;
}) {
  const color = transactionCategoryColor(row.category);
  const incomingMinor = Math.abs(row.owedToMeMinor);
  const outgoingMinor = Math.abs(row.iOweMinor);
  const flowAmountMinor = categoryFlowAmount(row);
  const displayAmountMinor = categoryFocusDisplayAmount(row);
  const displayLabel =
    row.netMinor === 0 && flowAmountMinor > 0
      ? formatCompactCop(displayAmountMinor)
      : signedFormatCompactCop(displayAmountMinor);
  const incomingWins = incomingMinor >= outgoingMinor;
  const outerAmountMinor = incomingWins ? incomingMinor : outgoingMinor;
  const innerAmountMinor = incomingWins ? outgoingMinor : incomingMinor;
  const outerColor = incomingWins ? theme.colors.success : theme.colors.warning;
  const innerColor = incomingWins ? theme.colors.warning : theme.colors.success;
  const netColor =
    row.netMinor > 0
      ? theme.colors.success
      : row.netMinor < 0
        ? theme.colors.warning
        : theme.colors.primary;
  const displayColor = row.netMinor === 0 && flowAmountMinor > 0 ? color : netColor;
  const strokeWidth = 3.4 + (size - 50) / 18;
  const innerStrokeWidth = Math.max(3, strokeWidth - 1.6);
  const outerRadius = size / 2 - strokeWidth / 2;
  const innerRadius = outerRadius - strokeWidth - 2.5;
  const centerSize = size * 0.7;
  const flowTotalMinor = Math.max(totalFlowMinor, 1);
  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const outerProgress = outerAmountMinor / flowTotalMinor;
  const innerProgress = innerAmountMinor / flowTotalMinor;
  const outerDashoffset = outerCircumference * (1 - Math.min(outerProgress, 1));
  const innerDashoffset = innerCircumference * (1 - Math.min(innerProgress, 1));

  return (
    <View style={styles.categoryProgressBubble}>
      <View style={[styles.categoryProgressIconWrap, { height: size, width: size }]}>
        <Svg height={size} style={styles.categoryProgressSvg} width={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={outerRadius}
            stroke={theme.colors.hairline}
            strokeWidth={4}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={innerRadius}
            stroke={theme.colors.hairline}
            strokeWidth={3}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={outerRadius}
            stroke={outerColor}
            strokeDasharray={`${outerCircumference} ${outerCircumference}`}
            strokeDashoffset={outerDashoffset}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          {innerProgress > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              r={innerRadius}
              stroke={innerColor}
              strokeDasharray={`${innerCircumference} ${innerCircumference}`}
              strokeDashoffset={innerDashoffset}
              strokeLinecap="round"
              strokeWidth={innerStrokeWidth}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ) : null}
        </Svg>
        <View
          style={[
            styles.categoryProgressIcon,
            { backgroundColor: transactionCategoryBackgroundColor(row.category) },
            {
              borderRadius: centerSize / 2,
              height: centerSize,
              width: centerSize,
            },
          ]}
        >
          <Ionicons
            color={color}
            name={transactionCategoryIcon(row.category) as keyof typeof Ionicons.glyphMap}
            size={Math.round(size * 0.24)}
          />
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={[styles.categoryProgressInnerValue, { color: displayColor }]}
          >
            {displayLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function categoryParticleSize(
  row: BalanceAnalyticsCategoryRowDto,
  maxCategoryFlowMinor: number,
): number {
  const categoryFlowMinor = categoryFlowAmount(row);
  const resultWeight = Math.sqrt(categoryFlowMinor / Math.max(maxCategoryFlowMinor, 1));

  return 50 + resultWeight * 42;
}

function clampParticleToBounds(particle: ParticleState, bounds: ParticleBounds) {
  const maxX = Math.max(bounds.width - particle.size, 0);
  const maxY = Math.max(bounds.height - particle.size, 0);

  particle.x = Math.min(Math.max(particle.x, 0), maxX);
  particle.y = Math.min(Math.max(particle.y, 0), maxY);
}

function keepParticleSpeedControlled(particle: ParticleState) {
  const speed = Math.hypot(particle.vx, particle.vy);
  const maxSpeed = 0.92;
  const minSpeed = 0.38;

  if (speed > maxSpeed) {
    particle.vx = (particle.vx / speed) * maxSpeed;
    particle.vy = (particle.vy / speed) * maxSpeed;
  }

  if (speed > 0 && speed < minSpeed) {
    particle.vx = (particle.vx / speed) * minSpeed;
    particle.vy = (particle.vy / speed) * minSpeed;
  }
}

function particleEscapeDirection(key: string): 1 | -1 {
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash += key.charCodeAt(index) * (index + 1);
  }

  return hash % 2 === 0 ? 1 : -1;
}

function createParticle(
  particle: CategoryParticleDatum,
  bounds: ParticleBounds,
  index: number,
): ParticleState {
  const start = CATEGORY_PARTICLE_STARTS[index % CATEGORY_PARTICLE_STARTS.length];
  const velocity = CATEGORY_PARTICLE_VELOCITIES[index % CATEGORY_PARTICLE_VELOCITIES.length];
  const maxX = Math.max(bounds.width - particle.size, 0);
  const maxY = Math.max(bounds.height - particle.size, 0);

  return {
    key: particle.row.key,
    size: particle.size,
    vx: velocity.vx,
    vy: velocity.vy,
    x: maxX * start.x,
    y: maxY * start.y,
  };
}

function syncParticleState(
  currentParticles: readonly ParticleState[],
  nextParticles: readonly CategoryParticleDatum[],
  bounds: ParticleBounds,
): ParticleState[] {
  const currentByKey = new Map(currentParticles.map((particle) => [particle.key, particle]));

  return nextParticles.map((particle, index) => {
    const current = currentByKey.get(particle.row.key);

    if (!current) {
      return createParticle(particle, bounds, index);
    }

    current.key = particle.row.key;
    current.size = particle.size;
    clampParticleToBounds(current, bounds);
    keepParticleSpeedControlled(current);

    return current;
  });
}

function resolveParticleCollisions(particles: ParticleState[], bounds: ParticleBounds) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let leftIndex = 0; leftIndex < particles.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < particles.length; rightIndex += 1) {
        const left = particles[leftIndex];
        const right = particles[rightIndex];
        const leftCenterX = left.x + left.size / 2;
        const leftCenterY = left.y + left.size / 2;
        const rightCenterX = right.x + right.size / 2;
        const rightCenterY = right.y + right.size / 2;
        const deltaX = rightCenterX - leftCenterX;
        const deltaY = rightCenterY - leftCenterY;
        const distance = Math.max(Math.hypot(deltaX, deltaY), 0.001);
        const minDistance = (left.size + right.size) / 2 + 4;

        if (distance >= minDistance) {
          continue;
        }

        const normalX = deltaX / distance;
        const normalY = deltaY / distance;
        const overlap = (minDistance - distance) / 2;
        const leftVelocity = left.vx * normalX + left.vy * normalY;
        const rightVelocity = right.vx * normalX + right.vy * normalY;
        const exchange = (rightVelocity - leftVelocity) * 0.86;

        left.x -= normalX * overlap;
        left.y -= normalY * overlap;
        right.x += normalX * overlap;
        right.y += normalY * overlap;
        left.vx += exchange * normalX;
        left.vy += exchange * normalY;
        right.vx -= exchange * normalX;
        right.vy -= exchange * normalY;
        keepParticleSpeedControlled(left);
        keepParticleSpeedControlled(right);
        clampParticleToBounds(left, bounds);
        clampParticleToBounds(right, bounds);
      }
    }
  }
}

function categoryFixedObstacles(bounds: ParticleBounds): readonly ParticleObstacle[] {
  const titleSafeWidth = Math.min(132, Math.max(100, bounds.width * 0.42));
  const titleCenterY = 12;

  return [
    {
      radius: 22,
      x1: 0,
      x2: titleSafeWidth,
      y1: titleCenterY,
      y2: titleCenterY,
    },
  ];
}

function resolveObstacleCollisions(
  particles: ParticleState[],
  obstacles: readonly ParticleObstacle[],
  bounds: ParticleBounds,
) {
  for (const particle of particles) {
    for (const obstacle of obstacles) {
      const radius = particle.size / 2 + obstacle.radius + 5;
      const centerX = particle.x + particle.size / 2;
      const centerY = particle.y + particle.size / 2;
      const segmentX = obstacle.x2 - obstacle.x1;
      const segmentY = obstacle.y2 - obstacle.y1;
      const segmentLengthSquared = Math.max(segmentX * segmentX + segmentY * segmentY, 0.001);
      const nearestPointRatio = Math.min(
        Math.max(
          ((centerX - obstacle.x1) * segmentX + (centerY - obstacle.y1) * segmentY) /
            segmentLengthSquared,
          0,
        ),
        1,
      );
      const nearestX = obstacle.x1 + segmentX * nearestPointRatio;
      const nearestY = obstacle.y1 + segmentY * nearestPointRatio;
      let deltaX = centerX - nearestX;
      let deltaY = centerY - nearestY;
      let distance = Math.hypot(deltaX, deltaY);

      if (distance >= radius) {
        continue;
      }

      if (distance < 0.001) {
        deltaX = 0;
        deltaY = centerY < nearestY ? -1 : 1;
        distance = 1;
      }

      const normalX = deltaX / distance;
      const normalY = deltaY / distance;
      const pushDistance = radius - distance;
      const velocityIntoObstacle = particle.vx * normalX + particle.vy * normalY;
      const segmentLength = Math.sqrt(segmentLengthSquared);
      const tangentX = segmentX / segmentLength;
      const tangentY = segmentY / segmentLength;
      const tangentDirection = particleEscapeDirection(particle.key);

      particle.x += normalX * pushDistance;
      particle.y += normalY * pushDistance;

      if (velocityIntoObstacle < 0) {
        particle.vx -= velocityIntoObstacle * 1.8 * normalX;
        particle.vy -= velocityIntoObstacle * 1.8 * normalY;
      }

      if (Math.abs(velocityIntoObstacle) < 0.16 || pushDistance > particle.size * 0.18) {
        particle.vx += tangentX * tangentDirection * 0.12;
        particle.vy += tangentY * tangentDirection * 0.12;
      }

      keepParticleSpeedControlled(particle);
      clampParticleToBounds(particle, bounds);
    }
  }
}

function settleCategoryParticles(particles: ParticleState[], bounds: ParticleBounds) {
  const obstacles = categoryFixedObstacles(bounds);

  for (let pass = 0; pass < 3; pass += 1) {
    resolveObstacleCollisions(particles, obstacles, bounds);
    resolveParticleCollisions(particles, bounds);
  }

  resolveObstacleCollisions(particles, obstacles, bounds);
}

function CategoryParticleField({
  isActive = true,
  onCategoryPress,
  particles,
  totalFlowMinor,
}: {
  readonly isActive?: boolean;
  readonly onCategoryPress?: (category: BalanceAnalyticsCategoryRowDto['category']) => void;
  readonly particles: readonly CategoryParticleDatum[];
  readonly totalFlowMinor: number;
}) {
  const [bounds, setBounds] = useState<ParticleBounds>({ height: 0, width: 0 });
  const animatedPositions = useRef(
    Array.from({ length: CATEGORY_PARTICLE_LIMIT }, () => new Animated.ValueXY()),
  ).current;
  const particleStateRef = useRef<ParticleState[]>([]);
  const boundsRef = useRef(bounds);
  const displayedParticles = useMemo(() => {
    if (bounds.width <= 0 || bounds.height <= 0 || particles.length === 0) {
      return particles;
    }

    const maxSafeSize = Math.max(
      72,
      Math.min(104, (bounds.width - 8) / 2.65, bounds.height * 0.56),
    );
    const minSafeSize = Math.max(54, maxSafeSize - 50);
    const rawSizes = particles.map((particle) => particle.size);
    const rawMin = Math.min(...rawSizes);
    const rawMax = Math.max(...rawSizes);

    return particles.map((particle) => {
      const ratio = rawMax === rawMin ? 1 : (particle.size - rawMin) / (rawMax - rawMin);

      return {
        ...particle,
        size: minSafeSize + Math.pow(Math.max(ratio, 0), 1.18) * (maxSafeSize - minSafeSize),
      };
    });
  }, [bounds.height, bounds.width, particles]);
  const particleSignature = displayedParticles
    .map((particle) => `${particle.row.key}:${particle.size}`)
    .join('|');

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  function handleLayout(event: LayoutChangeEvent) {
    const { height, width } = event.nativeEvent.layout;

    setBounds((currentBounds) =>
      Math.round(currentBounds.width) === Math.round(width) &&
      Math.round(currentBounds.height) === Math.round(height)
        ? currentBounds
        : { height, width },
    );
  }

  useEffect(() => {
    if (bounds.width <= 0 || bounds.height <= 0 || displayedParticles.length === 0) {
      return;
    }

    particleStateRef.current = syncParticleState(
      particleStateRef.current,
      displayedParticles,
      bounds,
    );
    settleCategoryParticles(particleStateRef.current, bounds);
    particleStateRef.current.forEach((particle, index) => {
      animatedPositions[index].setValue({ x: particle.x, y: particle.y });
    });
  }, [animatedPositions, bounds, displayedParticles, particleSignature]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let frame = 0;
    let lastFrameTime = Date.now();

    const tick = () => {
      const currentBounds = boundsRef.current;
      const currentParticles = particleStateRef.current;
      const now = Date.now();
      const frameDelta = Math.min((now - lastFrameTime) / 16.67, 2);
      lastFrameTime = now;

      if (currentBounds.width > 0 && currentBounds.height > 0 && currentParticles.length > 0) {
        const obstacles = categoryFixedObstacles(currentBounds);

        currentParticles.forEach((particle) => {
          const maxX = Math.max(currentBounds.width - particle.size, 0);
          const maxY = Math.max(currentBounds.height - particle.size, 0);

          particle.x += particle.vx * frameDelta;
          particle.y += particle.vy * frameDelta;

          if (particle.x <= 0) {
            particle.x = 0;
            particle.vx = Math.abs(particle.vx);
          } else if (particle.x >= maxX) {
            particle.x = maxX;
            particle.vx = -Math.abs(particle.vx);
          }

          if (particle.y <= 0) {
            particle.y = 0;
            particle.vy = Math.abs(particle.vy);
          } else if (particle.y >= maxY) {
            particle.y = maxY;
            particle.vy = -Math.abs(particle.vy);
          }
        });

        resolveObstacleCollisions(currentParticles, obstacles, currentBounds);
        resolveParticleCollisions(currentParticles, currentBounds);
        resolveObstacleCollisions(currentParticles, obstacles, currentBounds);
        resolveParticleCollisions(currentParticles, currentBounds);
        resolveObstacleCollisions(currentParticles, obstacles, currentBounds);
        currentParticles.forEach((particle, index) => {
          animatedPositions[index].setValue({ x: particle.x, y: particle.y });
        });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [animatedPositions, isActive]);

  return (
    <View onLayout={handleLayout} style={styles.categoryProgressField}>
      {bounds.width > 0 && bounds.height > 0
        ? displayedParticles.map(({ row, size }, index) => {
            const bubble = (
              <CategoryProgressBubble row={row} size={size} totalFlowMinor={totalFlowMinor} />
            );

            return (
              <Animated.View
                key={row.key}
                style={[
                  styles.categoryParticle,
                  {
                    height: size,
                    transform: [
                      { translateX: animatedPositions[index].x },
                      { translateY: animatedPositions[index].y },
                    ],
                    width: size,
                  },
                ]}
              >
                {onCategoryPress ? (
                  <Pressable
                    accessibilityLabel={`Abrir categoría ${row.label}`}
                    accessibilityRole="button"
                    onPress={(event) => {
                      event.stopPropagation();
                      onCategoryPress(row.category);
                    }}
                    style={({ pressed }) => [
                      styles.categoryProgressPressable,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    {bubble}
                  </Pressable>
                ) : (
                  bubble
                )}
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}

export function BalanceFocusCard({
  happyFacesClosedCount,
  happyFacesTotal,
  netBalanceMinor,
  onHappyFacesPress,
  periodChangeMinor,
  totalIOweMinor,
  totalOwedToMeMinor,
}: {
  readonly happyFacesClosedCount?: number;
  readonly happyFacesTotal?: number;
  readonly netBalanceMinor: number;
  readonly onHappyFacesPress?: () => void;
  readonly periodChangeMinor: number;
  readonly totalIOweMinor: number;
  readonly totalOwedToMeMinor: number;
}) {
  const tone = balanceTone(netBalanceMinor);
  const balanceVisual = toneVisual(tone);
  const shouldShowHappyFaces =
    happyFacesClosedCount !== undefined &&
    happyFacesTotal !== undefined &&
    onHappyFacesPress !== undefined;

  return (
    <SurfaceCard padding="lg" style={[styles.focusCard, styles.balanceFocusCard]}>
      <View style={styles.balanceFocusHeaderRow}>
        <View style={styles.balanceFocusTitleWrap}>
          <FocusCardTitle align="start">Balance</FocusCardTitle>
        </View>
        {shouldShowHappyFaces ? (
          <HappyFacesCounter
            closedCircleCount={happyFacesClosedCount}
            compact
            onPress={onHappyFacesPress}
            style={styles.balanceFocusHappyFacesCounter}
            totalFaces={happyFacesTotal}
            variant="reward"
          />
        ) : null}
      </View>
      <View style={styles.balanceHomeBody}>
        <View style={styles.homeBalanceHero}>
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            numberOfLines={1}
            style={[
              styles.homeBalanceAmount,
              balanceVisual ? { color: balanceVisual.accentColor } : null,
            ]}
          >
            {formatHomeBalanceCop(netBalanceMinor)}
          </AppText>
          <TrendChip amountMinor={periodChangeMinor} centered />
        </View>
        <View style={styles.homeBalanceMetricsRow}>
          <BalanceCarouselMetricItem amountMinor={totalIOweMinor} tone="negative" />
          <BalanceCarouselMetricItem amountMinor={totalOwedToMeMinor} tone="positive" />
        </View>
      </View>
    </SurfaceCard>
  );
}

export function PeopleFocusCard({
  lens,
  people,
}: {
  readonly lens: BalanceAnalyticsLens;
  readonly people: readonly BalanceAnalyticsPersonRowDto[];
}) {
  const progress = useLoopingProgress(5200);
  const visiblePeople = people.slice(0, 5);
  const floatPrimary = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -4, 0],
  });
  const floatSecondary = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-3, 3, -3],
  });

  return (
    <SurfaceCard padding="lg" style={[styles.focusCard, styles.visualFocusCard]}>
      <FocusCardTitle>Personas</FocusCardTitle>
      {visiblePeople.length === 0 ? (
        <EmptyCardState icon="people-outline" label="Todavía no hay actividad visible." />
      ) : (
        <View style={styles.peopleRankingScene}>
          <View pointerEvents="none" style={styles.peopleRankingGuide} />
          {visiblePeople.map((row, index) => {
            const swatch = VISUAL_SWATCHES[index % VISUAL_SWATCHES.length];
            const amountMinor = personLensAmount(row, lens);
            const visual = amountVisual(amountMinor);
            const size = Math.max(40, 62 - index * 4);
            const rowStyle = [
              styles.peopleRankOne,
              styles.peopleRankTwo,
              styles.peopleRankThree,
              styles.peopleRankFour,
              styles.peopleRankFive,
            ][index];
            const translateY = index % 2 === 0 ? floatPrimary : floatSecondary;

            return (
              <Animated.View
                key={row.key}
                style={[styles.peopleRankItem, rowStyle, { transform: [{ translateY }] }]}
              >
                <View style={[styles.peopleRankNumber, { borderColor: visual.color }]}>
                  <AppText style={[styles.peopleRankNumberText, { color: visual.color }]}>
                    {index + 1}
                  </AppText>
                </View>
                <View style={[styles.peopleRankAvatarRing, { borderColor: visual.color }]}>
                  <AppAvatar
                    fallbackBackgroundColor={swatch.soft}
                    fallbackTextColor={swatch.color}
                    imageUrl={null}
                    label={row.label}
                    size={size}
                  />
                </View>
                <View style={styles.peopleRankCopy}>
                  <View style={[styles.peopleRankValuePill, { backgroundColor: visual.soft }]}>
                    <AppText
                      adjustsFontSizeToFit
                      minimumFontScale={0.82}
                      numberOfLines={1}
                      style={[styles.peopleRankValue, { color: visual.color }]}
                    >
                      {signedFormatCompactCop(amountMinor)}
                    </AppText>
                  </View>
                  <AppText numberOfLines={1} style={styles.peopleRankName}>
                    {firstName(row.label)}
                  </AppText>
                </View>
              </Animated.View>
            );
          })}
        </View>
      )}
    </SurfaceCard>
  );
}

export function CategoriesFocusCard({
  categories,
  isActive = true,
  onCategoryPress,
  periodLabel,
}: {
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly isActive?: boolean;
  readonly onCategoryPress?: (category: BalanceAnalyticsCategoryRowDto['category']) => void;
  readonly periodLabel?: string;
}) {
  const visibleCategories = useMemo(
    () =>
      categories
        .filter((row) => row.category !== 'cycle' && categoryHasCurrentFlow(row))
        .slice(0, CATEGORY_PARTICLE_LIMIT),
    [categories],
  );
  const totalFlowMinor = Math.max(
    visibleCategories.reduce((total, row) => total + categoryFlowAmount(row), 0),
    1,
  );
  const maxCategoryFlowMinor = Math.max(
    ...visibleCategories.map((row) => categoryFlowAmount(row)),
    1,
  );
  const particles = useMemo(
    () =>
      visibleCategories.map((row) => ({
        row,
        size: categoryParticleSize(row, maxCategoryFlowMinor),
      })),
    [maxCategoryFlowMinor, visibleCategories],
  );

  return (
    <SurfaceCard
      padding="lg"
      style={[styles.focusCard, styles.visualFocusCard, styles.categoryFocusCard]}
    >
      <View style={styles.categoryUniverse}>
        <View pointerEvents="none" style={styles.categoryFixedHeader}>
          <FocusCardTitle align="start" subtitle={periodLabel}>
            Categorías
          </FocusCardTitle>
        </View>
        {visibleCategories.length === 0 ? (
          <View style={styles.categoryUniverseEmptyState}>
            <EmptyCardState icon="pricetags-outline" label="Todavía no hay categorías activas." />
          </View>
        ) : (
          <View style={styles.categoryProgressFrame}>
            <CategoryParticleField
              isActive={isActive}
              onCategoryPress={onCategoryPress}
              particles={particles}
              totalFlowMinor={totalFlowMinor}
            />
          </View>
        )}
      </View>
    </SurfaceCard>
  );
}

type CircleStageTone = 'needs_me' | 'new' | 'waiting' | 'ready';

type CircleStageItem = {
  readonly isNew: boolean;
  readonly key: string;
  readonly priority: number;
  readonly proposal: ActiveSettlementPreviewDto;
  readonly tone: CircleStageTone;
};

const CIRCLE_STAGE_RING_SIZE = 224;
const CIRCLE_STAGE_IDLE_PARTICIPANTS: readonly HappyCircleRingParticipant[] = [
  { decision: 'pending', label: 'Happy', userId: 'circle-stage-idle:0' },
  { decision: 'pending', label: 'Happy', userId: 'circle-stage-idle:1' },
  { decision: 'pending', label: 'Happy', userId: 'circle-stage-idle:2' },
  { decision: 'pending', label: 'Happy', userId: 'circle-stage-idle:3' },
  { decision: 'pending', label: 'Happy', userId: 'circle-stage-idle:4' },
];

function proposalStageTone(
  proposal: ActiveSettlementPreviewDto,
  currentUserId: string | null | undefined,
  isNew: boolean,
): CircleStageTone {
  const myDecision = currentUserId
    ? proposal.participantDecisions.find((participant) => participant.userId === currentUserId)
        ?.decision
    : null;
  const presentation = resolveHappyCirclePresentation({
    approvalsPending: proposal.approvalsPending,
    myDecision,
    status: proposal.status,
  });

  if (presentation.key === 'pending_own') {
    return 'needs_me';
  }

  if (isNew) {
    return 'new';
  }

  if (presentation.key === 'approved') {
    return 'ready';
  }

  return 'waiting';
}

function circleStagePriority(tone: CircleStageTone, isNew: boolean): number {
  if (tone === 'needs_me') {
    return 0;
  }

  if (isNew || tone === 'new') {
    return 1;
  }

  if (tone === 'ready') {
    return 2;
  }

  if (tone === 'waiting') {
    return 3;
  }

  return 4;
}

function buildCircleStageItem(
  proposal: ActiveSettlementPreviewDto,
  currentUserId: string | null | undefined,
  newCircleProposalIds: ReadonlySet<string> | undefined,
): CircleStageItem {
  const isNew = Boolean(newCircleProposalIds?.has(proposal.proposalId));
  const tone = proposalStageTone(proposal, currentUserId, isNew);

  return {
    isNew,
    key: proposal.proposalId,
    priority: circleStagePriority(tone, isNew),
    proposal,
    tone,
  };
}

function fallbackRingDecision(proposal: ActiveSettlementPreviewDto): 'approved' | 'pending' {
  return proposal.status === 'approved' ? 'approved' : 'pending';
}

function anonymizedCircleParticipants(
  proposal: ActiveSettlementPreviewDto,
  currentUserId: string | null | undefined,
): readonly HappyCircleRingParticipant[] {
  const fallbackDecision = fallbackRingDecision(proposal);
  const currentParticipant = currentUserId
    ? proposal.participantDecisions.find((participant) => participant.userId === currentUserId)
    : undefined;
  const nodes: HappyCircleRingParticipant[] = [];

  if (currentParticipant) {
    nodes.push({
      decision: currentParticipant.decision,
      label: 'Tú',
      userId: currentParticipant.userId,
    });
  }

  for (const participant of proposal.participantDecisions) {
    if (participant.userId === currentParticipant?.userId || nodes.length >= 5) {
      continue;
    }

    nodes.push({
      decision: participant.decision,
      label: 'Happy',
      userId: participant.userId,
    });
  }

  while (nodes.length < 5) {
    nodes.push({
      decision: fallbackDecision,
      label: 'Happy',
      userId: `${proposal.proposalId}:anonymous:${nodes.length}`,
    });
  }

  return nodes;
}

function CircleStageActiveGraph({
  activeCount,
  counterRotation,
  currentUserId,
  needsMeCount,
  orbitRotation,
  pulse,
  proposal,
}: {
  readonly activeCount: number;
  readonly counterRotation: Animated.AnimatedInterpolation<string>;
  readonly currentUserId?: string | null;
  readonly needsMeCount: number;
  readonly orbitRotation: Animated.AnimatedInterpolation<string>;
  readonly pulse: Animated.AnimatedInterpolation<number>;
  readonly proposal: ActiveSettlementPreviewDto;
}) {
  const activeTheme = useAppTheme();
  const participants = anonymizedCircleParticipants(proposal, currentUserId);
  const centerLabel =
    activeCount > 1 ? String(activeCount) : formatCompactCop(proposal.personalAmountMinor);
  const centerSubLabel =
    needsMeCount > 0 ? 'por responder' : activeCount > 1 ? 'activos' : 'a solucionar';

  return (
    <Animated.View style={[styles.circleStageGraph, { transform: [{ scale: pulse }] }]}>
      <HappyCircleRing
        animatePendingFaces
        centerColor={activeTheme.colors.cycle}
        centerLabel={centerLabel}
        centerSubLabel={centerSubLabel}
        decisions={participants}
        nodeCounterRotation={counterRotation}
        orbitRotation={orbitRotation}
        ringSize={CIRCLE_STAGE_RING_SIZE}
        showLabels={false}
        style={styles.circleStageRing}
      />
    </Animated.View>
  );
}

function CircleStageIdleGraph({
  counterRotation,
  orbitRotation,
  pulse,
}: {
  readonly counterRotation: Animated.AnimatedInterpolation<string>;
  readonly orbitRotation: Animated.AnimatedInterpolation<string>;
  readonly pulse: Animated.AnimatedInterpolation<number>;
}) {
  const activeTheme = useAppTheme();

  return (
    <Animated.View
      style={[
        styles.circleStageGraph,
        styles.circleStageIdleGraph,
        { transform: [{ scale: pulse }] },
      ]}
    >
      <HappyCircleRing
        animatePendingFaces
        centerColor={activeTheme.colors.textMuted}
        centerLabel="0"
        centerSubLabel="activos"
        decisions={CIRCLE_STAGE_IDLE_PARTICIPANTS}
        nodeCounterRotation={counterRotation}
        orbitRotation={orbitRotation}
        ringSize={CIRCLE_STAGE_RING_SIZE}
        showContinuation={false}
        showLabels={false}
        style={styles.circleStageRing}
      />
    </Animated.View>
  );
}

export function SettlementsFocusCard({
  activeProposals = [],
  currentUserId,
  newCircleProposalIds,
}: {
  readonly activeProposals?: readonly ActiveSettlementPreviewDto[];
  readonly changeRatio: number | null;
  readonly closedCircleCount?: number;
  readonly currentUserId?: string | null;
  readonly newCircleProposalIds?: ReadonlySet<string>;
  readonly resolvedMinor: number;
}) {
  const activeTheme = useAppTheme();
  const progress = useLoopingProgress(6200);
  const orbitProgress = useLoopingProgress(26000);
  const pulse = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.04, 1],
  });
  const orbitRotation = orbitProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const counterRotation = orbitProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });
  const prioritizedItems = activeProposals
    .map((proposal) => buildCircleStageItem(proposal, currentUserId, newCircleProposalIds))
    .sort((left, right) => left.priority - right.priority);
  const heroItem = prioritizedItems[0];
  const activeCount = prioritizedItems.length;
  const needsMeCount = prioritizedItems.filter((item) => item.tone === 'needs_me').length;
  const newCount = prioritizedItems.filter((item) => item.isNew).length;
  const hasNewCircles = newCount > 0;

  return (
    <SurfaceCard
      padding="none"
      style={[styles.focusCard, styles.visualFocusCard, styles.circleStageCard]}
      underlay={hasNewCircles ? <StateAuraLayer size="hero" variant="newCircle" /> : undefined}
    >
      <View style={styles.circleStageScene}>
        <View pointerEvents="none" style={styles.circleStageTitleDock}>
          <FocusCardTitle align="start">Circles</FocusCardTitle>
        </View>
        {heroItem ? (
          <CircleStageActiveGraph
            activeCount={activeCount}
            counterRotation={counterRotation}
            currentUserId={currentUserId}
            needsMeCount={needsMeCount}
            orbitRotation={orbitRotation}
            proposal={heroItem.proposal}
            pulse={pulse}
          />
        ) : (
          <CircleStageIdleGraph
            counterRotation={counterRotation}
            orbitRotation={orbitRotation}
            pulse={pulse}
          />
        )}
        {needsMeCount > 0 ? (
          <View pointerEvents="none" style={styles.circleStageCalloutDock}>
            <View
              style={[
                styles.circleStageCallout,
                {
                  backgroundColor: activeTheme.glass.flatMutedBackground,
                  borderColor: activeTheme.colors.cycleSoft,
                },
              ]}
            >
              <View
                style={[
                  styles.circleStageCalloutDot,
                  { backgroundColor: activeTheme.colors.cycle },
                ]}
              />
              <AppText
                numberOfLines={1}
                style={[styles.circleStageCalloutText, { color: activeTheme.colors.text }]}
              >
                Responder
              </AppText>
            </View>
          </View>
        ) : null}
      </View>
    </SurfaceCard>
  );
}
