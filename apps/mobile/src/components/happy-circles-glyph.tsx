import { useId } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';

import { getRuntimeTheme, theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

const GLYPH_VIEW_BOX = '120 120 440 440';

export type HappyCirclesTone = 'brand' | 'mono';

export interface HappyCirclesGlyphProps {
  readonly accessibilityLabel?: string;
  readonly color?: string;
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly tone?: HappyCirclesTone;
}

export interface HappyCirclesPalette {
  readonly navy: string;
  readonly green: string;
  readonly coral: string;
  readonly face: string;
  readonly faceDetail: string;
}

export function resolveHappyCirclesPalette(
  tone: HappyCirclesTone = 'brand',
  color: string = theme.colors.text,
): HappyCirclesPalette {
  const activeTheme = getRuntimeTheme();

  if (tone === 'mono') {
    return {
      navy: color,
      green: color,
      coral: color,
      face: color,
      faceDetail: activeTheme.colors.white,
    };
  }

  return {
    navy: activeTheme.colors.brandNavy,
    green: activeTheme.colors.brandGreen,
    coral: activeTheme.colors.brandCoral,
    face: activeTheme.colors.brandGreen,
    faceDetail: activeTheme.colors.white,
  };
}

function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/:/g, '')}`;
}

export function HappyCirclesOuterSvg({
  maskId,
  palette,
  size,
}: {
  readonly maskId: string;
  readonly palette: HappyCirclesPalette;
  readonly size: number;
}) {
  return (
    <Svg height={size} viewBox={GLYPH_VIEW_BOX} width={size}>
      <Defs>
        <Mask height="440" id={maskId} maskUnits="userSpaceOnUse" width="440" x="120" y="120">
          <Rect fill="white" height="440" width="440" x="120" y="120" />
          <Circle cx="182" cy="340" fill="black" r="48" />
          <Circle cx="340" cy="182" fill="black" r="48" />
          <Circle cx="498" cy="340" fill="black" r="48" />
          <Circle cx="340" cy="498" fill="black" r="48" />
        </Mask>
      </Defs>
      <G mask={`url(#${maskId})`}>
        <Path
          d="M 215 340 A 125 125 0 0 1 465 340"
          fill="none"
          stroke={palette.navy}
          strokeLinecap="round"
          strokeWidth="40"
        />
        <Path
          d="M 215 340 A 125 125 0 0 0 340 465"
          fill="none"
          stroke={palette.green}
          strokeLinecap="round"
          strokeWidth="40"
        />
        <Path
          d="M 465 340 A 125 125 0 0 1 340 465"
          fill="none"
          stroke={palette.coral}
          strokeLinecap="round"
          strokeWidth="40"
        />
      </G>
      <Circle cx="182" cy="340" fill={palette.green} r="34" />
      <Circle cx="340" cy="182" fill={palette.navy} r="34" />
      <Circle cx="498" cy="340" fill={palette.coral} r="34" />
      <Circle cx="340" cy="498" fill={palette.navy} r="34" />
    </Svg>
  );
}

export function HappyCirclesCenterSvg({
  palette,
  size,
  viewBox = GLYPH_VIEW_BOX,
  wink = false,
}: {
  readonly palette: HappyCirclesPalette;
  readonly size: number;
  readonly viewBox?: string;
  readonly wink?: boolean;
}) {
  return (
    <Svg height={size} viewBox={viewBox} width={size}>
      <Circle cx="340" cy="340" fill={palette.face} r="50" />
      <Circle cx="325" cy="331" fill={palette.faceDetail} r="7" />
      {wink ? (
        <Path
          d="M 348 331 Q 355 326 362 331"
          fill="none"
          stroke={palette.faceDetail}
          strokeLinecap="round"
          strokeWidth="6.5"
        />
      ) : (
        <Circle cx="355" cy="331" fill={palette.faceDetail} r="7" />
      )}
      <Path
        d="M 320 349 Q 340 369 360 349"
        fill="none"
        stroke={palette.faceDetail}
        strokeLinecap="round"
        strokeWidth="6.5"
      />
    </Svg>
  );
}

