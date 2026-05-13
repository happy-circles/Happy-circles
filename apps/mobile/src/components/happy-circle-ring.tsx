import { Fragment, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { getRuntimeTheme, theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';
export const HAPPY_CIRCLE_STANDARD_NODE_COUNT = 5;
const HAPPY_CIRCLE_ANONYMOUS_LABEL = 'Happy';

export type HappyCircleDecision = 'approved' | 'pending' | 'rejected';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const PENDING_FACE_CYCLE_DURATION_MS = 7800;

export interface HappyCircleRingParticipant {
  readonly userId: string;
  readonly label: string;
  readonly decision: HappyCircleDecision;
}

export function happyCircleDecisionColor(decision: HappyCircleDecision): string {
  const activeTheme = getRuntimeTheme();

  if (decision === 'approved') return activeTheme.colors.success;
  if (decision === 'rejected') return activeTheme.colors.danger;
  return activeTheme.colors.cycle;
}

function anonymousHappyParticipant(
  key: string,
  decision: HappyCircleDecision,
): HappyCircleRingParticipant {
  return {
    decision,
    label: HAPPY_CIRCLE_ANONYMOUS_LABEL,
    userId: key,
  };
}

export function standardHappyCircleParticipants(
  decisions: readonly HappyCircleRingParticipant[],
  currentUserId: string | null | undefined,
  fallbackDecision: HappyCircleDecision = 'pending',
): readonly HappyCircleRingParticipant[] {
  const currentParticipant =
    decisions.find((participant) => participant.userId === currentUserId) ??
    anonymousHappyParticipant('happy-circle:self', fallbackDecision);
  const hiddenParticipants = decisions.filter(
    (participant) => participant.userId !== currentParticipant.userId,
  );
  const nodes: HappyCircleRingParticipant[] = [
    {
      ...currentParticipant,
      label: 'Tu',
    },
  ];

  for (const participant of hiddenParticipants) {
    if (nodes.length >= HAPPY_CIRCLE_STANDARD_NODE_COUNT) {
      break;
    }

    nodes.push({
      ...participant,
      label: HAPPY_CIRCLE_ANONYMOUS_LABEL,
    });
  }

  while (nodes.length < HAPPY_CIRCLE_STANDARD_NODE_COUNT) {
    nodes.push(anonymousHappyParticipant(`happy-circle:hidden:${nodes.length}`, fallbackDecision));
  }

  return nodes;
}

function fallbackDecisionForRing(
  decisions: readonly Pick<HappyCircleRingParticipant, 'decision'>[],
): HappyCircleDecision {
  if (decisions.some((participant) => participant.decision === 'rejected')) {
    return 'rejected';
  }

  if (decisions.some((participant) => participant.decision === 'pending')) {
    return 'pending';
  }

  return 'approved';
}

function normalizedRingParticipants(
  decisions: readonly HappyCircleRingParticipant[],
): readonly HappyCircleRingParticipant[] {
  const fallbackDecision = fallbackDecisionForRing(decisions);
  const nodes = decisions.slice(0, HAPPY_CIRCLE_STANDARD_NODE_COUNT);

  while (nodes.length < HAPPY_CIRCLE_STANDARD_NODE_COUNT) {
    nodes.push(anonymousHappyParticipant(`happy-circle:auto:${nodes.length}`, fallbackDecision));
  }

  return nodes;
}

export function HappyCircleFaceIcon({
  backgroundColor = 'transparent',
  decision,
  size,
}: {
  readonly backgroundColor?: string;
  readonly decision: HappyCircleDecision;
  readonly size: number;
}) {
  const color = happyCircleDecisionColor(decision);
  const strokeWidth = 1.5;
  const mouthPath =
    decision === 'approved'
      ? 'M 7.5 14.2 Q 12 17.8 16.5 14.2'
      : decision === 'rejected'
        ? 'M 7.5 16.2 Q 12 13.9 16.5 16.2'
        : 'M 8 15 L 16 15';

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Circle
        cx={12}
        cy={12}
        fill={backgroundColor}
        r={10}
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Circle cx={8.5} cy={9.5} fill={color} r={1.5} />
      <Circle cx={15.5} cy={9.5} fill={color} r={1.5} />
      <Path
        d={mouthPath}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}

function usePendingFaceCycleProgress(isActive: boolean) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActive) {
      progress.setValue(0);
      return;
    }

    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        duration: PENDING_FACE_CYCLE_DURATION_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [isActive, progress]);

  return progress;
}

function pendingDecisionCycleOpacities(progress: Animated.Value) {
  return {
    approvedOpacity: progress.interpolate({
      inputRange: [0, 0.22, 0.32, 0.5, 0.6, 1],
      outputRange: [0, 0, 1, 1, 0, 0],
    }),
    pendingOpacity: progress.interpolate({
      inputRange: [0, 0.22, 0.32, 0.84, 0.94, 1],
      outputRange: [1, 1, 0, 0, 1, 1],
    }),
    rejectedOpacity: progress.interpolate({
      inputRange: [0, 0.5, 0.6, 0.84, 0.94, 1],
      outputRange: [0, 0, 1, 1, 0, 0],
    }),
  };
}

