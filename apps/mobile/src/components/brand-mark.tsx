import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

type BrandMarkSize = 'sm' | 'md' | 'lg';
type BrandMarkOrientation = 'horizontal' | 'stacked';
type BrandMarkTone = 'brand' | 'mono';

const SIZE_CONFIG = {
  sm: {
    glyph: 52,
    head: 5,
    triangleWidth: 10,
    triangleHeight: 14,
    orbit: 18,
    arcWidth: 12,
    arcHeight: 6,
    stroke: 2,
    dot: 5,
    title: theme.typography.callout,
    subtitle: theme.typography.caption,
  },
  md: {
    glyph: 74,
    head: 6,
    triangleWidth: 14,
    triangleHeight: 18,
    orbit: 26,
    arcWidth: 18,
    arcHeight: 9,
    stroke: 2.5,
    dot: 6,
    title: theme.typography.title3,
    subtitle: theme.typography.caption,
  },
  lg: {
    glyph: 132,
    head: 10,
    triangleWidth: 24,
    triangleHeight: 30,
    orbit: 46,
    arcWidth: 28,
    arcHeight: 14,
    stroke: 3,
    dot: 8,
    title: 34,
    subtitle: theme.typography.callout,
  },
} as const;

export interface BrandMarkProps {
  readonly size?: BrandMarkSize;
  readonly orientation?: BrandMarkOrientation;
  readonly style?: StyleProp<ViewStyle>;
  readonly tone?: BrandMarkTone;
}

function polarPosition(center: number, radius: number, angleDegrees: number, box: number) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    left: center + Math.cos(radians) * radius - box / 2,
    top: center + Math.sin(radians) * radius - box / 2,
  };
}

function ArcPair({
  angle,
  color,
  glyphSize,
  arcHeight,
  arcWidth,
  stroke,
}: {
  readonly angle: number;
  readonly color: string;
  readonly glyphSize: number;
  readonly arcHeight: number;
  readonly arcWidth: number;
  readonly stroke: number;
}) {
  const center = glyphSize / 2;
  const pairRadius = glyphSize * 0.36;
  const segmentBox = arcWidth + 6;
  const { left, top } = polarPosition(center, pairRadius, angle, segmentBox);

  return (
    <View
      style={[
        styles.arcPair,
        {
          left,
          top,
          transform: [{ rotate: `${angle + 90}deg` }],
          width: segmentBox,
          height: segmentBox,
        },
      ]}
    >
      <View
        style={[
          styles.arcSegment,
          {
            borderTopColor: color,
            borderTopWidth: stroke,
            height: arcHeight,
            width: arcWidth,
          },
        ]}
      />
      <View
        style={[
          styles.arcSegment,
          {
            borderTopColor: color,
            borderTopWidth: stroke,
            height: arcHeight,
            width: arcWidth,
          },
        ]}
      />
    </View>
  );
}

function PersonGlyph({
  angle,
  color,
  dotSize,
  glyphSize,
  headSize,
  triangleHeight,
  triangleWidth,
}: {
  readonly angle: number;
  readonly color: string;
  readonly dotSize: number;
  readonly glyphSize: number;
  readonly headSize: number;
  readonly triangleHeight: number;
  readonly triangleWidth: number;
}) {
  const center = glyphSize / 2;
  const personBox = Math.max(headSize + triangleHeight + 20, triangleWidth * 2 + 12);
  const orbit = glyphSize * 0.38;
  const { left, top } = polarPosition(center, orbit, angle, personBox);

  return (
    <View
      style={[
        styles.person,
        {
          height: personBox,
          left,
          top,
          transform: [{ rotate: `${angle + 90}deg` }],
          width: personBox,
        },
      ]}
    >
      <View
        style={[
          styles.outerDot,
          {
            backgroundColor: color,
            height: dotSize,
            left: personBox / 2 - dotSize / 2,
            top: 0,
            width: dotSize,
          },
        ]}
      />
      <View
        style={[
          styles.head,
          {
            backgroundColor: color,
            height: headSize,
            left: personBox / 2 - headSize / 2,
            top: dotSize + 6,
            width: headSize,
          },
        ]}
      />
      <View
        style={[
          styles.body,
          {
            borderLeftWidth: triangleWidth / 2,
            borderRightWidth: triangleWidth / 2,
            borderBottomColor: color,
            borderBottomWidth: triangleHeight,
            left: personBox / 2 - triangleWidth / 2,
            top: dotSize + headSize + 12,
          },
        ]}
      />
    </View>
  );
}

