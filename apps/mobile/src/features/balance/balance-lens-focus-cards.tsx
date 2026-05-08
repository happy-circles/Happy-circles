import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Easing, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import type {
  BalanceAnalyticsCategoryRowDto,
  BalanceAnalyticsLens,
  BalanceAnalyticsPersonRowDto,
} from '@happy-circles/application';

import { AppAvatar } from '@/components/app-avatar';
import { AppText } from '@/components/app-text';
import { HappyFacesCounter } from '@/components/happy-faces-counter';
import { SurfaceCard } from '@/components/surface-card';
import { formatCop } from '@/lib/data';
import { toneVisual } from '@/lib/direction-ui';
import { theme } from '@/lib/theme';
import {
  transactionCategoryBackgroundColor,
  transactionCategoryColor,
  transactionCategoryIcon,
} from '@/lib/transaction-categories';
import {
  amountTone,
  balanceTone,
  firstName,
  formatCompactCop,
  formatHomeBalanceCop,
  personLensAmount,
  signedFormatCompactCop,
} from './balance-helpers';
import { balanceOverviewStyles as styles } from './balance-overview-screen.styles';

const VISUAL_SWATCHES = [
  { color: '#3dba6e', soft: '#e8f8ef' },
  { color: '#e8604a', soft: '#fceae7' },
  { color: '#2563eb', soft: '#eaf1ff' },
  { color: '#7c3aed', soft: '#f0eaff' },
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

function FocusCardTitle({ children }: { readonly children: string }) {
  return (
    <View style={styles.focusCardHeader}>
      <AppText numberOfLines={1} style={styles.focusCardTitle}>
        {children}
      </AppText>
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
  const visual = toneVisual(tone);

  if (!visual) {
    return null;
  }

  return (
    <View style={styles.balanceMetricItem}>
      <Ionicons color={visual.accentColor} name={visual.icon} size={18} />
      <AppText numberOfLines={1} style={[styles.balanceMetricLabel, { color: visual.accentColor }]}>
        {visual.label}
      </AppText>
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
            style={[styles.categoryProgressInnerValue, { color: netColor }]}
          >
            {signedFormatCompactCop(row.netMinor)}
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
  const categoryFlowMinor = Math.abs(row.iOweMinor) + Math.abs(row.owedToMeMinor);
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
  const titleHalfWidth = Math.min(56, Math.max(44, bounds.width * 0.17));
  const titleCenterY = 14;

  return [
    {
      radius: 20,
      x1: bounds.width / 2 - titleHalfWidth,
      x2: bounds.width / 2 + titleHalfWidth,
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
  onCategoryPress,
  particles,
  totalFlowMinor,
}: {
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
  }, [animatedPositions]);

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
                    accessibilityLabel={`Abrir categoria ${row.label}`}
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
          <FocusCardTitle>Balance actual</FocusCardTitle>
        </View>
        {shouldShowHappyFaces ? (
          <HappyFacesCounter
            closedCircleCount={happyFacesClosedCount}
            compact
            onPress={onHappyFacesPress}
            style={styles.balanceFocusHappyFacesCounter}
            totalFaces={happyFacesTotal}
          />
        ) : null}
      </View>
      <View style={styles.balanceHomeBody}>
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
        <EmptyCardState icon="people-outline" label="Todavia no hay actividad visible." />
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
  onCategoryPress,
}: {
  readonly categories: readonly BalanceAnalyticsCategoryRowDto[];
  readonly onCategoryPress?: (category: BalanceAnalyticsCategoryRowDto['category']) => void;
}) {
  const visibleCategories = useMemo(
    () => categories.filter((row) => row.category !== 'cycle').slice(0, CATEGORY_PARTICLE_LIMIT),
    [categories],
  );
  const totalFlowMinor = Math.max(
    visibleCategories.reduce(
      (total, row) => total + Math.abs(row.iOweMinor) + Math.abs(row.owedToMeMinor),
      0,
    ),
    1,
  );
  const maxCategoryFlowMinor = Math.max(
    ...visibleCategories.map((row) => Math.abs(row.iOweMinor) + Math.abs(row.owedToMeMinor)),
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
          <FocusCardTitle>Categorias</FocusCardTitle>
        </View>
        {visibleCategories.length === 0 ? (
          <View style={styles.categoryUniverseEmptyState}>
            <EmptyCardState icon="pricetags-outline" label="Todavia no hay categorias activas." />
          </View>
        ) : (
          <View style={styles.categoryProgressFrame}>
            <CategoryParticleField
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

export function SettlementsFocusCard({
  activeCount,
  changeRatio,
  movementCount,
  resolvedMinor,
  savedMovementsCount,
}: {
  readonly activeCount: number;
  readonly changeRatio: number | null;
  readonly movementCount: number;
  readonly resolvedMinor: number;
  readonly savedMovementsCount: number;
}) {
  const progress = useLoopingProgress(7800);
  const orbitRotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const pulse = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.035, 1],
  });
  const flowTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-76, 76],
  });
  const flowOpacity = progress.interpolate({
    inputRange: [0, 0.18, 0.78, 1],
    outputRange: [0, 1, 1, 0],
  });
  const trendTone =
    changeRatio === null
      ? 'neutral'
      : changeRatio > 0
        ? 'positive'
        : changeRatio < 0
          ? 'negative'
          : 'neutral';
  const beforeNodes = [
    { fill: theme.colors.warningSoft, x: 24, y: 30 },
    { fill: theme.colors.brandCoral, x: 62, y: 64 },
    { fill: theme.colors.warningSoft, x: 94, y: 96 },
  ] as const;
  const afterNodes = [
    { x: 190, y: 45 },
    { x: 252, y: 88 },
  ] as const;

  return (
    <SurfaceCard padding="lg" style={[styles.focusCard, styles.visualFocusCard]}>
      <FocusCardTitle>Happy Circles</FocusCardTitle>
      <View style={styles.simplifyScene}>
        <Svg height={138} style={styles.simplifySvg} width={280}>
          <Line
            stroke={theme.colors.warning}
            strokeLinecap="round"
            strokeOpacity={0.4}
            strokeWidth={2}
            x1={24}
            x2={90}
            y1={30}
            y2={94}
          />
          <Line
            stroke={theme.colors.warning}
            strokeLinecap="round"
            strokeOpacity={0.28}
            strokeWidth={2}
            x1={32}
            x2={86}
            y1={98}
            y2={28}
          />
          <Line
            stroke={theme.colors.warning}
            strokeLinecap="round"
            strokeOpacity={0.34}
            strokeWidth={2}
            x1={18}
            x2={102}
            y1={64}
            y2={62}
          />
          <Line
            stroke={theme.colors.success}
            strokeLinecap="round"
            strokeOpacity={0.56}
            strokeWidth={3}
            x1={188}
            x2={252}
            y1={45}
            y2={45}
          />
          <Line
            stroke={theme.colors.success}
            strokeLinecap="round"
            strokeOpacity={0.38}
            strokeWidth={3}
            x1={188}
            x2={252}
            y1={88}
            y2={88}
          />
          {beforeNodes.map((node) => (
            <Circle
              cx={node.x}
              cy={node.y}
              fill={node.fill}
              key={`before-${node.x}`}
              r={8}
              stroke={theme.colors.surface}
              strokeWidth={2}
            />
          ))}
          {afterNodes.map((node) => (
            <Circle
              cx={node.x}
              cy={node.y}
              fill={theme.colors.successSoft}
              key={`after-${node.x}`}
              r={9}
              stroke={theme.colors.success}
              strokeWidth={2}
            />
          ))}
        </Svg>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.simplifyFlowDot,
            {
              opacity: flowOpacity,
              transform: [{ translateX: flowTranslateX }, { rotate: orbitRotation }],
            },
          ]}
        />
        <Animated.View style={[styles.simplifyScoreBubble, { transform: [{ scale: pulse }] }]}>
          <AppText style={styles.simplifyScoreValue}>{savedMovementsCount}</AppText>
          <AppText numberOfLines={1} style={styles.simplifyScoreLabel}>
            ahorrados
          </AppText>
        </Animated.View>
        <AppText
          numberOfLines={1}
          style={[
            styles.simplifyResolvedAmount,
            trendTone === 'positive' ? styles.positiveText : null,
            trendTone === 'negative' ? styles.negativeText : null,
          ]}
        >
          {formatCompactCop(resolvedMinor)} resuelto
        </AppText>
      </View>
      <View style={styles.visualMetricRow}>
        <View style={styles.visualMetricBubble}>
          <Ionicons color={theme.colors.brandGreen} name="swap-horizontal-outline" size={17} />
          <AppText style={styles.visualMetricValue}>{savedMovementsCount}</AppText>
        </View>
        <View style={styles.visualMetricBubble}>
          <Ionicons color={theme.colors.brandNavy} name="radio-button-on-outline" size={17} />
          <AppText style={styles.visualMetricValue}>{activeCount}</AppText>
        </View>
        <View style={styles.visualMetricBubble}>
          <Ionicons color={theme.colors.brandCoral} name="checkmark-circle-outline" size={17} />
          <AppText style={styles.visualMetricValue}>{movementCount}</AppText>
        </View>
      </View>
    </SurfaceCard>
  );
}
