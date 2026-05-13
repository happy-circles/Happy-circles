import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, View } from 'react-native';

import {
  cardStateColor,
  type CardHaloIntensity,
  type CardStateIntent,
  type CardStatusTone,
} from '@/lib/card-language';
import { theme } from '@/lib/theme';
import { useAppTheme } from '@/providers/theme-provider';

const canUseNativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

export interface LiquidGlassDiscProps {
  readonly color?: string;
  readonly intensity?: CardHaloIntensity;
  readonly intent?: CardStateIntent;
  readonly size: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly tone?: CardStatusTone;
}

export function LiquidGlassDisc({
  color,
  intensity = 'strong',
  intent = 'neutral',
  size,
  style,
  tone,
}: LiquidGlassDiscProps) {
  const activeTheme = useAppTheme();

  if (intensity === 'none') {
    return null;
  }

  const resolvedColor = color ?? cardStateColor(intent, tone);
  const isSoft = intensity === 'soft';
  const glassTint = isSoft ? activeTheme.glass.softTint : activeTheme.glass.tint;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.disc,
        {
          height: size,
          width: size,
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.solidFill, { backgroundColor: resolvedColor }]} />
      {canUseNativeGlass ? (
        <GlassView
          colorScheme={activeTheme.scheme}
          glassEffectStyle="regular"
          pointerEvents="none"
          style={styles.nativeGlass}
          tintColor={glassTint}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          styles.sheen,
          { backgroundColor: activeTheme.glass.discSheen },
          isSoft ? styles.sheenSoft : null,
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.edge,
          { borderColor: isSoft ? activeTheme.glass.softEdge : activeTheme.glass.strongEdge },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    justifyContent: 'center',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  solidFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.pill,
  },
  nativeGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.pill,
  },
  sheen: {
    borderRadius: theme.radius.pill,
    height: '32%',
    left: '18%',
    opacity: 0.66,
    position: 'absolute',
    right: '18%',
    top: '12%',
  },
  sheenSoft: {
    opacity: 0.42,
  },
  edge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
});
