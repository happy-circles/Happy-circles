import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { theme } from '@/lib/theme';

export type SurfaceCardVariant = 'default' | 'muted' | 'accent' | 'elevated';
export type SurfaceCardPadding = 'none' | 'sm' | 'md' | 'lg';
export type SurfaceCardGlassTreatment = 'standard' | 'flat' | 'flatSolid' | 'flatSoft';
export type SurfaceCardShape = 'rounded' | 'pill';

const shouldMountNativeGlass = Platform.OS === 'ios';
const hasNativeLiquidGlass = shouldMountNativeGlass && isLiquidGlassAvailable();
const standardGlassBorderColor = hasNativeLiquidGlass
  ? 'rgba(255, 255, 255, 0.72)'
  : 'rgba(255, 255, 255, 0.94)';
const fallbackGlassBorderColor = 'rgba(255, 255, 255, 0.96)';
const fallbackGlassBorderStrongColor = 'rgba(255, 255, 255, 1)';
const fallbackGlassInnerEdgeColor = 'rgba(255, 255, 255, 0.82)';
const liquidGlassPlatformStyle = Platform.select({
  web: {
    WebkitBackdropFilter: 'blur(38px) saturate(220%)',
    backdropFilter: 'blur(38px) saturate(220%)',
    boxShadow:
      '0 0 0 1px rgba(255, 255, 255, 0.84), 0 0 22px rgba(255, 255, 255, 0.54), 0 18px 28px -18px rgba(15, 23, 40, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
  },
  ios: {
    shadowColor: '#ffffff',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: hasNativeLiquidGlass ? 0 : 0.38,
    shadowRadius: hasNativeLiquidGlass ? 0 : 13,
  },
  default: {},
}) as object | undefined;
const flatGlassPlatformStyle = Platform.select({
  web: {
    WebkitBackdropFilter: 'blur(34px) saturate(210%)',
    backdropFilter: 'blur(34px) saturate(210%)',
    boxShadow:
      '0 0 0 1px rgba(255, 255, 255, 0.82), 0 0 22px rgba(255, 255, 255, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.92), inset 0 -1px 0 rgba(15, 23, 40, 0.025)',
  },
  default: {},
}) as object | undefined;
const flatGlassSoftPlatformStyle = Platform.select({
  web: {
    WebkitBackdropFilter: 'blur(30px) saturate(190%)',
    backdropFilter: 'blur(30px) saturate(190%)',
    boxShadow:
      '0 0 0 1px rgba(255, 255, 255, 0.78), 0 0 22px rgba(255, 255, 255, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.86)',
  },
  ios: {
    shadowColor: '#ffffff',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 12,
  },
  default: {},
}) as object | undefined;

const liquidGlassBackgroundColor = hasNativeLiquidGlass
  ? 'rgba(255, 255, 255, 0.12)'
  : 'rgba(255, 255, 255, 0.78)';
const liquidGlassMutedBackgroundColor = hasNativeLiquidGlass
  ? 'rgba(255, 255, 255, 0.1)'
  : 'rgba(255, 255, 255, 0.66)';
const liquidGlassAccentBackgroundColor = hasNativeLiquidGlass
  ? 'rgba(255, 255, 255, 0.11)'
  : 'rgba(255, 255, 255, 0.72)';

const flatGlassBackgroundColor = 'rgba(255, 255, 255, 0.72)';
const flatGlassMutedBackgroundColor = 'rgba(255, 255, 255, 0.62)';
const flatGlassAccentBackgroundColor = 'rgba(255, 255, 255, 0.68)';
const flatGlassSoftBackgroundColor = 'rgba(255, 255, 255, 0.68)';

function SurfaceLiquidGlassLayer({
  shape,
  treatment,
  variant,
}: {
  readonly shape: SurfaceCardShape;
  readonly treatment: SurfaceCardGlassTreatment;
  readonly variant: SurfaceCardVariant;
}) {
  const isFlat = treatment === 'flat' || treatment === 'flatSolid' || treatment === 'flatSoft';
  const isFlatSolid = treatment === 'flatSolid' || treatment === 'flatSoft';
  const isFlatSoft = treatment === 'flatSoft';
  const shouldRenderFallbackEdge = isFlat || !hasNativeLiquidGlass;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.glassLayer,
        variant === 'muted' ? styles.glassLayerMuted : null,
        variant === 'accent' ? styles.glassLayerAccent : null,
        isFlat ? styles.glassLayerFlat : null,
        isFlat && variant === 'muted' ? styles.glassLayerFlatMuted : null,
        isFlat && variant === 'accent' ? styles.glassLayerFlatAccent : null,
        isFlatSoft ? styles.glassLayerFlatSoft : null,
      ]}
    >
      {shouldMountNativeGlass && !isFlat ? (
        <GlassView
          colorScheme="light"
          glassEffectStyle="regular"
          pointerEvents="none"
          style={[styles.nativeGlass, shape === 'pill' ? styles.nativeGlassPill : null]}
          tintColor="rgba(255, 255, 255, 0.04)"
        />
      ) : null}
      {isFlat ? (
        isFlatSolid ? null : (
          <>
            <View pointerEvents="none" style={styles.flatGlassSheen} />
            <View pointerEvents="none" style={styles.flatGlassDepth} />
          </>
        )
      ) : (
        <View pointerEvents="none" style={styles.glassTopGlow} />
      )}
      {shouldRenderFallbackEdge ? (
        <View
          pointerEvents="none"
          style={[
            styles.glassInnerEdge,
            shape === 'pill' ? styles.glassInnerEdgePill : null,
            isFlatSoft ? styles.glassInnerEdgeSoft : null,
          ]}
        />
      ) : null}
    </View>
  );
}