function CyclingPendingFaceIcon({
  progress,
  size,
}: {
  readonly progress: Animated.Value;
  readonly size: number;
}) {
  const { approvedOpacity, pendingOpacity, rejectedOpacity } =
    pendingDecisionCycleOpacities(progress);

  return (
    <View style={{ height: size, width: size }}>
      <Animated.View style={[styles.faceCycleIcon, { opacity: pendingOpacity }]}>
        <HappyCircleFaceIcon decision="pending" size={size} />
      </Animated.View>
      <Animated.View style={[styles.faceCycleIcon, { opacity: approvedOpacity }]}>
        <HappyCircleFaceIcon decision="approved" size={size} />
      </Animated.View>
      <Animated.View style={[styles.faceCycleIcon, { opacity: rejectedOpacity }]}>
        <HappyCircleFaceIcon decision="rejected" size={size} />
      </Animated.View>
    </View>
  );
}

function CyclingPendingArc({
  path,
  progress,
  strokeWidth,
}: {
  readonly path: string;
  readonly progress: Animated.Value;
  readonly strokeWidth: number;
}) {
  const { approvedOpacity, pendingOpacity, rejectedOpacity } =
    pendingDecisionCycleOpacities(progress);

  return (
    <Fragment>
      <AnimatedPath
        d={path}
        fill="none"
        opacity={pendingOpacity}
        stroke={happyCircleDecisionColor('pending')}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
      <AnimatedPath
        d={path}
        fill="none"
        opacity={approvedOpacity}
        stroke={happyCircleDecisionColor('approved')}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
      <AnimatedPath
        d={path}
        fill="none"
        opacity={rejectedOpacity}
        stroke={happyCircleDecisionColor('rejected')}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </Fragment>
  );
}

