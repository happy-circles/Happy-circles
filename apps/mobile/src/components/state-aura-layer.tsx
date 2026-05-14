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
};

const AURA_SIZE_CONFIGS: Record<StateAuraSize, AuraConfig> = {
  compact: {
    fillOpacity: 0.3,
  },
  hero: {
    fillOpacity: 0.15,
  },
  large: {
    fillOpacity: 0.15,
  },
  regular: {
    fillOpacity: 0.3,
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
    ...StyleSheet.absoluteFillObject,
  },
});
