import { Fragment } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { theme } from '@/lib/theme';

const APPROVED_COLOR = theme.colors.success;
const PENDING_COLOR = theme.colors.muted;
const REJECTED_COLOR = theme.colors.warning;

export type HappyCircleDecision = 'approved' | 'pending' | 'rejected';

export interface HappyCircleRingParticipant {
  readonly userId: string;
  readonly label: string;
  readonly decision: HappyCircleDecision;
}

export function happyCircleDecisionColor(decision: HappyCircleDecision): string {
  if (decision === 'approved') return APPROVED_COLOR;
  if (decision === 'rejected') return REJECTED_COLOR;
  return PENDING_COLOR;
}

export function HappyCircleFaceIcon({
  decision,
  size,
}: {
  readonly decision: HappyCircleDecision;
  readonly size: number;
}) {
  const color = happyCircleDecisionColor(decision);
  const strokeWidth = 1.5;

  if (decision === 'approved') {
    return (
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        <Circle cx={12} cy={12} fill="none" r={10} stroke={color} strokeWidth={strokeWidth} />
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
        <Circle cx={12} cy={12} fill="none" r={10} stroke={color} strokeWidth={strokeWidth} />
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
      <Circle cx={12} cy={12} fill="none" r={10} stroke={color} strokeWidth={strokeWidth} />
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
  totalCount,
  ringSize,
}: {
  readonly decision: HappyCircleDecision;
  readonly index: number;
  readonly label: string;
  readonly totalCount: number;
  readonly ringSize: number;
}) {
  const nodeSize = 40;
  const radius = ringSize / 2;
  const arcRadius = radius - 16;
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / totalCount;

  const centerX = radius + arcRadius * Math.cos(angle) - nodeSize / 2;
  const centerY = radius + arcRadius * Math.sin(angle) - nodeSize / 2;

  const labelWidth = 80;
  const labelX = centerX + nodeSize / 2;
  const labelY = centerY + nodeSize + 3;

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
        <HappyCircleFaceIcon decision={decision} size={nodeSize} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: labelX - labelWidth / 2,
          top: labelY,
          width: labelWidth,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text numberOfLines={1} style={styles.nodeLabel}>
          {displayLabel}
        </Text>
      </View>
    </Fragment>
  );
}

function CircleArcs({
  decisions,
  ringSize,
}: {
  readonly decisions: readonly { readonly decision: HappyCircleDecision }[];
  readonly ringSize: number;
}) {
  const participantCount = decisions.length;
  if (participantCount < 2) return null;

  const radius = ringSize / 2;
  const arcRadius = radius - 16;
  const strokeWidth = 8;
  const gap = 0.5;

  return (
    <Svg height={ringSize} style={{ position: 'absolute' }} width={ringSize}>
      {decisions.map((participant, index) => {
        const angle1 = -Math.PI / 2 + (2 * Math.PI * index) / participantCount;
        const angle2 = -Math.PI / 2 + (2 * Math.PI * (index + 1)) / participantCount;

        const startAngle = angle1 + gap;
        const endAngle = angle2 - gap;

        if (startAngle >= endAngle) return null;

        const x1 = radius + arcRadius * Math.cos(startAngle);
        const y1 = radius + arcRadius * Math.sin(startAngle);
        const x2 = radius + arcRadius * Math.cos(endAngle);
        const y2 = radius + arcRadius * Math.sin(endAngle);

        const color1 = happyCircleDecisionColor(participant.decision);
        const color2 = happyCircleDecisionColor(decisions[(index + 1) % participantCount].decision);

        const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
        const path = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${x2} ${y2}`;
        const gradientId = `grad-${index}`;

        return (
          <Fragment key={index}>
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
      })}
    </Svg>
  );
}

export function HappyCircleRing({
  decisions,
  ringSize,
  style,
}: {
  readonly decisions: readonly HappyCircleRingParticipant[];
  readonly ringSize: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.ringContainer, { width: ringSize, height: ringSize }, style]}>
      <CircleArcs decisions={decisions} ringSize={ringSize} />

      {decisions.map((participant, index) => (
        <ParticipantNode
          decision={participant.decision}
          index={index}
          key={participant.userId}
          label={participant.label}
          ringSize={ringSize}
          totalCount={decisions.length}
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
  },
  nodeLabel: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    maxWidth: 56,
    textAlign: 'center',
  },
});
