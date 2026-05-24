import type { PropsWithChildren, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { theme, type AppTheme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

export type SurfaceCardVariant = 'default' | 'muted' | 'accent' | 'elevated';
export type SurfaceCardPadding = 'none' | 'sm' | 'md' | 'lg';
export type SurfaceCardGlassTreatment = 'standard' | 'flat' | 'flatSolid' | 'flatSoft';
export type SurfaceCardShape = 'rounded' | 'pill';

const shouldMountNativeGlass = Platform.OS === 'ios';
const hasNativeLiquidGlass = shouldMountNativeGlass && isLiquidGlassAvailable();
const shouldUseAndroidGlassFallback = Platform.OS === 'android';

function SurfaceLiquidGlassLayer({
  activeTheme,
  shape,
  treatment,
  variant,
}: {
  readonly activeTheme: AppTheme;
  readonly shape: SurfaceCardShape;
  readonly treatment: SurfaceCardGlassTreatment;
  readonly variant: SurfaceCardVariant;
}) {
  const isFlat = treatment === 'flat' || treatment === 'flatSolid' || treatment === 'flatSoft';
  const isFlatSolid = treatment === 'flatSolid' || treatment === 'flatSoft';
  const isFlatSoft = treatment === 'flatSoft';
  const shouldRenderFallbackEdge =
    !shouldUseAndroidGlassFallback && (isFlat || !hasNativeLiquidGlass);
  const shouldRenderFallbackDepth =
    !shouldUseAndroidGlassFallback &&
    !hasNativeLiquidGlass &&
    (treatment === 'standard' || treatment === 'flatSoft');

  return (
    <View
      pointerEvents="none"
      style={[
        styles.glassLayer,
        shape === 'pill' ? styles.glassLayerPill : null,
        { backgroundColor: resolveGlassBackgroundColor(activeTheme, treatment, variant) },
      ]}
    >
      {shouldMountNativeGlass && !isFlat ? (
        <GlassView
          colorScheme={activeTheme.scheme}
          glassEffectStyle="regular"
          pointerEvents="none"
          style={[styles.nativeGlass, shape === 'pill' ? styles.nativeGlassPill : null]}
          tintColor={activeTheme.glass.tint}
        />
      ) : null}
      {isFlat ? (
        isFlatSolid ? null : (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.flatGlassSheen,
                {
                  backgroundColor: activeTheme.glass.flatSheen,
                  opacity: activeTheme.glass.flatSheenOpacity,
                },
              ]}
            />
            {!shouldUseAndroidGlassFallback ? (
              <View
                pointerEvents="none"
                style={[styles.flatGlassDepth, { backgroundColor: activeTheme.glass.flatDepth }]}
              />
            ) : null}
          </>
        )
      ) : !shouldUseAndroidGlassFallback ? (
        <View
          pointerEvents="none"
          style={[
            styles.glassTopGlow,
            {
              backgroundColor: hasNativeLiquidGlass
                ? activeTheme.glass.nativeTopGlow
                : activeTheme.glass.topGlow,
              opacity: hasNativeLiquidGlass
                ? activeTheme.glass.nativeTopGlowOpacity
                : activeTheme.glass.topGlowOpacity,
            },
          ]}
        />
      ) : null}
      {shouldRenderFallbackDepth ? (
        <View
          pointerEvents="none"
          style={[
            styles.fallbackGlassDepth,
            {
              backgroundColor: activeTheme.glass.fallbackDepth,
              opacity: activeTheme.glass.fallbackDepthOpacity,
            },
          ]}
        />
      ) : null}
      {shouldRenderFallbackEdge ? (
        <View
          pointerEvents="none"
          style={[
            styles.glassInnerEdge,
            {
              borderColor: isFlatSoft
                ? activeTheme.glass.softEdge
                : activeTheme.glass.fallbackInnerEdge,
              opacity: isFlatSoft
                ? activeTheme.glass.softInnerEdgeOpacity
                : activeTheme.glass.innerEdgeOpacity,
            },
            shape === 'pill' ? styles.glassInnerEdgePill : null,
          ]}
        />
      ) : null}
    </View>
  );
}