function ParticipantNode({
  decision,
  index,
  label,
  counterRotation,
  pendingFaceProgress,
  showLabel,
  totalCount,
  ringSize,
}: {
  readonly counterRotation?: Animated.AnimatedInterpolation<string> | string;
  readonly decision: HappyCircleDecision;
  readonly index: number;
  readonly label: string;
  readonly pendingFaceProgress?: Animated.Value;
  readonly showLabel: boolean;
  readonly totalCount: number;
  readonly ringSize: number;
}) {
  const activeTheme = useAppTheme();
  const nodeSize = 40;
  const radius = ringSize / 2;
  const arcRadius = radius - 16;
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / totalCount;

  const centerX = radius + arcRadius * Math.cos(angle) - nodeSize / 2;
  const centerY = radius + arcRadius * Math.sin(angle) - nodeSize / 2;

  const labelWidth = 72;
  const labelX = centerX + nodeSize / 2;
  const labelY = centerY + nodeSize + (Math.sin(angle) < -0.75 ? 4 : 7);
  const labelShiftX = Math.abs(Math.cos(angle)) > 0.25 ? Math.sign(Math.cos(angle)) * 10 : 0;

  const displayLabel = label.split(/\s+/)[0] ?? label;

  return (
    <Fragment>
      <View
        style={[
          styles.nodeContainer,
          {
            left: centerX,
            top: centerY,
            width: nodeSize,
            height: nodeSize,
          },
        ]}
      >
        <Animated.View
          style={counterRotation ? { transform: [{ rotate: counterRotation }] } : undefined}
        >
          {decision === 'pending' && pendingFaceProgress ? (
            <CyclingPendingFaceIcon progress={pendingFaceProgress} size={nodeSize} />
          ) : (
            <HappyCircleFaceIcon decision={decision} size={nodeSize} />
          )}
        </Animated.View>
      </View>
      {showLabel ? (
        <View
          style={{
            position: 'absolute',
            left: labelX - labelWidth / 2 + labelShiftX,
            top: labelY,
            width: labelWidth,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText
            numberOfLines={1}
            style={[
              styles.nodeLabel,
              {
                backgroundColor: activeTheme.colors.floatingSurface,
                color: activeTheme.colors.text,
              },
            ]}
          >
            {displayLabel}
          </AppText>
        </View>
      ) : null}
    </Fragment>
  );
}

function CircleArcs({
  decisions,
  pendingFaceProgress,
  ringSize,
  splitContinuationArc,
}: {
  readonly decisions: readonly { readonly decision: HappyCircleDecision }[];
  readonly pendingFaceProgress?: Animated.Value;
  readonly ringSize: number;
  readonly splitContinuationArc: boolean;
}) {
  const participantCount = decisions.length;
  if (participantCount < 2) return null;

  const radius = ringSize / 2;
  const arcRadius = radius - 16;
  const strokeWidth = 8;

  return (
    <Svg height={ringSize} style={{ position: 'absolute' }} width={ringSize}>
      {decisions.flatMap((participant, index) => {
        const angle1 = -Math.PI / 2 + (2 * Math.PI * index) / participantCount;
        const angle2 = -Math.PI / 2 + (2 * Math.PI * (index + 1)) / participantCount;
        const shouldSplitArc = splitContinuationArc && participantCount === 5 && index === 2;
        const arcGap = shouldSplitArc ? 0.16 : 0.28;

        const startAngle = angle1 + arcGap;
        const endAngle = angle2 - arcGap;

        const segmentColor = happyCircleDecisionColor(participant.decision);
        const segmentCount = shouldSplitArc ? 3 : 1;
        const totalAngle = endAngle - startAngle;

        if (startAngle >= endAngle) return [];

        return Array.from({ length: segmentCount }, (_, segmentIndex) => {
          const segmentGap = shouldSplitArc ? 0.055 : 0;
          const segmentStart = startAngle + (totalAngle * segmentIndex) / segmentCount + segmentGap;
          const segmentEnd =
            startAngle + (totalAngle * (segmentIndex + 1)) / segmentCount - segmentGap;

          if (segmentStart >= segmentEnd) return null;

          const x1 = radius + arcRadius * Math.cos(segmentStart);
          const y1 = radius + arcRadius * Math.sin(segmentStart);
          const x2 = radius + arcRadius * Math.cos(segmentEnd);
          const y2 = radius + arcRadius * Math.sin(segmentEnd);

          const largeArc = segmentEnd - segmentStart > Math.PI ? 1 : 0;
          const path = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${x2} ${y2}`;

          if (participant.decision === 'pending' && pendingFaceProgress) {
            return (
              <CyclingPendingArc
                key={`${index}:${segmentIndex}`}
                path={path}
                progress={pendingFaceProgress}
                strokeWidth={strokeWidth}
              />
            );
          }

          return (
            <Path
              d={path}
              fill="none"
              key={`${index}:${segmentIndex}`}
              stroke={segmentColor}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
            />
          );
        });
      })}
    </Svg>
  );
}

export function HappyCircleRing({
  animatePendingFaces = false,
  centerColor = theme.colors.primary,
  centerLabel,
  centerSubLabel,
  decisions,
  nodeCounterRotation,
  orbitRotation,
  ringSize,
  showContinuation = true,
  showLabels = true,
  style,
}: {
  readonly animatePendingFaces?: boolean;
  readonly centerColor?: string;
  readonly centerLabel?: string | null;
  readonly centerSubLabel?: string | null;
  readonly decisions: readonly HappyCircleRingParticipant[];
  readonly nodeCounterRotation?: Animated.AnimatedInterpolation<string> | string;
  readonly orbitRotation?: Animated.AnimatedInterpolation<string> | string;
  readonly ringSize: number;
  readonly showContinuation?: boolean;
  readonly showLabels?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const activeTheme = useAppTheme();
  const pendingFaceProgress = usePendingFaceCycleProgress(animatePendingFaces);
  const ringDecisions = normalizedRingParticipants(decisions);

  return (
    <View style={[styles.ringContainer, { width: ringSize, height: ringSize }, style]}>
      <Animated.View
        style={[
          styles.orbitLayer,
          orbitRotation ? { transform: [{ rotate: orbitRotation }] } : null,
        ]}
      >
        <CircleArcs
          decisions={ringDecisions}
          pendingFaceProgress={animatePendingFaces ? pendingFaceProgress : undefined}
          ringSize={ringSize}
          splitContinuationArc={showContinuation}
        />
        {ringDecisions.map((participant, index) => (
          <ParticipantNode
            counterRotation={nodeCounterRotation}
            decision={participant.decision}
            index={index}
            key={`${participant.userId}:${index}`}
            label={participant.label}
            pendingFaceProgress={animatePendingFaces ? pendingFaceProgress : undefined}
            ringSize={ringSize}
            showLabel={showLabels}
            totalCount={ringDecisions.length}
          />
        ))}
      </Animated.View>
      {centerLabel ? (
        <View
          style={[
            styles.centerBadge,
            {
              borderColor: `${centerColor}24`,
              maxWidth: Math.max(92, ringSize * 0.52),
            },
          ]}
        >
          <AppText
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={1}
            style={[styles.centerLabel, { color: centerColor }]}
          >
            {centerLabel}
          </AppText>
          {centerSubLabel ? (
            <AppText
              numberOfLines={1}
              style={[styles.centerSubLabel, { color: activeTheme.colors.textMuted }]}
            >
              {centerSubLabel}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ringContainer: {
    marginRight: theme.spacing.sm,
    position: 'relative',
  },
  orbitLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  faceCycleIcon: {
    ...StyleSheet.absoluteFillObject,
  },
  nodeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    zIndex: 2,
  },
  nodeLabel: {
    backgroundColor: theme.colors.floatingSurface,
    borderRadius: 8,
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 14,
    maxWidth: 66,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
    textAlign: 'center',
  },
  centerBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderRadius: theme.radius.medium,
    borderWidth: 0,
    gap: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -22 }],
    zIndex: 1,
  },
  centerLabel: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 21,
    textAlign: 'center',
  },
  centerSubLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
