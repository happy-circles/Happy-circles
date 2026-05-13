import { Fragment } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { getRuntimeTheme, theme } from '@/lib/theme';
import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/providers/theme-provider';
export const HAPPY_CIRCLE_STANDARD_NODE_COUNT = 5;
const HAPPY_CIRCLE_ANONYMOUS_LABEL = 'Happy';

export type HappyCircleDecision = 'approved' | 'pending' | 'rejected';

export interface HappyCircleRingParticipant {
  readonly userId: string;
  readonly label: string;
  readonly decision: HappyCircleDecision;
}

export function happyCircleDecisionColor(decision: HappyCircleDecision): string {
  const activeTheme = getRuntimeTheme();

  if (decision === 'approved') return activeTheme.colors.success;
  if (decision === 'rejected') return activeTheme.colors.warning;
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
  backgroundColor = theme.colors.surface,
  decision,
  size,
}: {
  readonly backgroundColor?: string;
  readonly decision: HappyCircleDecision;
  readonly size: number;
}) {
  const color = happyCircleDecisionColor(decision);
  const strokeWidth = 1.5;

  if (decision === 'approved') {
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
          d="M 7 14 Q 12 19 17 14"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </Svg>
    );
  }

  if (decision === 'rejected') {
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
        <Circle cx={8.5} cy={10} fill={color} r={1.5} />
        <Circle cx={15.5} cy={10} fill={color} r={1.5} />
        <Path
          d="M 7 17 Q 12 12 17 17"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </Svg>
    );
  }

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
      <Path d="M 8 15 L 16 15" stroke={color} strokeLinecap="round" strokeWidth={strokeWidth} />
    </Svg>
  );
}

function ParticipantNode({
  decision,
  index,
  label,
  showLabel,
  totalCount,
  ringSize,
}: {
  readonly decision: HappyCircleDecision;
  readonly index: number;
  readonly label: string;
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
        <HappyCircleFaceIcon
          backgroundColor={activeTheme.colors.surface}
          decision={decision}
          size={nodeSize}
        />
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
  ringSize,
  splitContinuationArc,
}: {
  readonly decisions: readonly { readonly decision: HappyCircleDecision }[];
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

        const color1 = happyCircleDecisionColor(participant.decision);
        const color2 = happyCircleDecisionColor(decisions[(index + 1) % participantCount].decision);
        const segmentCount = shouldSplitArc ? 3 : 1;
        const totalAngle = endAngle - startAngle;

        if (startAngle >= endAngle) return [];

        return Array.from({ length: segmentCount }, (_, segmentIndex) => {
          const segmentGap = shouldSplitArc ? 0.055 : 0;
          const segmentStart =
            startAngle + (totalAngle * segmentIndex) / segmentCount + segmentGap;
          const segmentEnd =
            startAngle + (totalAngle * (segmentIndex + 1)) / segmentCount - segmentGap;

          if (segmentStart >= segmentEnd) return null;

          const x1 = radius + arcRadius * Math.cos(segmentStart);
          const y1 = radius + arcRadius * Math.sin(segmentStart);
          const x2 = radius + arcRadius * Math.cos(segmentEnd);
          const y2 = radius + arcRadius * Math.sin(segmentEnd);

          const largeArc = segmentEnd - segmentStart > Math.PI ? 1 : 0;
          const path = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${x2} ${y2}`;
          const gradientId = `grad-${index}-${segmentIndex}`;

          return (
            <Fragment key={`${index}:${segmentIndex}`}>
              <Defs>
                <LinearGradient
                  gradientUnits="userSpaceOnUse"
                  id={gradientId}
                  x1={x1}
                  x2={x2}
                  y1={y1}
                  y2={y2}
                >
                  <Stop offset="0%" stopColor={color1} />
                  <Stop offset="100%" stopColor={color2} />
                </LinearGradient>
              </Defs>
              <Path
                d={path}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeLinecap="round"
                strokeWidth={strokeWidth}
              />
            </Fragment>
          );
        });
      })}
    </Svg>
  );
}

export function HappyCircleRing({
  centerColor = theme.colors.primary,
  centerLabel,
  centerSubLabel,
  decisions,
  ringSize,
  showContinuation = true,
  showLabels = true,
  style,
}: {
  readonly centerColor?: string;
  readonly centerLabel?: string | null;
  readonly centerSubLabel?: string | null;
  readonly decisions: readonly HappyCircleRingParticipant[];
  readonly ringSize: number;
  readonly showContinuation?: boolean;
  readonly showLabels?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const activeTheme = useAppTheme();
  const ringDecisions = normalizedRingParticipants(decisions);

  return (
    <View style={[styles.ringContainer, { width: ringSize, height: ringSize }, style]}>
      <CircleArcs
        decisions={ringDecisions}
        ringSize={ringSize}
        splitContinuationArc={showContinuation}
      />
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

      {ringDecisions.map((participant, index) => (
        <ParticipantNode
          decision={participant.decision}
          index={index}
          key={`${participant.userId}:${index}`}
          label={participant.label}
          ringSize={ringSize}
          showLabel={showLabels}
          totalCount={ringDecisions.length}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ringContainer: {
    marginRight: theme.spacing.sm,
    position: 'relative',
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