export interface SurfaceCardProps extends PropsWithChildren {
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: SurfaceCardVariant;
  readonly padding?: SurfaceCardPadding;
  readonly glassTreatment?: SurfaceCardGlassTreatment;
  readonly shape?: SurfaceCardShape;
}

export function SurfaceCard({
  children,
  glassTreatment = 'standard',
  shape = 'rounded',
  style,
  variant = 'default',
  padding = 'md',
}: SurfaceCardProps) {
  return (
    <View
      style={[
        styles.base,
        shape === 'pill' ? styles.shapePill : null,
        variant === 'default' ? styles.default : null,
        variant === 'muted' ? styles.muted : null,
        variant === 'accent' ? styles.accent : null,
        variant === 'elevated' ? styles.elevated : null,
        glassTreatment !== 'standard' ? styles.flat : null,
        glassTreatment !== 'standard' && variant === 'muted' ? styles.flatMuted : null,
        glassTreatment !== 'standard' && variant === 'accent' ? styles.flatAccent : null,
        glassTreatment === 'flatSoft' ? styles.flatSoft : null,
        padding === 'none' ? styles.paddingNone : null,
        padding === 'sm' ? styles.paddingSm : null,
        padding === 'md' ? styles.paddingMd : null,
        padding === 'lg' ? styles.paddingLg : null,
        style,
      ]}
    >
      <SurfaceLiquidGlassLayer shape={shape} treatment={glassTreatment} variant={variant} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderColor: standardGlassBorderColor,
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    overflow: 'hidden',
    position: 'relative',
    ...liquidGlassPlatformStyle,
  },
  shapePill: {
    borderRadius: theme.radius.pill,
  },
  default: {
    backgroundColor: liquidGlassBackgroundColor,
  },
  muted: {
    backgroundColor: liquidGlassMutedBackgroundColor,
    borderColor: hasNativeLiquidGlass
      ? 'rgba(255, 255, 255, 0.6)'
      : 'rgba(255, 255, 255, 0.88)',
  },
  accent: {
    backgroundColor: liquidGlassAccentBackgroundColor,
    borderColor: hasNativeLiquidGlass
      ? 'rgba(255, 255, 255, 0.62)'
      : 'rgba(255, 255, 255, 0.9)',
  },
  elevated: {
    backgroundColor: liquidGlassBackgroundColor,
    borderColor: hasNativeLiquidGlass
      ? 'rgba(255, 255, 255, 0.72)'
      : fallbackGlassBorderColor,
  },
  flat: {
    backgroundColor: flatGlassBackgroundColor,
    borderColor: fallbackGlassBorderStrongColor,
    borderWidth: 1,
    ...flatGlassPlatformStyle,
  },
  flatMuted: {
    backgroundColor: flatGlassMutedBackgroundColor,
  },
  flatAccent: {
    backgroundColor: flatGlassAccentBackgroundColor,
  },
  flatSoft: {
    backgroundColor: flatGlassSoftBackgroundColor,
    borderColor: fallbackGlassBorderColor,
    ...flatGlassSoftPlatformStyle,
  },
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: liquidGlassBackgroundColor,
  },
  glassLayerMuted: {
    backgroundColor: liquidGlassMutedBackgroundColor,
  },
  glassLayerAccent: {
    backgroundColor: liquidGlassAccentBackgroundColor,
  },
  glassLayerFlat: {
    backgroundColor: flatGlassBackgroundColor,
  },
  glassLayerFlatMuted: {
    backgroundColor: flatGlassMutedBackgroundColor,
  },
  glassLayerFlatAccent: {
    backgroundColor: flatGlassAccentBackgroundColor,
  },
  glassLayerFlatSoft: {
    backgroundColor: flatGlassSoftBackgroundColor,
  },
  glassInnerEdge: {
    ...StyleSheet.absoluteFillObject,
    borderColor: fallbackGlassInnerEdgeColor,
    borderRadius: theme.radius.large - 1,
    borderWidth: 1,
    opacity: 0.9,
  },
  glassInnerEdgePill: {
    borderRadius: theme.radius.pill,
  },
  glassInnerEdgeSoft: {
    borderColor: 'rgba(255, 255, 255, 0.72)',
    opacity: 0.78,
  },
  nativeGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.large,
  },
  nativeGlassPill: {
    borderRadius: theme.radius.pill,
  },
  glassTopGlow: {
    backgroundColor: hasNativeLiquidGlass
      ? 'rgba(255, 255, 255, 0.22)'
      : 'rgba(255, 255, 255, 0.76)',
    borderRadius: theme.radius.pill,
    height: 8,
    left: 14,
    opacity: hasNativeLiquidGlass ? 0.42 : 0.92,
    position: 'absolute',
    right: 14,
    top: 5,
  },
  flatGlassSheen: {
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: theme.radius.pill,
    height: 10,
    left: theme.spacing.md,
    opacity: 0.8,
    position: 'absolute',
    right: theme.spacing.md,
    top: 6,
  },
  flatGlassDepth: {
    backgroundColor: 'rgba(15, 23, 40, 0.022)',
    bottom: 0,
    height: '44%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  paddingNone: {
    padding: 0,
  },
  paddingSm: {
    padding: theme.spacing.sm,
  },
  paddingMd: {
    padding: theme.spacing.md,
  },
  paddingLg: {
    padding: theme.spacing.lg,
  },
});