export function BrandMark({
  size = 'md',
  orientation = 'horizontal',
  style,
  tone = 'brand',
}: BrandMarkProps) {
  const config = SIZE_CONFIG[size];
  const isStacked = orientation === 'stacked';
  const color = tone === 'mono' ? '#111111' : theme.colors.primary;
  const subtitleColor = tone === 'mono' ? theme.colors.textMuted : theme.colors.textMuted;
  const center = config.glyph / 2;

  return (
    <View style={[styles.row, isStacked ? styles.rowStacked : null, style]}>
      <View style={{ height: config.glyph, width: config.glyph }}>
        {Array.from({ length: 5 }, (_, index) => {
          const angle = -90 + index * 72;
          return (
            <PersonGlyph
              key={`person-${angle}`}
              angle={angle}
              color={color}
              dotSize={config.dot}
              glyphSize={config.glyph}
              headSize={config.head}
              triangleHeight={config.triangleHeight}
              triangleWidth={config.triangleWidth}
            />
          );
        })}

        {Array.from({ length: 5 }, (_, index) => {
          const angle = -54 + index * 72;
          return (
            <ArcPair
              key={`arc-${angle}`}
              angle={angle}
              arcHeight={config.arcHeight}
              arcWidth={config.arcWidth}
              color={color}
              glyphSize={config.glyph}
              stroke={config.stroke}
            />
          );
        })}

        <View
          style={[
            styles.centerRing,
            {
              borderColor: 'rgba(17, 17, 17, 0.14)',
              height: config.glyph * 0.38,
              left: center - (config.glyph * 0.38) / 2,
              top: center - (config.glyph * 0.38) / 2,
              width: config.glyph * 0.38,
            },
          ]}
        />
      </View>

      <View style={[styles.copy, isStacked ? styles.copyStacked : null]}>
        <Text
          style={[
            styles.title,
            { color, fontSize: config.title },
            size === 'lg' ? styles.titleLarge : null,
            isStacked ? styles.titleStacked : null,
          ]}
        >
          Happy Circles
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: subtitleColor, fontSize: config.subtitle },
            isStacked ? styles.subtitleStacked : null,
          ]}
        >
          tu app de finanzas entre amigos
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowStacked: {
    flexDirection: 'column',
    gap: theme.spacing.lg,
    justifyContent: 'center',
  },
  person: {
    position: 'absolute',
  },
  outerDot: {
    borderRadius: theme.radius.pill,
    position: 'absolute',
  },
  head: {
    borderRadius: theme.radius.pill,
    position: 'absolute',
  },
  body: {
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    height: 0,
    position: 'absolute',
    width: 0,
  },
  arcPair: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  arcSegment: {
    borderBottomWidth: 0,
    borderLeftColor: 'transparent',
    borderRadius: 999,
    borderRightColor: 'transparent',
    marginVertical: 2,
  },
  centerRing: {
    borderRadius: 999,
    borderWidth: 1,
    position: 'absolute',
  },
  copy: {
    gap: 2,
  },
  copyStacked: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  titleLarge: {
    letterSpacing: -0.9,
    lineHeight: 40,
  },
  titleStacked: {
    textAlign: 'center',
  },
  subtitle: {
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  subtitleStacked: {
    textAlign: 'center',
  },
});