export function HappyCirclesTopPieceSvg({
  maskId,
  palette,
  size,
}: {
  readonly maskId: string;
  readonly palette: HappyCirclesPalette;
  readonly size: number;
}) {
  return (
    <Svg height={size} viewBox={GLYPH_VIEW_BOX} width={size}>
      <Defs>
        <Mask height="440" id={maskId} maskUnits="userSpaceOnUse" width="440" x="120" y="120">
          <Rect fill="white" height="440" width="440" x="120" y="120" />
          <Circle cx="182" cy="340" fill="black" r="48" />
          <Circle cx="340" cy="182" fill="black" r="48" />
          <Circle cx="498" cy="340" fill="black" r="48" />
        </Mask>
      </Defs>
      <G mask={`url(#${maskId})`}>
        <Path
          d="M 215 340 A 125 125 0 0 1 465 340"
          fill="none"
          stroke={palette.navy}
          strokeLinecap="round"
          strokeWidth="40"
        />
      </G>
      <Circle cx="340" cy="182" fill={palette.navy} r="34" />
    </Svg>
  );
}

export function HappyCirclesLeftPieceSvg({
  maskId,
  palette,
  size,
}: {
  readonly maskId: string;
  readonly palette: HappyCirclesPalette;
  readonly size: number;
}) {
  return (
    <Svg height={size} viewBox={GLYPH_VIEW_BOX} width={size}>
      <Defs>
        <Mask height="440" id={maskId} maskUnits="userSpaceOnUse" width="440" x="120" y="120">
          <Rect fill="white" height="440" width="440" x="120" y="120" />
          <Circle cx="182" cy="340" fill="black" r="48" />
          <Circle cx="340" cy="498" fill="black" r="48" />
        </Mask>
      </Defs>
      <G mask={`url(#${maskId})`}>
        <Path
          d="M 215 340 A 125 125 0 0 0 340 465"
          fill="none"
          stroke={palette.green}
          strokeLinecap="round"
          strokeWidth="40"
        />
      </G>
      <Circle cx="182" cy="340" fill={palette.green} r="34" />
    </Svg>
  );
}

export function HappyCirclesRightPieceSvg({
  maskId,
  palette,
  size,
}: {
  readonly maskId: string;
  readonly palette: HappyCirclesPalette;
  readonly size: number;
}) {
  return (
    <Svg height={size} viewBox={GLYPH_VIEW_BOX} width={size}>
      <Defs>
        <Mask height="440" id={maskId} maskUnits="userSpaceOnUse" width="440" x="120" y="120">
          <Rect fill="white" height="440" width="440" x="120" y="120" />
          <Circle cx="498" cy="340" fill="black" r="48" />
          <Circle cx="340" cy="498" fill="black" r="48" />
        </Mask>
      </Defs>
      <G mask={`url(#${maskId})`}>
        <Path
          d="M 465 340 A 125 125 0 0 1 340 465"
          fill="none"
          stroke={palette.coral}
          strokeLinecap="round"
          strokeWidth="40"
        />
      </G>
      <Circle cx="498" cy="340" fill={palette.coral} r="34" />
    </Svg>
  );
}

export function HappyCirclesBottomPieceSvg({
  palette,
  size,
}: {
  readonly palette: HappyCirclesPalette;
  readonly size: number;
}) {
  return (
    <Svg height={size} viewBox={GLYPH_VIEW_BOX} width={size}>
      <Circle cx="340" cy="498" fill={palette.navy} r="34" />
    </Svg>
  );
}

export function HappyCirclesGlyph({
  accessibilityLabel = 'Happy Circles',
  color,
  size = 74,
  style,
  tone = 'brand',
}: HappyCirclesGlyphProps) {
  const activeTheme = useAppTheme();
  const palette =
    tone === 'mono'
      ? {
          navy: color ?? activeTheme.colors.text,
          green: color ?? activeTheme.colors.text,
          coral: color ?? activeTheme.colors.text,
          face: color ?? activeTheme.colors.text,
          faceDetail: activeTheme.colors.white,
        }
      : {
          navy: activeTheme.colors.brandNavy,
          green: activeTheme.colors.brandGreen,
          coral: activeTheme.colors.brandCoral,
          face: activeTheme.colors.brandGreen,
          faceDetail: activeTheme.colors.white,
        };
  const maskId = useSvgId('happy-circles-head-gaps');

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[{ height: size, width: size }, style]}
    >
      <HappyCirclesOuterSvg maskId={maskId} palette={palette} size={size} />
      <View style={{ height: size, left: 0, position: 'absolute', top: 0, width: size }}>
        <HappyCirclesCenterSvg palette={palette} size={size} />
      </View>
    </View>
  );
}