function resolveGlassBackgroundColor(
  activeTheme: AppTheme,
  treatment: SurfaceCardGlassTreatment,
  variant: SurfaceCardVariant,
) {
  if (shouldUseAndroidGlassFallback) {
    if (variant === 'muted') {
      return activeTheme.colors.surfaceMuted;
    }

    if (variant === 'accent') {
      return activeTheme.colors.surfaceSoft;
    }

    if (variant === 'elevated' || treatment === 'flatSoft') {
      return activeTheme.colors.elevated;
    }

    return activeTheme.colors.surface;
  }

  if (treatment === 'flatSoft') {
    return activeTheme.glass.flatSoftBackground;
  }

  if (treatment !== 'standard') {
    if (variant === 'muted') {
      return activeTheme.glass.flatMutedBackground;
    }

    if (variant === 'accent') {
      return activeTheme.glass.flatAccentBackground;
    }

    return activeTheme.glass.flatBackground;
  }

  if (variant === 'muted') {
    return hasNativeLiquidGlass
      ? activeTheme.glass.nativeMutedBackground
      : activeTheme.glass.mutedBackground;
  }

  if (variant === 'accent') {
    return hasNativeLiquidGlass
      ? activeTheme.glass.nativeAccentBackground
      : activeTheme.glass.accentBackground;
  }

  return hasNativeLiquidGlass ? activeTheme.glass.nativeBackground : activeTheme.glass.background;
}

function resolveGlassBorderColor(
  activeTheme: AppTheme,
  treatment: SurfaceCardGlassTreatment,
  variant: SurfaceCardVariant,
) {
  if (shouldUseAndroidGlassFallback) {
    return variant === 'elevated' ? activeTheme.colors.border : activeTheme.colors.hairline;
  }

  if (treatment === 'flatSoft') {
    return activeTheme.glass.fallbackBorder;
  }

  if (treatment !== 'standard') {
    return activeTheme.glass.fallbackBorderStrong;
  }

  if (variant === 'muted') {
    return hasNativeLiquidGlass
      ? activeTheme.glass.nativeMutedBorder
      : activeTheme.glass.mutedBorder;
  }

  if (variant === 'accent') {
    return hasNativeLiquidGlass
      ? activeTheme.glass.nativeAccentBorder
      : activeTheme.glass.accentBorder;
  }

  if (variant === 'elevated') {
    return hasNativeLiquidGlass
      ? activeTheme.glass.nativeStandardBorder
      : activeTheme.glass.fallbackBorder;
  }

  return hasNativeLiquidGlass
    ? activeTheme.glass.nativeStandardBorder
    : activeTheme.glass.standardBorder;
}

function resolveGlassPlatformStyle(activeTheme: AppTheme, treatment: SurfaceCardGlassTreatment) {
  if (treatment === 'flatSoft') {
    return Platform.select({
      web: {
        WebkitBackdropFilter: 'blur(30px) saturate(190%)',
        backdropFilter: 'blur(30px) saturate(190%)',
        boxShadow: activeTheme.glass.flatSoftWebShadow,
      },
      ios: {
        shadowColor: activeTheme.glass.shadowColor,
        shadowOffset: { height: 8, width: 0 },
        shadowOpacity: activeTheme.glass.flatSoftShadowOpacity,
        shadowRadius: activeTheme.glass.flatSoftShadowRadius,
      },
      default: {
        elevation: 1,
        shadowColor: activeTheme.glass.shadowColor,
      },
    }) as object | undefined;
  }

  if (treatment !== 'standard') {
    return Platform.select({
      web: {
        WebkitBackdropFilter: 'blur(34px) saturate(210%)',
        backdropFilter: 'blur(34px) saturate(210%)',
        boxShadow: activeTheme.glass.flatWebShadow,
      },
      ios: {
        shadowColor: activeTheme.glass.shadowColor,
        shadowOffset: { height: 7, width: 0 },
        shadowOpacity: activeTheme.glass.flatSoftShadowOpacity,
        shadowRadius: activeTheme.glass.flatSoftShadowRadius,
      },
      default: {
        elevation: 1,
        shadowColor: activeTheme.glass.shadowColor,
      },
    }) as object | undefined;
  }

  return Platform.select({
    web: {
      WebkitBackdropFilter: 'blur(38px) saturate(220%)',
      backdropFilter: 'blur(38px) saturate(220%)',
      boxShadow: activeTheme.glass.webShadow,
    },
    ios: {
      shadowColor: activeTheme.glass.shadowColor,
      shadowOffset: { height: hasNativeLiquidGlass ? 0 : 10, width: 0 },
      shadowOpacity: hasNativeLiquidGlass ? 0 : activeTheme.glass.shadowOpacity,
      shadowRadius: hasNativeLiquidGlass ? 0 : activeTheme.glass.shadowRadius,
    },
    default: {
      elevation: 2,
      shadowColor: activeTheme.glass.shadowColor,
    },
  }) as object | undefined;
}

