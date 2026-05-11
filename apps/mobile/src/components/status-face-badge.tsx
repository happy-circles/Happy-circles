import Svg, { Circle, Path } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

import { theme } from '@/lib/theme';

type StatusFaceTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'cycle';
type StatusFaceMood = 'happy' | 'pending' | 'sad' | 'softSad';

const CYCLE_BLUE = '#2563eb';
const CYCLE_BLUE_SOFT = '#eaf1ff';

export interface StatusFaceBadgeProps {
  readonly compact?: boolean;
  readonly label: string;
  readonly size?: number;
  readonly tone?: StatusFaceTone;
}

function statusFaceVisual(
  label: string,
  tone: StatusFaceTone,
): {
  readonly backgroundColor: string;
  readonly color: string;
  readonly mood: StatusFaceMood;
} {
  const normalized = label.toLocaleLowerCase('es-CO');
  const isRejected =
    tone === 'danger' ||
    normalized.includes('rechaz') ||
    normalized.includes('cancel') ||
    normalized.includes('no acept') ||
    normalized.includes('no complet') ||
    normalized.includes('no aprob');
  const isExpired = normalized.includes('expir');
  const isOwnPending =
    tone === 'warning' ||
    normalized.includes('necesita') ||
    normalized.includes('requiere') ||
    normalized.includes('por aprobar') ||
    normalized.includes('por responder') ||
    normalized.includes('por verificar');
  const isWaiting =
    normalized.includes('esperando') ||
    normalized.includes('en espera') ||
    normalized.includes('pendiente');
  const isReady =
    tone === 'primary' ||
    tone === 'cycle' ||
    normalized.includes('listo') ||
    normalized.includes('aprobado');
  const isCompleted =
    tone === 'success' ||
    normalized.includes('realiz') ||
    normalized.includes('completado') ||
    normalized.includes('completo') ||
    normalized.includes('registr') ||
    normalized.includes('acept');

  if (normalized.includes('reemplaz')) {
    return {
      backgroundColor: theme.colors.surfaceSoft,
      color: theme.colors.textMuted,
      mood: 'softSad',
    };
  }

  if (isExpired) {
    return {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
      mood: 'softSad',
    };
  }

  if (isRejected) {
    return {
      backgroundColor: theme.colors.dangerSoft,
      color: theme.colors.danger,
      mood: 'sad',
    };
  }

  if (isCompleted) {
    return {
      backgroundColor: theme.colors.successSoft,
      color: theme.colors.success,
      mood: 'happy',
    };
  }

  if (isOwnPending) {
    return {
      backgroundColor: theme.colors.warningSoft,
      color: theme.colors.warning,
      mood: 'pending',
    };
  }

  if (isWaiting) {
    return {
      backgroundColor: theme.colors.surfaceSoft,
      color: theme.colors.textMuted,
      mood: 'pending',
    };
  }

  if (isReady) {
    return {
      backgroundColor: CYCLE_BLUE_SOFT,
      color: CYCLE_BLUE,
      mood: 'pending',
    };
  }

  return {
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.textMuted,
    mood: 'pending',
  };
}

function mouthPath(mood: StatusFaceMood): string {
  if (mood === 'happy') {
    return 'M 7 13.8 Q 12 18 17 13.8';
  }

  if (mood === 'sad') {
    return 'M 7 17 Q 12 12.6 17 17';
  }

  if (mood === 'softSad') {
    return 'M 7.5 16 Q 12 13.8 16.5 16';
  }

  return 'M 8 15 L 16 15';
}

export function StatusFaceBadge({
  compact = false,
  label,
  size,
  tone = 'neutral',
}: StatusFaceBadgeProps) {
  const visual = statusFaceVisual(label, tone);
  const badgeSize = size ?? (compact ? 22 : 30);
  const iconSize = Math.round(badgeSize * 0.76);

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      style={[
        styles.badge,
        {
          backgroundColor: visual.backgroundColor,
          height: badgeSize,
          width: badgeSize,
        },
      ]}
    >
      <Svg height={iconSize} viewBox="0 0 24 24" width={iconSize}>
        <Circle cx={12} cy={12} fill="none" r={9.2} stroke={visual.color} strokeWidth={1.7} />
        <Circle cx={8.6} cy={9.7} fill={visual.color} r={1.35} />
        <Circle cx={15.4} cy={9.7} fill={visual.color} r={1.35} />
        <Path
          d={mouthPath(visual.mood)}
          fill="none"
          stroke={visual.color}
          strokeLinecap="round"
          strokeWidth={1.7}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    flexShrink: 0,
    justifyContent: 'center',
  },
});
