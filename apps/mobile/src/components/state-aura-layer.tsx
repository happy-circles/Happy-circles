import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { CardStateIntent } from '@/lib/card-language';
import { theme } from '@/lib/theme';

export type StateAuraVariant =
  | 'newCircle'
  | 'needsAction'
  | 'waiting'
  | 'ready'
  | 'completed'
  | 'rejected'
  | 'muted';
export type StateAuraSize = 'compact' | 'regular' | 'large' | 'hero';
export type StateAuraIntensity = 'hero' | 'active' | 'calm' | 'history';
export type StateAuraTone =
  | 'warning'
  | 'danger'
  | 'success'
  | 'cycle'
  | 'primary'
  | 'neutral'
  | 'muted'
  | null
  | undefined;

type AuraConfig = {
  readonly fillOpacity: number;
  readonly highlightHeight: number;
  readonly highlightOpacity: number;
  readonly massHeight: number;
  readonly massOpacity: number;
  readonly massWidth: number;
  readonly secondaryHeight: number;
  readonly secondaryOpacity: number;
  readonly secondaryWidth: number;
};

const AURA_SIZE_CONFIGS: Record<StateAuraSize, AuraConfig> = {
  compact: {
    fillOpacity: 0.034,
    highlightHeight: 74,
    highlightOpacity: 0.09,
    massHeight: 152,
    massOpacity: 0.13,
    massWidth: 286,
    secondaryHeight: 96,
    secondaryOpacity: 0.08,
    secondaryWidth: 170,
  },
  hero: {
    fillOpacity: 0.12,
    highlightHeight: 132,
    highlightOpacity: 0.24,
    massHeight: 250,
    massOpacity: 0.34,
    massWidth: 470,
    secondaryHeight: 176,
    secondaryOpacity: 0.2,
    secondaryWidth: 286,
  },
  large: {
    fillOpacity: 0.084,
    highlightHeight: 108,
    highlightOpacity: 0.18,
    massHeight: 218,
    massOpacity: 0.26,
    massWidth: 386,
    secondaryHeight: 148,
    secondaryOpacity: 0.16,
    secondaryWidth: 238,
  },
  regular: {
    fillOpacity: 0.054,
    highlightHeight: 86,
    highlightOpacity: 0.12,
    massHeight: 178,
    massOpacity: 0.18,
    massWidth: 320,
    secondaryHeight: 118,
    secondaryOpacity: 0.11,
    secondaryWidth: 196,
  },
};

export function stateAuraColorForVariant(variant: StateAuraVariant): string {
  if (variant === 'newCircle') {
    return theme.colors.treasure;
  }

  if (variant === 'needsAction') {
    return theme.colors.pending;
  }

  if (variant === 'completed') {
    return theme.colors.success;
  }

  if (variant === 'rejected') {
    return theme.colors.danger;
  }

  if (variant === 'muted') {
    return theme.colors.textMuted;
  }

  return theme.colors.cycle;
}

export function stateAuraVariantFromTone(tone: StateAuraTone): StateAuraVariant {
  if (tone === 'warning') {
    return 'needsAction';
  }

  if (tone === 'danger') {
    return 'rejected';
  }

  if (tone === 'success') {
    return 'completed';
  }

  if (tone === 'cycle' || tone === 'primary') {
    return 'ready';
  }

  if (tone === 'neutral' || tone == null) {
    return 'waiting';
  }

  return 'muted';
}

export function stateAuraVariantFromIntent(
  intent: CardStateIntent,
  tone?: StateAuraTone,
): StateAuraVariant {
  if (intent === 'needsAction') {
    return 'needsAction';
  }

  if (intent === 'completed') {
    return 'completed';
  }

  if (intent === 'negative' || intent === 'expired') {
    return 'rejected';
  }

  if (intent === 'ready') {
    return 'ready';
  }

  if (intent === 'stale') {
    return 'muted';
  }

  if (intent === 'waiting') {
    return 'waiting';
  }

  return stateAuraVariantFromTone(tone);
}

function sizeFromLegacyIntensity(intensity: StateAuraIntensity | undefined): StateAuraSize {
  if (intensity === 'hero') {
    return 'hero';
  }

  if (intensity === 'active') {
    return 'large';
  }

  if (intensity === 'history') {
    return 'compact';
  }

  return 'regular';
}

function stateAuraOpacityMultiplier(variant: StateAuraVariant): number {
  if (variant === 'newCircle') {
    return 1.18;
  }

  if (variant === 'needsAction') {
    return 1.08;
  }

  if (variant === 'ready' || variant === 'completed') {
    return 0.94;
  }

  if (variant === 'rejected') {
    return 1;
  }

  if (variant === 'muted') {
    return 0.48;
  }

  return 0.72;
}

export function StateAuraLayer({
  color,
  intensity,
  size,
  style,
  variant = 'waiting',
}: {
  readonly color?: string;
  readonly intensity?: StateAuraIntensity;
  readonly size?: StateAuraSize;
  readonly style?: StyleProp<ViewStyle>;
  readonly variant?: StateAuraVariant;
}) {
  const auraColor = color ?? stateAuraColorForVariant(variant);
  const config = AURA_SIZE_CONFIGS[size ?? sizeFromLegacyIntensity(intensity)];
  const opacityMultiplier = stateAuraOpacityMultiplier(variant);

  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.softFill,
          { backgroundColor: auraColor, opacity: config.fillOpacity * opacityMultiplier },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.baseAura,
          {
            backgroundColor: auraColor,
            height: config.massHeight,
            marginLeft: -config.massWidth / 2,
            opacity: config.massOpacity * opacityMultiplier,
            width: config.massWidth,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.sideAura,
          {
            backgroundColor: auraColor,
            height: config.secondaryHeight,
            opacity: config.secondaryOpacity * opacityMultiplier,
            width: config.secondaryWidth,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.highlightAura,
          {
            backgroundColor: auraColor,
            height: config.highlightHeight,
            opacity: config.highlightOpacity * opacityMultiplier,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  softFill: {
    borderRadius: theme.radius.large - 6,
    bottom: 8,
    left: 9,
    position: 'absolute',
    right: 9,
    top: 8,
  },
  baseAura: {
    borderBottomLeftRadius: 160,
    borderBottomRightRadius: 116,
    borderTopLeftRadius: 210,
    borderTopRightRadius: 150,
    left: '52%',
    position: 'absolute',
    top: '26%',
    transform: [{ rotate: '-8deg' }, { scaleX: 1.08 }, { scaleY: 0.96 }],
  },
  sideAura: {
    borderBottomLeftRadius: 92,
    borderBottomRightRadius: 160,
    borderTopLeftRadius: 128,
    borderTopRightRadius: 82,
    left: '6%',
    position: 'absolute',
    top: '12%',
    transform: [{ rotate: '17deg' }, { scaleX: 1.14 }],
  },
  highlightAura: {
    borderBottomLeftRadius: 140,
    borderBottomRightRadius: 80,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 180,
    left: '18%',
    position: 'absolute',
    right: '14%',
    top: 0,
    transform: [{ rotate: '-13deg' }],
  },
});