export interface SurfaceCardProps extends PropsWithChildren {
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: SurfaceCardVariant;
  readonly padding?: SurfaceCardPadding;
  readonly glassTreatment?: SurfaceCardGlassTreatment;
  readonly shape?: SurfaceCardShape;
  readonly underlay?: ReactNode;
}

export function SurfaceCard({
  children,
  glassTreatment = 'standard',
  shape = 'rounded',
  style,
  underlay,
  variant = 'default',
  padding = 'md',
}: SurfaceCardProps) {
  const activeTheme = useAppTheme();
  const glassBackgroundColor = resolveGlassBackgroundColor(activeTheme, glassTreatment, variant);
  const glassBorderColor = resolveGlassBorderColor(activeTheme, glassTreatment, variant);
  const glassPlatformStyle = resolveGlassPlatformStyle(activeTheme, glassTreatment);
  const shouldRenderAndroidUnderlayTint = shouldUseAndroidGlassFallback && Boolean(underlay);

  return (
    <View
      style={[
        styles.base,
        glassPlatformStyle,
        { backgroundColor: glassBackgroundColor, borderColor: glassBorderColor },
        shape === 'pill' ? styles.shapePill : null,
        glassTreatment !== 'standard' ? styles.flat : null,
        padding === 'none' ? styles.paddingNone : null,
        padding === 'sm' ? styles.paddingSm : null,
        padding === 'md' ? styles.paddingMd : null,
        padding === 'lg' ? styles.paddingLg : null,
        style,
      ]}
    >
      {underlay ? (
        <View
          pointerEvents="none"
          style={[styles.underlay, shape === 'pill' ? styles.underlayPill : null]}
        >
          {underlay}
        </View>
      ) : null}
      <SurfaceLiquidGlassLayer
        activeTheme={activeTheme}
        shape={shape}
        treatment={glassTreatment}
        variant={variant}
      />
      {shouldRenderAndroidUnderlayTint ? (
        <View
          pointerEvents="none"
          style={[styles.androidUnderlayTint, shape === 'pill' ? styles.underlayPill : null]}
        >
          {underlay}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.large,
    borderWidth: 1,
    gap: theme.spacing.sm,
    overflow: 'visible',
    position: 'relative',
  },
  shapePill: {
    borderRadius: theme.radius.pill,
  },
  underlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.large,
    overflow: 'hidden',
  },
  underlayPill: {
    borderRadius: theme.radius.pill,
  },
  androidUnderlayTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.large,
    opacity: 0.62,
    overflow: 'hidden',
  },
  flat: {
    borderWidth: 1,
  },
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.large,
    overflow: 'hidden',
  },
  glassLayerPill: {
    borderRadius: theme.radius.pill,
  },
  glassInnerEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.large - 1,
    borderWidth: 1,
  },
  glassInnerEdgePill: {
    borderRadius: theme.radius.pill,
  },
  nativeGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.large,
  },
  nativeGlassPill: {
    borderRadius: theme.radius.pill,
  },
  glassTopGlow: {
    borderRadius: theme.radius.pill,
    height: 8,
    left: 14,
    position: 'absolute',
    right: 14,
    top: 5,
  },
  flatGlassSheen: {
    borderRadius: theme.radius.pill,
    height: 10,
    left: theme.spacing.md,
    position: 'absolute',
    right: theme.spacing.md,
    top: 6,
  },
  flatGlassDepth: {
    bottom: 0,
    height: '44%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  fallbackGlassDepth: {
    bottom: 0,
    height: '48%',
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
